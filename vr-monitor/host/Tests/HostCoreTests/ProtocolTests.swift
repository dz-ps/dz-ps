import Foundation
import Testing
@testable import HostCore

private func hex(_ s: String) -> [UInt8] {
    var out: [UInt8] = []
    var i = s.startIndex
    while i < s.endIndex {
        let j = s.index(i, offsetBy: 2)
        out.append(UInt8(s[i..<j], radix: 16)!)
        i = j
    }
    return out
}

private func toHex(_ b: some Sequence<UInt8>) -> String { b.map { String(format: "%02x", $0) }.joined() }

/// Mesmos vetores usados pelos testes do cliente (client/test/protocol.test.ts).
private struct Vectors: Decodable {
    struct Frame: Decodable { let type: UInt8; let displayId: UInt16; let flags: UInt16; let seq: UInt32; let captureTimeUs: UInt64; let sendTimeUs: UInt64; let payloadHex: String; let hex: String }
    struct Config: Decodable { let displayId: UInt16; let flags: UInt16; let seq: UInt32; let captureTimeUs: UInt64; let sendTimeUs: UInt64; let width: Int; let height: Int; let codec: String; let avccHex: String; let hex: String }
    struct Avcc: Decodable { let spsHex: String; let ppsHex: String; let expectedHex: String; let codec: String }
    let frame: Frame
    let config: Config
    let avcc: Avcc

    static func load() throws -> Vectors {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("protocol-fixtures/vectors.json")
        return try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }
}

@Suite struct VideoProtocolTests {
    @Test func encodesFrameVectorByteExact() throws {
        let v = try Vectors.load().frame
        let h = VideoHeader(type: .frame, displayId: v.displayId, flags: VideoFlags(rawValue: v.flags), seq: v.seq, captureTimeUs: v.captureTimeUs, sendTimeUs: v.sendTimeUs)
        #expect(toHex(VideoProtocol.encode(h, payload: hex(v.payloadHex))) == v.hex)
    }

    @Test func decodesFrameVector() throws {
        let v = try Vectors.load().frame
        let (h, p) = try VideoProtocol.decode(hex(v.hex))
        #expect(h.type == .frame && h.displayId == v.displayId && h.seq == v.seq)
        #expect(h.flags.contains(.keyframe))
        #expect(h.captureTimeUs == v.captureTimeUs && h.sendTimeUs == v.sendTimeUs)
        #expect(toHex(p) == v.payloadHex)
    }

    @Test func configRoundTrip() throws {
        let v = try Vectors.load().config
        let (h, p) = try VideoProtocol.decode(hex(v.hex))
        #expect(h.type == .config)
        let c = try VideoProtocol.decodeConfig(p)
        #expect(c == ConfigPayload(width: v.width, height: v.height, codec: v.codec, avcc: hex(v.avccHex)))
        #expect(toHex(VideoProtocol.encode(h, payload: VideoProtocol.encodeConfig(c))) == v.hex)
    }

    @Test func patchSendTime() throws {
        let v = try Vectors.load().frame
        var b = hex(v.hex)
        VideoProtocol.patchSendTime(&b, 0x0102030405060708)
        let (h, _) = try VideoProtocol.decode(b)
        #expect(h.sendTimeUs == 0x0102030405060708)
        #expect(h.captureTimeUs == v.captureTimeUs)
    }

    @Test func rejectsMalformed() throws {
        let v = try Vectors.load().frame
        #expect(throws: ProtocolError.tooShort) { try VideoProtocol.decode([1, 2, 3]) }
        var b = hex(v.hex); b[0] = 0
        #expect(throws: ProtocolError.badMagic) { try VideoProtocol.decode(b) }
        b = hex(v.hex); b[2] = 9
        #expect(throws: ProtocolError.badVersion) { try VideoProtocol.decode(b) }
        b = hex(v.hex); b[3] = 7
        #expect(throws: ProtocolError.badType) { try VideoProtocol.decode(b) }
        #expect(throws: ProtocolError.badConfig) { try VideoProtocol.decodeConfig([0, 5, 0, 3, 2]) }
    }
}

@Suite struct H264Tests {
    @Test func avcCAndCodecString() throws {
        let v = try Vectors.load().avcc
        let sps = hex(v.spsHex), pps = hex(v.ppsHex)
        #expect(H264.avcC(sps: [sps], pps: [pps]).map(toHex) == v.expectedHex)
        #expect(H264.codecString(sps: sps)?.lowercased() == v.codec)
    }

    @Test func splitAnnexBMixedStartCodes() {
        let d = hex("00000001" + "6742" + "000001" + "68ce" + "00000001" + "658800" + "000001" + "41aa")
        let nals = H264.splitAnnexB(d).map { toHex($0) }
        // atenção: o 00 final do IDR "658800" é indistinguível de um start code de 4 bytes e é removido,
        // o que é o comportamento esperado (trailing_zero_8bits)
        #expect(nals == ["6742", "68ce", "6588", "41aa"])
    }

    @Test func avccSample() {
        let s = H264.avccSample([ArraySlice(hex("6588")), ArraySlice(hex("06aabb"))])
        #expect(toHex(s) == "00000002658800000003" + "06aabb")
    }
}

@Suite struct AuthTests {
    @Test func tokenFormat() {
        let t = SessionToken.generate()
        #expect(t.count == 22)
        #expect(SessionToken.isWellFormed(t))
        #expect(SessionToken.generate() != t)
        #expect(!SessionToken.isWellFormed("short"))
        #expect(!SessionToken.isWellFormed("has spaces in it!!!!!"))
    }

    @Test func constantTimeEquals() {
        #expect(SessionToken.constantTimeEquals("abc", "abc"))
        #expect(!SessionToken.constantTimeEquals("abc", "abd"))
        #expect(!SessionToken.constantTimeEquals("abc", "abcd"))
    }

    @Test func subprotocolParsing() {
        let r = SessionToken.parseSubprotocols(["vrm.v1, vrm.auth.TOKEN_123"])
        #expect(r.hasProtocol && r.token == "TOKEN_123")
        let r2 = SessionToken.parseSubprotocols(["vrm.auth.X", "vrm.v1"])
        #expect(r2.hasProtocol && r2.token == "X")
        #expect(SessionToken.parseSubprotocols(["chat"]) == (false, nil))
    }

    @Test func accessPolicy() {
        let p = AccessPolicy(port: 8420, extraOrigins: ["http://localhost:5173"])
        #expect(p.hostAllowed("localhost:8420") && p.hostAllowed("127.0.0.1:8420"))
        #expect(!p.hostAllowed("evil.com") && !p.hostAllowed("localhost:9999") && !p.hostAllowed(nil))
        #expect(p.originAllowed("http://localhost:8420") && p.originAllowed("http://LOCALHOST:5173"))
        #expect(!p.originAllowed("https://evil.com") && !p.originAllowed("null") && !p.originAllowed(nil))
    }

    @Test func limiter() {
        let l = AuthLimiter(maxFailures: 3, window: 10, blockFor: 5)
        l.recordFailure(now: 0); l.recordFailure(now: 1)
        #expect(!l.isBlocked(now: 1))
        l.recordFailure(now: 2)
        #expect(l.isBlocked(now: 2) && l.isBlocked(now: 6.9))
        #expect(!l.isBlocked(now: 7.1))
    }
}

@Suite struct ControlMessageTests {
    @Test func parsesClientMessages() {
        #expect(ClientMessage.parse(#"{"t":"ping","id":3,"c0":12.5}"#) == .ping(id: 3, c0: 12.5))
        #expect(ClientMessage.parse(#"{"t":"keyframe","display":2}"#) == .keyframe(display: 2))
        #expect(ClientMessage.parse(#"{"t":"stream.config","display":1,"fps":30}"#) == .streamConfig(display: 1, fps: 30, bitrateKbps: nil, active: nil))
        #expect(ClientMessage.parse(#"{"t":"hello","client":{"ua":"x"}}"#) == .hello(ua: "x"))
        #expect(ClientMessage.parse(#"{"t":"display.create","width":1280,"height":800}"#) == .displayCreate(VirtualDisplaySpec(width: 1280, height: 800)))
        #expect(ClientMessage.parse(#"{"t":"display.create","width":1920,"height":1080,"hiDPI":true,"name":"A"}"#) == .displayCreate(VirtualDisplaySpec(width: 1920, height: 1080, hiDPI: true, name: "A")))
        #expect(ClientMessage.parse(#"{"t":"display.destroy","display":3}"#) == .displayDestroy(display: 3))
        #expect(ClientMessage.parse(#"{"t":"display.create","width":1280}"#) == nil)
        #expect(ClientMessage.parse(#"{"t":"nope"}"#) == .unknown("nope"))
        #expect(ClientMessage.parse(#"{"t":"ping"}"#) == nil)
        #expect(ClientMessage.parse("garbage") == nil)
    }

    @Test func encodesHostMessages() {
        #expect(HostMessage.pong(id: 1, c0: 2.5, h: 99).json() == #"{"c0":2.5,"h":99,"id":1,"t":"pong"}"#)
        #expect(HostMessage.welcome(hostTimeUs: 5, displays: [], permissions: .init(screen: .granted, accessibility: .denied), inputEnabled: false, virtualDisplays: .init(available: true, reason: nil, max: 4)).json().contains(#""proto":1"#))
    }
}

@Suite struct StreamSettingsTests {
    @Test func fitKeepsAspectAndEven() {
        let s = StreamSettings(maxWidth: 1280, maxHeight: 800)
        #expect(s.fit(width: 2560, height: 1600) == (1280, 800))
        #expect(s.fit(width: 1470, height: 956) == (1230, 800))
        #expect(s.fit(width: 1920, height: 1080) == (1280, 720))
        #expect(s.fit(width: 800, height: 600) == (800, 600)) // não amplia
    }
}

@Suite struct VirtualDisplaySpecTests {
    @Test func clampAndParse() {
        #expect(VirtualDisplaySpec.parse("1280x800") == VirtualDisplaySpec(width: 1280, height: 800))
        #expect(VirtualDisplaySpec.parse("1280X800") != nil)
        #expect(VirtualDisplaySpec.parse("abc") == nil)
        let c = VirtualDisplaySpec(width: 99_999, height: 11, refreshRate: 500, name: "a<script>b").clamped()
        #expect(c.width == 3840 && c.height == 400 && c.refreshRate == 120 && c.name == "ascriptb")
        #expect(VirtualDisplaySpec(width: 1281, height: 801).clamped().width == 1280)
    }

    @Test func syntheticVirtualDisplays() async throws {
        let p = SyntheticPlatform(clipPath: "/nao/existe", maxVirtual: 2)
        let v = try #require(p.virtualDisplays)
        #expect(v.unavailableReason == nil)
        let a = try await v.create(VirtualDisplaySpec(width: 1280, height: 800))
        let b = try await v.create(VirtualDisplaySpec(width: 1920, height: 1080))
        #expect(a.virtual && b.virtual && a.id != b.id)
        await #expect(throws: VirtualDisplayError.self) { try await v.create(VirtualDisplaySpec(width: 1280, height: 800)) }
        #expect(try await p.displays().count == 3)
        try await v.destroy(id: a.id)
        #expect(v.ids() == [b.id])
        await #expect(throws: VirtualDisplayError.self) { try await v.destroy(id: 1) } // o principal não é virtual
        await v.destroyAll()
        #expect(try await p.displays().count == 1)
    }
}
