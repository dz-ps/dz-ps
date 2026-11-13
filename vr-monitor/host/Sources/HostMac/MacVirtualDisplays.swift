#if os(macOS)
import CGVirtualDisplayBridge
import CoreGraphics
import Foundation
import HostCore

/// Displays virtuais via `CGVirtualDisplay` (API privada, ver docs/ARCHITECTURE.md §2.2).
/// O display existe enquanto o objeto estiver vivo; soltar a referência remove o display.
/// Se o processo morrer, o macOS remove todos sozinho.
final class MacVirtualDisplays: VirtualDisplayProvider, @unchecked Sendable {
    struct Entry {
        let id: Int
        let display: CGVirtualDisplay
        let spec: VirtualDisplaySpec
        let serial: UInt32
    }

    let maxDisplays: Int
    private let lock = NSLock()
    private var entries: [Int: Entry] = [:]
    private let queue = DispatchQueue(label: "vrmonitor.virtual-display")
    /// Mapeia CGDirectDisplayID ↔ id curto (compartilhado com o MacPlatform).
    private let shortId: (CGDirectDisplayID) -> Int

    init(maxDisplays: Int, shortId: @escaping (CGDirectDisplayID) -> Int) {
        self.maxDisplays = maxDisplays
        self.shortId = shortId
    }

    var unavailableReason: String? {
        let needed = ["CGVirtualDisplay", "CGVirtualDisplayDescriptor", "CGVirtualDisplaySettings", "CGVirtualDisplayMode"]
        let missing = needed.filter { NSClassFromString($0) == nil }
        return missing.isEmpty ? nil : "API privada ausente nesta versão do macOS (\(missing.joined(separator: ", "))). Use o fallback do BetterDisplay."
    }

    func ids() -> Set<Int> { lock.withLock { Set(entries.keys) } }

    func info(for id: Int) -> (name: String, spec: VirtualDisplaySpec)? {
        lock.withLock { entries[id].map { ($0.display.name, $0.spec) } }
    }

    func create(_ requested: VirtualDisplaySpec) async throws -> DisplayInfo {
        if let r = unavailableReason { throw VirtualDisplayError.unavailable(r) }
        let spec = requested.clamped()
        let (serial, index): (UInt32, Int) = try lock.withLock {
            guard entries.count < maxDisplays else { throw VirtualDisplayError.limitReached(maxDisplays) }
            // serial estável por "slot": o macOS lembra o arranjo de cada display entre execuções
            let used = Set(entries.values.map(\.serial))
            let s = (1...UInt32(maxDisplays)).first { !used.contains($0) } ?? UInt32(entries.count + 1)
            return (s, Int(s))
        }

        let scale = spec.hiDPI ? 2 : 1
        let desc = CGVirtualDisplayDescriptor()
        desc.setDispatchQueue(queue)
        desc.name = spec.name ?? "vr-monitor \(index)"
        desc.maxPixelsWide = UInt32(spec.width * scale)
        desc.maxPixelsHigh = UInt32(spec.height * scale)
        // tamanho físico fictício de ~110 ppi (só afeta o que o macOS acha que é o "tamanho" da tela)
        desc.sizeInMillimeters = CGSize(width: Double(spec.width) / 110 * 25.4, height: Double(spec.height) / 110 * 25.4)
        desc.vendorID = 0x5652   // "VR"
        desc.productID = 0x4D4E  // "MN"
        desc.serialNum = serial
        desc.terminationHandler = { _, _ in
            FileHandle.standardError.write(Data("aviso: o sistema encerrou o display virtual \(serial)\n".utf8))
        }

        guard let display = CGVirtualDisplay(descriptor: desc) else {
            throw VirtualDisplayError.creationFailed("CGVirtualDisplay(descriptor:) retornou nil")
        }
        let settings = CGVirtualDisplaySettings()
        settings.hiDPI = spec.hiDPI ? 1 : 0
        // no modo HiDPI o "modo" é o tamanho em pontos; o framebuffer tem o dobro de pixels
        settings.modes = [CGVirtualDisplayMode(width: UInt(spec.width), height: UInt(spec.height), refreshRate: CGFloat(spec.refreshRate))]
        guard display.applySettings(settings) else {
            throw VirtualDisplayError.creationFailed("applySettings falhou (modo \(spec.width)×\(spec.height) recusado)")
        }

        let cg = display.displayID
        guard cg != 0, await waitUntilActive(cg) else {
            throw VirtualDisplayError.creationFailed("o display \(cg) não apareceu na lista de displays ativos")
        }
        let id = shortId(cg)
        lock.withLock { entries[id] = Entry(id: id, display: display, spec: spec, serial: serial) }
        return DisplayInfo(id: id, name: desc.name, width: spec.width * scale, height: spec.height * scale, virtual: true, main: false)
    }

    func destroy(id: Int) async throws {
        let removed: Entry? = lock.withLock { entries.removeValue(forKey: id) }
        guard removed != nil else { throw VirtualDisplayError.notVirtual(id) }
        // a última referência sai de escopo aqui → o macOS remove o display
    }

    func destroyAll() async {
        lock.withLock { entries.removeAll() }
    }

    /// O display leva um instante pra aparecer em CGGetActiveDisplayList (e no ScreenCaptureKit).
    private func waitUntilActive(_ cg: CGDirectDisplayID) async -> Bool {
        for _ in 0..<40 {
            var count: UInt32 = 0
            CGGetActiveDisplayList(0, nil, &count)
            var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
            CGGetActiveDisplayList(count, &ids, &count)
            if ids.contains(cg) { return true }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return false
    }
}
#endif
