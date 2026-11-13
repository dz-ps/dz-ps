#if os(macOS)
import CoreMedia
import CoreVideo
import Foundation
import HostCore
import VideoToolbox

/// Encoder H.264 em hardware, modo tempo real, sem B-frames, saída AVCC.
/// Ver docs/ARCHITECTURE.md §2.4.
final class H264Encoder: @unchecked Sendable {
    private let width: Int
    private let height: Int
    private var fps: Int
    private var bitrateKbps: Int
    private let onUnit: @Sendable (EncodedUnit) -> Void
    private let lock = NSLock()
    private var session: VTCompressionSession?
    private var lastPtsUs: Int64 = -1
    private var lastConfig: ConfigPayload?
    private(set) var lowLatency = false
    private var warnedNalLength = false

    init(width: Int, height: Int, fps: Int, bitrateKbps: Int, onUnit: @escaping @Sendable (EncodedUnit) -> Void) throws {
        self.width = width
        self.height = height
        self.fps = fps
        self.bitrateKbps = bitrateKbps
        self.onUnit = onUnit
        try createSession()
    }

    deinit { invalidate() }

    func invalidate() {
        lock.withLock {
            if let s = session { VTCompressionSessionInvalidate(s) }
            session = nil
        }
    }

    // MARK: - sessão

    private func createSession() throws {
        // tenta com low-latency rate control; se o sistema recusar, cai pro modo normal
        if let s = try? makeSession(lowLatency: true) {
            session = s
            lowLatency = true
        } else {
            session = try makeSession(lowLatency: false)
            lowLatency = false
            FileHandle.standardError.write(Data("aviso: VideoToolbox sem low-latency rate control; usando modo tempo real normal\n".utf8))
        }
    }

    private func makeSession(lowLatency: Bool) throws -> VTCompressionSession {
        var spec: [CFString: Any] = [kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: kCFBooleanTrue!]
        if lowLatency { spec[kVTVideoEncoderSpecification_EnableLowLatencyRateControl] = kCFBooleanTrue! }
        var out: VTCompressionSession?
        let st = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: Int32(width), height: Int32(height),
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: spec as CFDictionary,
            imageBufferAttributes: nil,
            compressedDataAllocator: nil,
            outputCallback: nil,
            refcon: nil,
            compressionSessionOut: &out
        )
        guard st == noErr, let s = out else { throw MacError.videoToolbox("VTCompressionSessionCreate", st) }

        set(s, kVTCompressionPropertyKey_RealTime, kCFBooleanTrue)
        set(s, kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse)
        // o modo low-latency só aceita Constrained Baseline/High
        set(s, kVTCompressionPropertyKey_ProfileLevel,
            lowLatency ? kVTProfileLevel_H264_ConstrainedHigh_AutoLevel : kVTProfileLevel_H264_High_AutoLevel)
        set(s, kVTCompressionPropertyKey_AverageBitRate, NSNumber(value: bitrateKbps * 1000))
        set(s, kVTCompressionPropertyKey_ExpectedFrameRate, NSNumber(value: fps))
        set(s, kVTCompressionPropertyKey_MaxKeyFrameInterval, NSNumber(value: fps * 10))
        set(s, kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, NSNumber(value: 10))
        // sinaliza BT.709 no VUI pra o decoder do Chrome converter as cores certo
        set(s, kVTCompressionPropertyKey_ColorPrimaries, kCVImageBufferColorPrimaries_ITU_R_709_2)
        set(s, kVTCompressionPropertyKey_TransferFunction, kCVImageBufferTransferFunction_ITU_R_709_2)
        set(s, kVTCompressionPropertyKey_YCbCrMatrix, kCVImageBufferYCbCrMatrix_ITU_R_709_2)
        VTCompressionSessionPrepareToEncodeFrames(s)
        return s
    }

    @discardableResult
    private func set(_ s: VTCompressionSession, _ key: CFString, _ value: CFTypeRef?) -> Bool {
        let st = VTSessionSetProperty(s, key: key, value: value)
        if st != noErr {
            FileHandle.standardError.write(Data("aviso: VTSessionSetProperty(\(key)) = \(st)\n".utf8))
        }
        return st == noErr
    }

    func update(fps: Int?, bitrateKbps: Int?) {
        lock.withLock {
            guard let s = session else { return }
            if let b = bitrateKbps { self.bitrateKbps = b; set(s, kVTCompressionPropertyKey_AverageBitRate, NSNumber(value: b * 1000)) }
            if let f = fps { self.fps = f; set(s, kVTCompressionPropertyKey_ExpectedFrameRate, NSNumber(value: f)) }
        }
    }

    // MARK: - encode

    func encode(_ pixelBuffer: CVPixelBuffer, captureTimeUs: UInt64, forceKeyframe: Bool, repeatFrame: Bool) {
        lock.lock()
        guard let s = session else { lock.unlock(); return }
        // PTS precisa ser crescente; o reenvio do último frame pode "passar na frente"
        var ptsUs = Int64(captureTimeUs)
        if ptsUs <= lastPtsUs { ptsUs = lastPtsUs + 1 }
        lastPtsUs = ptsUs
        lock.unlock()

        let props: CFDictionary? = forceKeyframe
            ? [kVTEncodeFrameOptionKey_ForceKeyFrame: kCFBooleanTrue!] as CFDictionary
            : nil
        let st = VTCompressionSessionEncodeFrame(
            s,
            imageBuffer: pixelBuffer,
            presentationTimeStamp: CMTime(value: ptsUs, timescale: 1_000_000),
            duration: .invalid,
            frameProperties: props,
            infoFlagsOut: nil
        ) { [weak self] status, flags, sbuf in
            self?.handleOutput(status: status, flags: flags, sampleBuffer: sbuf, captureTimeUs: captureTimeUs, repeatFrame: repeatFrame)
        }
        if st == kVTInvalidSessionErr {
            // ex.: depois de dormir/acordar o Mac. Recria e pede keyframe no próximo frame.
            lock.withLock { session = nil }
            try? lock.withLock { try createSession() }
        } else if st != noErr {
            FileHandle.standardError.write(Data("aviso: VTCompressionSessionEncodeFrame = \(st)\n".utf8))
        }
    }

    private func handleOutput(status: OSStatus, flags: VTEncodeInfoFlags, sampleBuffer: CMSampleBuffer?,
                              captureTimeUs: UInt64, repeatFrame: Bool) {
        guard status == noErr, let sb = sampleBuffer, CMSampleBufferDataIsReady(sb),
              !flags.contains(.frameDropped) else { return }

        let key = !Self.isNotSync(sb)
        if key, let fd = CMSampleBufferGetFormatDescription(sb), let cfg = makeConfig(fd) {
            onUnit(.config(cfg, captureTimeUs: captureTimeUs))
        }
        guard let bb = CMSampleBufferGetDataBuffer(sb) else { return }
        let len = CMBlockBufferGetDataLength(bb)
        var data = [UInt8](repeating: 0, count: len)
        let st = data.withUnsafeMutableBytes { raw in
            CMBlockBufferCopyDataBytes(bb, atOffset: 0, dataLength: len, destination: raw.baseAddress!)
        }
        guard st == kCMBlockBufferNoErr else { return }
        onUnit(.frame(data, keyframe: key, repeatFrame: repeatFrame, captureTimeUs: captureTimeUs))
    }

    private static func isNotSync(_ sb: CMSampleBuffer) -> Bool {
        guard let atts = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false),
              CFArrayGetCount(atts) > 0 else { return false }
        let dict = unsafeBitCast(CFArrayGetValueAtIndex(atts, 0), to: CFDictionary.self)
        return CFDictionaryContainsKey(dict, Unmanaged.passUnretained(kCMSampleAttachmentKey_NotSync).toOpaque())
    }

    /// SPS/PPS do CMFormatDescription → avcC + string de codec.
    private func makeConfig(_ fd: CMFormatDescription) -> ConfigPayload? {
        var count = 0
        var nalLen: Int32 = 0
        guard CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
            fd, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil,
            parameterSetCountOut: &count, nalUnitHeaderLengthOut: &nalLen) == noErr else { return lastConfig }
        if nalLen != 4 && !warnedNalLength {
            warnedNalLength = true
            FileHandle.standardError.write(Data("aviso: NAL length \(nalLen) != 4; o cliente espera 4\n".utf8))
        }
        var sps: [[UInt8]] = []
        var pps: [[UInt8]] = []
        for i in 0..<count {
            var ptr: UnsafePointer<UInt8>?
            var size = 0
            guard CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                fd, parameterSetIndex: i, parameterSetPointerOut: &ptr, parameterSetSizeOut: &size,
                parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr, let p = ptr, size > 0 else { continue }
            let set = Array(UnsafeBufferPointer(start: p, count: size))
            switch set[0] & 0x1F {
            case H264.nalSPS: sps.append(set)
            case H264.nalPPS: pps.append(set)
            default: break
            }
        }
        guard let s0 = sps.first, let codec = H264.codecString(sps: s0), let avcc = H264.avcC(sps: sps, pps: pps) else {
            return lastConfig
        }
        let dims = CMVideoFormatDescriptionGetDimensions(fd)
        let cfg = ConfigPayload(width: Int(dims.width), height: Int(dims.height), codec: codec, avcc: avcc)
        lastConfig = cfg
        return cfg
    }
}
#endif
