// Interfaces da camada portável do host. Tudo que é específico do macOS fica atrás delas
// (ver docs/ARCHITECTURE.md §2.1).

public struct DisplayInfo: Codable, Sendable, Equatable {
    public var id: Int
    public var name: String
    public var width: Int
    public var height: Int
    public var virtual: Bool
    public var main: Bool
    public init(id: Int, name: String, width: Int, height: Int, virtual: Bool, main: Bool) {
        self.id = id; self.name = name; self.width = width; self.height = height
        self.virtual = virtual; self.main = main
    }
}

/// Saída do pipeline captura+encode de um display.
public enum EncodedUnit: Sendable {
    /// Parâmetros do decoder. Sempre emitido imediatamente antes de cada keyframe.
    case config(ConfigPayload, captureTimeUs: UInt64)
    /// Sample AVCC (NALs com prefixo de 4 bytes), sem SPS/PPS.
    case frame([UInt8], keyframe: Bool, repeatFrame: Bool, captureTimeUs: UInt64)
}

public struct StreamSettings: Sendable, Equatable {
    public var maxWidth: Int
    public var maxHeight: Int
    public var fps: Int
    public var bitrateKbps: Int
    public init(maxWidth: Int = 1280, maxHeight: Int = 800, fps: Int = 60, bitrateKbps: Int = 6000) {
        self.maxWidth = maxWidth; self.maxHeight = maxHeight; self.fps = fps; self.bitrateKbps = bitrateKbps
    }

    /// Cabe `w×h` em `maxWidth×maxHeight` mantendo o aspecto, com dimensões pares (exigência do 4:2:0).
    public func fit(width w: Int, height h: Int) -> (width: Int, height: Int) {
        guard w > 0, h > 0 else { return (maxWidth & ~1, maxHeight & ~1) }
        let s = min(1.0, min(Double(maxWidth) / Double(w), Double(maxHeight) / Double(h)))
        let fw = max(2, Int((Double(w) * s).rounded()) & ~1)
        let fh = max(2, Int((Double(h) * s).rounded()) & ~1)
        return (fw, fh)
    }
}

/// Captura + encode de um display. Implementações: `MacDisplayStream` (SCK + VT), `SyntheticStream`.
public protocol VideoStreamSource: AnyObject, Sendable {
    var displayId: Int { get }
    /// Começa a emitir unidades. O callback pode ser chamado em qualquer thread.
    func start(onUnit: @escaping @Sendable (EncodedUnit) -> Void) async throws
    func stop() async
    /// Força um keyframe (reaproveitando o último frame se a tela estiver parada).
    func requestKeyframe()
    func update(fps: Int?, bitrateKbps: Int?)
}

public enum PermissionState: String, Codable, Sendable {
    case granted, denied, unknown
}

public protocol PermissionChecker: Sendable {
    func screenCapture() -> PermissionState
    func accessibility() -> PermissionState
    /// Dispara o prompt do sistema, quando existir.
    func requestScreenCapture()
}

/// Especificação de um display virtual (Fase 2).
public struct VirtualDisplaySpec: Sendable, Equatable {
    public var width: Int
    public var height: Int
    public var hiDPI: Bool
    public var refreshRate: Int
    public var name: String?

    public init(width: Int, height: Int, hiDPI: Bool = false, refreshRate: Int = 60, name: String? = nil) {
        self.width = width; self.height = height; self.hiDPI = hiDPI; self.refreshRate = refreshRate; self.name = name
    }

    public static let minSize = (width: 640, height: 400)
    public static let maxSize = (width: 3840, height: 2400)

    /// Limita aos tamanhos aceitos e arredonda pra par.
    public func clamped() -> VirtualDisplaySpec {
        var c = self
        c.width = min(max(width, Self.minSize.width), Self.maxSize.width) & ~1
        c.height = min(max(height, Self.minSize.height), Self.maxSize.height) & ~1
        c.refreshRate = min(max(refreshRate, 30), 120)
        if let n = name { c.name = String(n.filter { $0.isLetter || $0.isNumber || $0 == " " || $0 == "-" }.prefix(32)) }
        return c
    }

    /// "1280x800" → spec.
    public static func parse(_ s: String) -> VirtualDisplaySpec? {
        let parts = s.lowercased().split(separator: "x").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return VirtualDisplaySpec(width: parts[0], height: parts[1])
    }
}

/// Criação/destruição de displays virtuais. No macOS: `CGVirtualDisplay` (API privada).
public protocol VirtualDisplayProvider: Sendable {
    /// `nil` se disponível; senão, o motivo (ex.: API ausente nesta versão do macOS).
    var unavailableReason: String? { get }
    var maxDisplays: Int { get }
    func create(_ spec: VirtualDisplaySpec) async throws -> DisplayInfo
    func destroy(id: Int) async throws
    func destroyAll() async
    func ids() -> Set<Int>
}

public enum VirtualDisplayError: Error, CustomStringConvertible {
    case unavailable(String)
    case limitReached(Int)
    case notVirtual(Int)
    case creationFailed(String)

    public var description: String {
        switch self {
        case .unavailable(let r): return "displays virtuais indisponíveis: \(r)"
        case .limitReached(let n): return "limite de \(n) displays virtuais atingido"
        case .notVirtual(let id): return "display \(id) não é virtual (ou não existe)"
        case .creationFailed(let r): return "falha ao criar display virtual: \(r)"
        }
    }
}

/// Lista de displays e fábrica de streams: a "plataforma".
public protocol HostPlatform: Sendable {
    var permissions: PermissionChecker { get }
    var virtualDisplays: VirtualDisplayProvider? { get }
    func displays() async throws -> [DisplayInfo]
    func makeStream(display: DisplayInfo, settings: StreamSettings) throws -> VideoStreamSource
}
