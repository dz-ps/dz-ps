import Foundation
import HostCore
import Logging

/// Um assinante (WebSocket de vídeo). Fila com controle de backpressure:
/// se acumular mais que `maxPending` mensagens, descarta P-frames até o próximo keyframe
/// (nunca manda um P-frame depois de um descarte).
final class VideoSubscriber: @unchecked Sendable {
    let id = UUID()
    let stream: AsyncStream<[UInt8]>
    private let continuation: AsyncStream<[UInt8]>.Continuation
    private let lock = NSLock()
    private var pending = 0
    private var waitingKeyframe = true
    private let maxPending: Int
    private(set) var dropped = 0

    init(maxPending: Int = 3) {
        self.maxPending = maxPending
        (stream, continuation) = AsyncStream.makeStream(of: [UInt8].self, bufferingPolicy: .unbounded)
    }

    /// Retorna `true` se o assinante precisa de um keyframe.
    func offer(_ msg: [UInt8], isConfig: Bool, isKey: Bool) -> Bool {
        lock.lock(); defer { lock.unlock() }
        if !isConfig {
            if waitingKeyframe && !isKey { dropped += 1; return true }
            if !isKey && pending >= maxPending {
                waitingKeyframe = true
                dropped += 1
                return true
            }
            if isKey { waitingKeyframe = false }
        }
        pending += 1
        continuation.yield(msg)
        return false
    }

    func didSend() { lock.withLock { pending -= 1 } }
    func finish() { continuation.finish() }
}

/// Fan-out de um stream para os assinantes. Chamado da thread do encoder: só locks, sem await.
final class StreamFanout: @unchecked Sendable {
    let displayId: Int
    private let lock = NSLock()
    private var subscribers: [UUID: VideoSubscriber] = [:]
    private var seq: UInt32 = 0
    private var lastKeyRequest = Date.distantPast
    var requestKeyframe: @Sendable () -> Void = {}

    init(displayId: Int) { self.displayId = displayId }

    var count: Int { lock.withLock { subscribers.count } }

    func add(_ s: VideoSubscriber) { lock.withLock { subscribers[s.id] = s } }
    func remove(_ s: VideoSubscriber) { _ = lock.withLock { subscribers.removeValue(forKey: s.id) } }

    func publish(_ unit: EncodedUnit) {
        let (msg, isConfig, isKey): ([UInt8], Bool, Bool)
        let did = UInt16(truncatingIfNeeded: displayId)
        let subs: [VideoSubscriber] = lock.withLock {
            seq &+= 1
            return Array(subscribers.values)
        }
        let s = lock.withLock { seq }
        switch unit {
        case let .config(c, t):
            msg = VideoProtocol.encode(VideoHeader(type: .config, displayId: did, flags: .keyframe, seq: s, captureTimeUs: t, sendTimeUs: 0), payload: VideoProtocol.encodeConfig(c))
            isConfig = true; isKey = true
        case let .frame(data, key, rep, t):
            var f: VideoFlags = []
            if key { f.insert(.keyframe) }
            if rep { f.insert(.repeatFrame) }
            msg = VideoProtocol.encode(VideoHeader(type: .frame, displayId: did, flags: f, seq: s, captureTimeUs: t, sendTimeUs: 0), payload: data)
            isConfig = false; isKey = key
        }
        var needKey = false
        for sub in subs where sub.offer(msg, isConfig: isConfig, isKey: isKey) { needKey = true }
        if needKey { throttledKeyframe() }
    }

    func throttledKeyframe() {
        let fire: Bool = lock.withLock {
            let now = Date()
            if now.timeIntervalSince(lastKeyRequest) < 0.25 { return false }
            lastKeyRequest = now
            return true
        }
        if fire { requestKeyframe() }
    }
}

/// Ciclo de vida dos streams: inicia a fonte no primeiro assinante, para no último.
actor StreamHub {
    private struct Entry {
        let source: VideoStreamSource
        let fanout: StreamFanout
    }

    private let platform: HostPlatform
    private var settings: StreamSettings
    private var entries: [Int: Entry] = [:]
    private let logger: Logger

    init(platform: HostPlatform, settings: StreamSettings, logger: Logger) {
        self.platform = platform
        self.settings = settings
        self.logger = logger
    }

    func displays() async -> [DisplayInfo] {
        (try? await platform.displays()) ?? []
    }

    func subscribe(display id: Int) async throws -> VideoSubscriber {
        let entry: Entry
        if let e = entries[id] {
            entry = e
        } else {
            guard let info = try await platform.displays().first(where: { $0.id == id }) else {
                throw HubError.unknownDisplay(id)
            }
            let source = try platform.makeStream(display: info, settings: settings)
            let fanout = StreamFanout(displayId: id)
            fanout.requestKeyframe = { [weak source] in source?.requestKeyframe() }
            entry = Entry(source: source, fanout: fanout)
            entries[id] = entry
            do {
                try await source.start { unit in fanout.publish(unit) }
                logger.info("stream iniciado", metadata: ["display": "\(id)", "fps": "\(settings.fps)", "kbps": "\(settings.bitrateKbps)"])
            } catch {
                entries[id] = nil
                throw error
            }
        }
        let sub = VideoSubscriber()
        entry.fanout.add(sub)
        entry.source.requestKeyframe()
        return sub
    }

    func unsubscribe(display id: Int, _ sub: VideoSubscriber) async {
        sub.finish()
        guard let e = entries[id] else { return }
        e.fanout.remove(sub)
        if sub.dropped > 0 { logger.info("assinante saiu", metadata: ["display": "\(id)", "descartados": "\(sub.dropped)"]) }
        if e.fanout.count == 0 {
            entries[id] = nil
            await e.source.stop()
            logger.info("stream parado", metadata: ["display": "\(id)"])
        }
    }

    func requestKeyframe(display id: Int) {
        entries[id]?.fanout.throttledKeyframe()
    }

    func configure(display id: Int, fps: Int?, bitrateKbps: Int?) {
        let f = fps.map { min(max($0, 1), 120) }
        let b = bitrateKbps.map { min(max($0, 200), 50_000) }
        entries[id]?.source.update(fps: f, bitrateKbps: b)
    }

    func stopAll() async {
        for (_, e) in entries { await e.source.stop() }
        entries.removeAll()
    }
}

enum HubError: Error, CustomStringConvertible {
    case unknownDisplay(Int)
    var description: String {
        switch self { case .unknownDisplay(let id): return "display \(id) não existe" }
    }
}
