import Foundation

/// Token de sessão e políticas de acesso (ver docs/ARCHITECTURE.md §4.1 e §8).
public enum SessionToken {
    public static let subprotocol = "vrm.v1"
    public static let authPrefix = "vrm.auth."

    /// 128 bits do CSPRNG do sistema em base64url sem padding (22 caracteres).
    public static func generate() -> String {
        var rng = SystemRandomNumberGenerator()
        let bytes = (0..<16).map { _ in UInt8.random(in: 0...255, using: &rng) }
        return base64url(bytes)
    }

    public static func isWellFormed(_ s: String) -> Bool {
        (16...128).contains(s.utf8.count) && s.utf8.allSatisfy { c in
            (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 45 || c == 95
        }
    }

    /// Comparação em tempo constante (em relação ao conteúdo; o tamanho não é segredo).
    public static func constantTimeEquals(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8), y = Array(b.utf8)
        guard x.count == y.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<x.count { diff |= x[i] ^ y[i] }
        return diff == 0
    }

    /// Lê os valores de `Sec-WebSocket-Protocol` (pode vir em várias linhas e/ou separado por vírgula).
    public static func parseSubprotocols(_ headerValues: [String]) -> (hasProtocol: Bool, token: String?) {
        let items = headerValues.flatMap { $0.split(separator: ",") }.map { $0.trimmingCharacters(in: .whitespaces) }
        let token = items.first { $0.hasPrefix(authPrefix) }.map { String($0.dropFirst(authPrefix.count)) }
        return (items.contains(subprotocol), token)
    }

    static func base64url(_ bytes: [UInt8]) -> String {
        Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// Allowlists de `Host` (anti DNS rebinding) e `Origin` (anti CSWSH).
public struct AccessPolicy: Sendable {
    public var allowedHosts: Set<String>
    public var allowedOrigins: Set<String>

    public init(port: Int, extraOrigins: [String] = [], extraHosts: [String] = []) {
        allowedHosts = Set(["localhost:\(port)", "127.0.0.1:\(port)"] + extraHosts.map { $0.lowercased() })
        allowedOrigins = Set(["http://localhost:\(port)", "http://127.0.0.1:\(port)"] + extraOrigins.map { $0.lowercased() })
    }

    public func hostAllowed(_ host: String?) -> Bool {
        guard let h = host?.lowercased() else { return false }
        return allowedHosts.contains(h)
    }

    public func originAllowed(_ origin: String?) -> Bool {
        guard let o = origin?.lowercased() else { return false }
        return allowedOrigins.contains(o)
    }
}

/// Limita tentativas de autenticação. Global (não por IP), porque via `adb reverse` todo mundo
/// chega de 127.0.0.1: 5 falhas em 10 s bloqueiam novas tentativas por 5 s. Com token de 128 bits,
/// isso serve contra ruído e força bruta; o bloqueio é curto pra um atacante local não conseguir
/// travar o cliente legítimo por muito tempo.
public final class AuthLimiter: @unchecked Sendable {
    private let lock = NSLock()
    private var failures: [Double] = []
    private var blockedUntil: Double = 0
    private let maxFailures: Int
    private let window: Double
    private let blockFor: Double

    public init(maxFailures: Int = 5, window: Double = 10, blockFor: Double = 5) {
        self.maxFailures = maxFailures; self.window = window; self.blockFor = blockFor
    }

    public func isBlocked(now: Double) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return now < blockedUntil
    }

    public func recordFailure(now: Double) {
        lock.lock(); defer { lock.unlock() }
        failures = failures.filter { now - $0 < window } + [now]
        if failures.count >= maxFailures {
            blockedUntil = now + blockFor
            failures.removeAll()
        }
    }
}
