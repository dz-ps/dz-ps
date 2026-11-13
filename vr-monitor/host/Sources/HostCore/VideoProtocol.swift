// Protocolo de vídeo v1 — ver docs/ARCHITECTURE.md §4.3. Little-endian, header de 28 bytes.

public enum VideoMsgType: UInt8, Sendable {
    case config = 1
    case frame = 2
}

public struct VideoFlags: OptionSet, Sendable, Equatable {
    public let rawValue: UInt16
    public init(rawValue: UInt16) { self.rawValue = rawValue }
    public static let keyframe = VideoFlags(rawValue: 1 << 0)
    public static let repeatFrame = VideoFlags(rawValue: 1 << 1)
}

public struct VideoHeader: Equatable, Sendable {
    public var type: VideoMsgType
    public var displayId: UInt16
    public var flags: VideoFlags
    public var seq: UInt32
    public var captureTimeUs: UInt64
    public var sendTimeUs: UInt64

    public init(type: VideoMsgType, displayId: UInt16, flags: VideoFlags, seq: UInt32, captureTimeUs: UInt64, sendTimeUs: UInt64) {
        self.type = type; self.displayId = displayId; self.flags = flags
        self.seq = seq; self.captureTimeUs = captureTimeUs; self.sendTimeUs = sendTimeUs
    }
}

public struct ConfigPayload: Equatable, Sendable {
    public var width: Int
    public var height: Int
    public var codec: String
    public var avcc: [UInt8]
    public init(width: Int, height: Int, codec: String, avcc: [UInt8]) {
        self.width = width; self.height = height; self.codec = codec; self.avcc = avcc
    }
}

public enum ProtocolError: Error, Equatable {
    case tooShort, badMagic, badVersion, badType, badConfig
}

public enum VideoProtocol {
    public static let magic: UInt16 = 0x4D56
    public static let version: UInt8 = 1
    public static let headerSize = 28
    public static let sendTimeOffset = 20

    public static func encode(_ h: VideoHeader, payload: [UInt8]) -> [UInt8] {
        var out = [UInt8]()
        out.reserveCapacity(headerSize + payload.count)
        out.appendLE(magic)
        out.append(version)
        out.append(h.type.rawValue)
        out.appendLE(h.displayId)
        out.appendLE(h.flags.rawValue)
        out.appendLE(h.seq)
        out.appendLE(h.captureTimeUs)
        out.appendLE(h.sendTimeUs)
        out.append(contentsOf: payload)
        return out
    }

    public static func decode(_ b: [UInt8]) throws -> (VideoHeader, ArraySlice<UInt8>) {
        guard b.count >= headerSize else { throw ProtocolError.tooShort }
        guard b.readLE(UInt16.self, at: 0) == magic else { throw ProtocolError.badMagic }
        guard b[2] == version else { throw ProtocolError.badVersion }
        guard let type = VideoMsgType(rawValue: b[3]) else { throw ProtocolError.badType }
        let h = VideoHeader(
            type: type,
            displayId: b.readLE(UInt16.self, at: 4),
            flags: VideoFlags(rawValue: b.readLE(UInt16.self, at: 6)),
            seq: b.readLE(UInt32.self, at: 8),
            captureTimeUs: b.readLE(UInt64.self, at: 12),
            sendTimeUs: b.readLE(UInt64.self, at: 20)
        )
        return (h, b[headerSize...])
    }

    /// Preenche o `sendTimeUs` imediatamente antes de escrever no socket.
    public static func patchSendTime(_ b: inout [UInt8], _ t: UInt64) {
        precondition(b.count >= headerSize)
        var v = t.littleEndian
        withUnsafeBytes(of: &v) { raw in
            for i in 0..<8 { b[sendTimeOffset + i] = raw[i] }
        }
    }

    public static func encodeConfig(_ c: ConfigPayload) -> [UInt8] {
        let codec = Array(c.codec.utf8)
        precondition(codec.count < 256 && c.width < 65536 && c.height < 65536)
        var out = [UInt8]()
        out.appendLE(UInt16(c.width))
        out.appendLE(UInt16(c.height))
        out.append(UInt8(codec.count))
        out.append(contentsOf: codec)
        out.append(contentsOf: c.avcc)
        return out
    }

    public static func decodeConfig<C: Collection>(_ p: C) throws -> ConfigPayload where C.Element == UInt8 {
        let b = Array(p)
        guard b.count >= 5 else { throw ProtocolError.badConfig }
        let len = Int(b[4])
        guard b.count >= 5 + len + 7 else { throw ProtocolError.badConfig }
        guard let codec = String(bytes: b[5..<(5 + len)], encoding: .ascii) else { throw ProtocolError.badConfig }
        return ConfigPayload(
            width: Int(b.readLE(UInt16.self, at: 0)),
            height: Int(b.readLE(UInt16.self, at: 2)),
            codec: codec,
            avcc: Array(b[(5 + len)...])
        )
    }
}

// MARK: - helpers little-endian

extension Array where Element == UInt8 {
    mutating func appendLE<T: FixedWidthInteger>(_ v: T) {
        var x = v.littleEndian
        Swift.withUnsafeBytes(of: &x) { append(contentsOf: $0) }
    }

    func readLE<T: FixedWidthInteger>(_: T.Type, at offset: Int) -> T {
        var v: T = 0
        for i in 0..<MemoryLayout<T>.size {
            v |= T(self[offset + i]) << (8 * i)
        }
        return v
    }
}
