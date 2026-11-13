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

/// Lista de displays e fábrica de streams: a "plataforma".
public protocol HostPlatform: Sendable {
    var permissions: PermissionChecker { get }
    func displays() async throws -> [DisplayInfo]
    func makeStream(display: DisplayInfo, settings: StreamSettings) throws -> VideoStreamSource
}
