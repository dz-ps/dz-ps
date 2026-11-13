import Foundation

/// Mensagens do canal de controle (JSON) — ver docs/ARCHITECTURE.md §4.2.
public enum ClientMessage: Equatable, Sendable {
    case hello(ua: String)
    case ping(id: Int, c0: Double)
    case keyframe(display: Int)
    case streamConfig(display: Int, fps: Int?, bitrateKbps: Int?, active: Bool?)
    case stats(display: Int, fps: Double, decodeMs: Double, e2eMs: Double)
    case unknown(String)

    private struct Envelope: Decodable { let t: String }
    private struct Hello: Decodable { struct C: Decodable { let ua: String? }; let client: C? }
    private struct Ping: Decodable { let id: Int; let c0: Double }
    private struct Display: Decodable { let display: Int }
    private struct StreamCfg: Decodable { let display: Int; let fps: Int?; let bitrateKbps: Int?; let active: Bool? }
    private struct Stats: Decodable { let display: Int; let fps: Double; let decodeMs: Double; let e2eMs: Double }

    /// `nil` se não for JSON válido ou faltar campo obrigatório.
    public static func parse(_ text: String) -> ClientMessage? {
        let data = Data(text.utf8)
        let dec = JSONDecoder()
        guard let env = try? dec.decode(Envelope.self, from: data) else { return nil }
        do {
            switch env.t {
            case "hello":
                return .hello(ua: try dec.decode(Hello.self, from: data).client?.ua ?? "")
            case "ping":
                let p = try dec.decode(Ping.self, from: data); return .ping(id: p.id, c0: p.c0)
            case "keyframe":
                return .keyframe(display: try dec.decode(Display.self, from: data).display)
            case "stream.config":
                let s = try dec.decode(StreamCfg.self, from: data)
                return .streamConfig(display: s.display, fps: s.fps, bitrateKbps: s.bitrateKbps, active: s.active)
            case "stats":
                let s = try dec.decode(Stats.self, from: data)
                return .stats(display: s.display, fps: s.fps, decodeMs: s.decodeMs, e2eMs: s.e2eMs)
            default:
                return .unknown(env.t)
            }
        } catch {
            return nil
        }
    }
}

public struct Permissions: Codable, Sendable, Equatable {
    public var screen: PermissionState
    public var accessibility: PermissionState
    public init(screen: PermissionState, accessibility: PermissionState) {
        self.screen = screen; self.accessibility = accessibility
    }
}

public enum HostMessage: Sendable {
    case welcome(hostTimeUs: UInt64, displays: [DisplayInfo], permissions: Permissions, inputEnabled: Bool)
    case pong(id: Int, c0: Double, h: UInt64)
    case displays([DisplayInfo])
    case error(code: String, message: String)

    private struct Welcome: Encodable { let t = "welcome"; let proto = 1; let hostTimeUs: UInt64; let displays: [DisplayInfo]; let permissions: Permissions; let inputEnabled: Bool }
    private struct Pong: Encodable { let t = "pong"; let id: Int; let c0: Double; let h: UInt64 }
    private struct Displays: Encodable { let t = "displays"; let displays: [DisplayInfo] }
    private struct Err: Encodable { let t = "error"; let code: String; let message: String }

    public func json() -> String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        let data: Data?
        switch self {
        case let .welcome(t, d, p, i): data = try? enc.encode(Welcome(hostTimeUs: t, displays: d, permissions: p, inputEnabled: i))
        case let .pong(id, c0, h): data = try? enc.encode(Pong(id: id, c0: c0, h: h))
        case let .displays(d): data = try? enc.encode(Displays(displays: d))
        case let .error(c, m): data = try? enc.encode(Err(code: c, message: m))
        }
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? #"{"t":"error","code":"encode","message":""}"#
    }
}
