import Foundation

/// Fonte de teste: toca em loop um clipe H.264 Annex B, como se fosse captura em tempo real.
/// Serve pra testar cliente/servidor sem ScreenCaptureKit (no Linux, ou no Mac sem permissão).
/// O clipe precisa começar com IDR e não pode ter B-frames (ver scripts/make-test-clip.sh).
public final class SyntheticStream: VideoStreamSource, @unchecked Sendable {
    public let displayId: Int
    private let accessUnits: [(sample: [UInt8], key: Bool)]
    private let config: ConfigPayload
    private let lock = NSLock()
    private var fps: Int
    private var keyRequested = false
    private var task: Task<Void, Never>?

    public init(displayId: Int, annexB: [UInt8], width: Int, height: Int, fps: Int) throws {
        self.displayId = displayId
        self.fps = max(1, fps)
        var sps: [[UInt8]] = []
        var pps: [[UInt8]] = []
        var aus: [(sample: [UInt8], key: Bool)] = []
        var cur: [ArraySlice<UInt8>] = []
        var curHasVCL = false
        var curKey = false
        func flush() {
            if curHasVCL { aus.append((H264.avccSample(cur), curKey)) }
            cur.removeAll(); curHasVCL = false; curKey = false
        }
        for nal in H264.splitAnnexB(annexB) {
            let t = H264.nalType(nal)
            switch t {
            case H264.nalSPS: if sps.isEmpty { sps.append(Array(nal)) }
            case H264.nalPPS: if pps.isEmpty { pps.append(Array(nal)) }
            case H264.nalAUD: flush()
            case H264.nalSlice, H264.nalIDR:
                // novo frame quando first_mb_in_slice == 0 (ue(v) = 0 ⇔ primeiro bit é 1)
                if H264.isFirstSliceOfPicture(nal) { flush() }
                cur.append(nal); curHasVCL = true
                if t == H264.nalIDR { curKey = true }
            default:
                // SEI etc.: se já há VCL no AU corrente, pertencem ao próximo frame
                if curHasVCL { flush() }
                cur.append(nal)
            }
        }
        flush()
        guard let s0 = sps.first, let codec = H264.codecString(sps: s0), let avcc = H264.avcC(sps: sps, pps: pps),
              let first = aus.first, first.key else {
            throw SyntheticError.invalidClip
        }
        accessUnits = aus
        config = ConfigPayload(width: width, height: height, codec: codec, avcc: avcc)
    }

    public convenience init(displayId: Int, clipPath: String, width: Int, height: Int, fps: Int) throws {
        guard let d = FileManager.default.contents(atPath: clipPath) else { throw SyntheticError.missingClip(clipPath) }
        try self.init(displayId: displayId, annexB: [UInt8](d), width: width, height: height, fps: fps)
    }

    public var frameCount: Int { accessUnits.count }

    public func start(onUnit: @escaping @Sendable (EncodedUnit) -> Void) async throws {
        task?.cancel()
        task = Task.detached { [self] in
            var i = 0
            let clock = ContinuousClock()
            var next = clock.now
            while !Task.isCancelled {
                let (interval, restart) = lock.withLock { () -> (Duration, Bool) in
                    let r = keyRequested; keyRequested = false
                    return (.microseconds(1_000_000 / fps), r)
                }
                if restart { i = 0 }
                let au = accessUnits[i]
                let t = HostClock.nowMicros()
                if au.key { onUnit(.config(config, captureTimeUs: t)) }
                onUnit(.frame(au.sample, keyframe: au.key, repeatFrame: false, captureTimeUs: t))
                i = (i + 1) % accessUnits.count
                next = next.advanced(by: interval)
                if next < clock.now { next = clock.now }
                try? await Task.sleep(until: next, clock: clock)
            }
        }
    }

    public func stop() async {
        task?.cancel()
        task = nil
    }

    public func requestKeyframe() { lock.withLock { keyRequested = true } }

    public func update(fps: Int?, bitrateKbps: Int?) {
        if let f = fps, f > 0 { lock.withLock { self.fps = min(f, 120) } }
    }
}

public enum SyntheticError: Error, CustomStringConvertible {
    case invalidClip
    case missingClip(String)
    public var description: String {
        switch self {
        case .invalidClip: return "clipe H.264 inválido (precisa de SPS/PPS e começar com IDR)"
        case .missingClip(let p): return "clipe não encontrado: \(p) (gere com scripts/make-test-clip.sh)"
        }
    }
}

/// Plataforma de teste: um display sintético.
public struct SyntheticPlatform: HostPlatform {
    public let clipPath: String
    public let permissions: PermissionChecker = AlwaysGranted()
    public init(clipPath: String) { self.clipPath = clipPath }

    public func displays() async throws -> [DisplayInfo] {
        [DisplayInfo(id: 1, name: "Synthetic", width: 1280, height: 800, virtual: true, main: true)]
    }

    public func makeStream(display: DisplayInfo, settings: StreamSettings) throws -> VideoStreamSource {
        try SyntheticStream(displayId: display.id, clipPath: clipPath, width: display.width, height: display.height, fps: settings.fps)
    }

    struct AlwaysGranted: PermissionChecker {
        func screenCapture() -> PermissionState { .granted }
        func accessibility() -> PermissionState { .granted }
        func requestScreenCapture() {}
    }
}
