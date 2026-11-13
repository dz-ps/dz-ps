#if os(macOS)
import ApplicationServices
import CoreGraphics
import Foundation
import HostCore

public struct MacPermissions: PermissionChecker {
    public init() {}
    public func screenCapture() -> PermissionState { CGPreflightScreenCaptureAccess() ? .granted : .denied }
    public func accessibility() -> PermissionState { AXIsProcessTrusted() ? .granted : .denied }
    public func requestScreenCapture() { _ = CGRequestScreenCaptureAccess() }
}

/// Plataforma macOS: displays do CoreGraphics + streams ScreenCaptureKit/VideoToolbox.
public final class MacPlatform: HostPlatform, @unchecked Sendable {
    public let permissions: PermissionChecker = MacPermissions()
    private let lock = NSLock()
    // O protocolo usa u16 para o id; CGDirectDisplayID de monitor externo passa disso.
    private var idMap: [CGDirectDisplayID: Int] = [:]
    private var nextId = 1

    public init() {}

    public func displays() async throws -> [DisplayInfo] {
        var count: UInt32 = 0
        guard CGGetActiveDisplayList(0, nil, &count) == .success else { return [] }
        var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
        guard CGGetActiveDisplayList(count, &ids, &count) == .success else { return [] }
        return ids.prefix(Int(count)).map { cg in
            let mode = CGDisplayCopyDisplayMode(cg)
            let w = mode?.pixelWidth ?? Int(CGDisplayPixelsWide(cg))
            let h = mode?.pixelHeight ?? Int(CGDisplayPixelsHigh(cg))
            let builtin = CGDisplayIsBuiltin(cg) != 0
            return DisplayInfo(
                id: shortId(for: cg),
                name: builtin ? "Built-in" : "Display \(cg)",
                width: w, height: h,
                virtual: false,
                main: CGDisplayIsMain(cg) != 0
            )
        }
    }

    public func makeStream(display: DisplayInfo, settings: StreamSettings) throws -> VideoStreamSource {
        guard let cg = cgDisplay(for: display.id) else { throw MacError.displayNotFound(display.id) }
        let size = settings.fit(width: display.width, height: display.height)
        return MacDisplayStream(displayId: display.id, cgDisplayID: cg, width: size.width, height: size.height,
                                fps: settings.fps, bitrateKbps: settings.bitrateKbps)
    }

    private func shortId(for cg: CGDirectDisplayID) -> Int {
        lock.withLock {
            if let id = idMap[cg] { return id }
            let id = nextId
            nextId += 1
            idMap[cg] = id
            return id
        }
    }

    private func cgDisplay(for id: Int) -> CGDirectDisplayID? {
        lock.withLock { idMap.first(where: { $0.value == id })?.key }
    }
}

public enum MacError: Error, CustomStringConvertible {
    case displayNotFound(Int)
    case videoToolbox(String, OSStatus)

    public var description: String {
        switch self {
        case .displayNotFound(let id): return "display \(id) não encontrado pelo ScreenCaptureKit"
        case let .videoToolbox(call, st): return "\(call) falhou (OSStatus \(st))"
        }
    }
}
#endif
