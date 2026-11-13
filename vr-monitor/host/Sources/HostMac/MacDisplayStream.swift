#if os(macOS)
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import HostCore
import ScreenCaptureKit

/// Captura de um display com ScreenCaptureKit + encode H.264 (VideoToolbox).
/// Ver docs/ARCHITECTURE.md §2.3.
final class MacDisplayStream: NSObject, VideoStreamSource, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let displayId: Int
    private let cgDisplayID: CGDirectDisplayID
    private let width: Int
    private let height: Int
    private var fps: Int
    private var bitrateKbps: Int

    /// Tudo que mexe em `lastBuffer`/`encoder` roda nesta fila.
    private let queue = DispatchQueue(label: "vrmonitor.capture", qos: .userInteractive)
    private var stream: SCStream?
    private var encoder: H264Encoder?
    private var lastBuffer: CVPixelBuffer?
    private var keyRequested = true

    init(displayId: Int, cgDisplayID: CGDirectDisplayID, width: Int, height: Int, fps: Int, bitrateKbps: Int) {
        self.displayId = displayId
        self.cgDisplayID = cgDisplayID
        self.width = width
        self.height = height
        self.fps = fps
        self.bitrateKbps = bitrateKbps
    }

    func start(onUnit: @escaping @Sendable (EncodedUnit) -> Void) async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == cgDisplayID }) else {
            throw MacError.displayNotFound(displayId)
        }
        let enc = try H264Encoder(width: width, height: height, fps: fps, bitrateKbps: bitrateKbps, onUnit: onUnit)
        queue.sync { encoder = enc }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let s = SCStream(filter: filter, configuration: makeConfiguration(), delegate: self)
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        try await s.startCapture()
        stream = s
        FileHandle.standardError.write(Data("captura display \(displayId): \(width)×\(height) @ \(fps) fps, \(bitrateKbps) kbps, low-latency RC: \(enc.lowLatency)\n".utf8))
    }

    private func makeConfiguration() -> SCStreamConfiguration {
        let c = SCStreamConfiguration()
        c.width = width
        c.height = height
        c.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange // 420v
        c.colorMatrix = CGDisplayStream.yCbCrMatrix_ITU_R_709_2
        c.colorSpaceName = CGColorSpace.sRGB
        c.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, fps)))
        // 3 é o mínimo recomendado; +1 porque seguramos o último buffer pra reenviar com a tela parada
        c.queueDepth = 4
        c.showsCursor = true
        c.scalesToFit = true
        return c
    }

    func stop() async {
        if let s = stream { try? await s.stopCapture() }
        stream = nil
        queue.sync {
            encoder?.invalidate()
            encoder = nil
            lastBuffer = nil
        }
    }

    /// Com a tela parada o SCStream não emite nada. Por isso o keyframe sai na hora,
    /// recodificando o último frame (marcado como `repeat`).
    func requestKeyframe() {
        queue.async { [self] in
            if let pb = lastBuffer, let enc = encoder {
                enc.encode(pb, captureTimeUs: HostClock.nowMicros(), forceKeyframe: true, repeatFrame: true)
                keyRequested = false
            } else {
                keyRequested = true
            }
        }
    }

    func update(fps: Int?, bitrateKbps: Int?) {
        queue.async { [self] in
            encoder?.update(fps: fps, bitrateKbps: bitrateKbps)
            if let b = bitrateKbps { self.bitrateKbps = b }
            if let f = fps, f != self.fps {
                self.fps = f
                let cfg = makeConfiguration()
                stream?.updateConfiguration(cfg) { err in
                    if let err { FileHandle.standardError.write(Data("aviso: updateConfiguration: \(err)\n".utf8)) }
                }
            }
        }
    }

    // MARK: - SCStreamOutput (roda em `queue`)

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, CMSampleBufferIsValid(sampleBuffer),
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let info = attachments.first,
              let rawStatus = info[.status] as? Int,
              let status = SCFrameStatus(rawValue: rawStatus) else { return }
        // .idle/.blank/.suspended: sem pixels novos
        guard status == .complete, let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let captureUs: UInt64
        if let displayTime = info[.displayTime] as? UInt64 {
            captureUs = HostClock.machToMicros(displayTime)
        } else {
            captureUs = HostClock.nowMicros()
        }
        lastBuffer = pb
        let force = keyRequested
        keyRequested = false
        encoder?.encode(pb, captureTimeUs: captureUs, forceKeyframe: force, repeatFrame: false)
    }

    // MARK: - SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        FileHandle.standardError.write(Data("captura do display \(displayId) parou: \(error.localizedDescription)\n".utf8))
    }
}
#endif
