import ArgumentParser
import Foundation
import HostCore
import Hummingbird
import Logging
#if os(macOS)
import HostMac
#endif

@main
struct VRMonitor: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "vrmonitor",
        abstract: "Host do vr-monitor: captura displays e transmite para o cliente web."
    )

    @Option(help: "Endereço de bind. Só loopback é aceito sem --wifi.") var bind = "127.0.0.1"
    @Option(help: "Porta HTTP/WebSocket.") var port = 8420
    @Option(name: .customLong("static"), help: "Pasta do build do cliente (client/dist).") var staticDir = "../client/dist"
    @Option(name: .customLong("allow-origin"), help: "Origin extra permitido (ex.: http://localhost:5173 para o Vite em dev).") var allowOrigins: [String] = []
    @Option(help: "Fonte de vídeo: mac (ScreenCaptureKit) ou synthetic (clipe de teste).") var source = defaultSource
    @Option(help: "Clipe H.264 Annex B para --source synthetic.") var clip = "test-clip.h264"
    @Option(help: "Largura máxima do stream.") var maxWidth = 1280
    @Option(help: "Altura máxima do stream.") var maxHeight = 800
    @Option(help: "fps inicial.") var fps = 60
    @Option(help: "Bitrate inicial em kbps.") var kbps = 6000
    @Option(help: "Displays virtuais a criar na inicialização.") var virtual = 0
    @Option(name: .customLong("virtual-size"), help: "Tamanho dos displays virtuais (ex.: 1280x800).") var virtualSize = "1280x800"
    @Flag(name: .customLong("virtual-hidpi"), help: "Displays virtuais em HiDPI (2x pixels; geralmente desperdício no VR).") var virtualHiDPI = false
    @Option(name: .customLong("max-virtual"), help: "Máximo de displays virtuais.") var maxVirtual = 4
    @Flag(help: "Modo Wi-Fi (Fase 6, ainda não implementado).") var wifi = false
    @Flag(help: "Logs detalhados.") var verbose = false

    static var defaultSource: String {
        #if os(macOS)
        return "mac"
        #else
        return "synthetic"
        #endif
    }

    func validate() throws {
        if wifi { throw ValidationError("--wifi ainda não está implementado (Fase 6).") }
        if !["127.0.0.1", "localhost", "::1"].contains(bind) {
            throw ValidationError("bind em \(bind) recusado: sem --wifi só loopback é permitido.")
        }
        guard (1...65535).contains(port) else { throw ValidationError("porta inválida") }
        guard VirtualDisplaySpec.parse(virtualSize) != nil else { throw ValidationError("--virtual-size inválido (use LxA, ex.: 1280x800)") }
        guard (0...16).contains(maxVirtual), (0...maxVirtual).contains(virtual) else { throw ValidationError("--virtual deve estar entre 0 e --max-virtual") }
    }

    func run() async throws {
        LoggingSystem.bootstrap { label in
            var h = StreamLogHandler.standardError(label: label)
            h.logLevel = verbose ? .debug : .info
            return h
        }
        let logger = Logger(label: "vrmonitor")

        // token: VRM_TOKEN (passado pelo run.sh) ou gerado agora
        let env = ProcessInfo.processInfo.environment["VRM_TOKEN"]
        let token: String
        if let t = env, !t.isEmpty {
            guard SessionToken.isWellFormed(t) else { throw ValidationError("VRM_TOKEN mal formado (base64url, 16–128 chars)") }
            token = t
        } else {
            token = SessionToken.generate()
        }

        let platform: HostPlatform
        switch source {
        case "synthetic":
            platform = SyntheticPlatform(clipPath: clip, maxVirtual: maxVirtual)
        case "mac":
            #if os(macOS)
            platform = MacPlatform(maxVirtual: maxVirtual)
            #else
            throw ValidationError("--source mac só existe no macOS")
            #endif
        default:
            throw ValidationError("fonte desconhecida: \(source)")
        }

        if platform.permissions.screenCapture() != .granted {
            platform.permissions.requestScreenCapture()
            printPermissionHelp()
            throw ExitCode(2)
        }

        let staticPath = URL(fileURLWithPath: staticDir).standardizedFileURL.path
        if !FileManager.default.fileExists(atPath: staticPath + "/index.html") {
            logger.warning("cliente não encontrado em \(staticPath) — rode npm run build em client/")
        }

        let settings = StreamSettings(maxWidth: maxWidth, maxHeight: maxHeight, fps: fps, bitrateKbps: kbps)
        let hub = StreamHub(platform: platform, settings: settings, logger: logger)
        let config = ServerConfig(
            bind: bind, port: port, staticDir: staticPath, token: token,
            policy: AccessPolicy(port: port, extraOrigins: allowOrigins),
            inputEnabled: false
        )

        // displays virtuais da linha de comando
        if virtual > 0 {
            guard let v = platform.virtualDisplays else { throw ValidationError("plataforma sem displays virtuais") }
            if let reason = v.unavailableReason {
                print("✘ \(reason)")
                throw ExitCode(3)
            }
            var spec = VirtualDisplaySpec.parse(virtualSize)!
            spec.hiDPI = virtualHiDPI
            logMemory(logger)
            for _ in 0..<virtual {
                let d = try await v.create(spec)
                logger.info("display virtual criado: \(d.id) \(d.width)×\(d.height)")
                logMemory(logger)
            }
        }

        let displays = try await platform.displays()
        for d in displays {
            logger.info("display \(d.id): \(d.name) \(d.width)×\(d.height)\(d.main ? " (principal)" : "")")
        }
        print("""

          vr-monitor ouvindo em http://\(bind):\(port)  (fonte: \(source))
          No Mac (simulador):  http://localhost:\(port)/#t=\(token)
          No celular (adb reverse tcp:\(port) tcp:\(port)):  http://localhost:\(port)/#t=\(token)

        """)
        fflush(stdout)

        let clients = ControlClients()
        let app = buildApplication(config: config, hub: hub, platform: platform, clients: clients, logger: logger)

        // log periódico: memória + fps/kbps por stream (sem conteúdo de tela)
        let reporter = Task {
            let window = 10.0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(window * 1e9))
                let lines = await hub.report(window: window)
                guard !lines.isEmpty else { continue }
                logMemory(logger)
                for l in lines { logger.info("\(l)") }
            }
        }

        try await app.runService(gracefulShutdownSignals: [.sigterm, .sigint])
        reporter.cancel()
        await hub.stopAll()
        await platform.virtualDisplays?.destroyAll()
        logger.info("encerrado; displays virtuais removidos")
    }

    private func printPermissionHelp() {
        let term = ProcessInfo.processInfo.environment["TERM_PROGRAM"] ?? "seu app de terminal"
        print("""

        ✘ Falta a permissão de Gravação de Tela.
          Ela é concedida ao app de terminal que roda o vrmonitor (\(term)), não ao binário.

          1. Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela e Áudio do Sistema
          2. Ative \(term) (se não aparecer, use o "+" e adicione o app)
          3. Feche e reabra o \(term) por completo (⌘Q) e rode de novo

        """)
        fflush(stdout)
    }
}

