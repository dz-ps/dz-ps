import Foundation
import HostCore
import HTTPTypes
import Hummingbird
import HummingbirdWebSocket
import Logging
import NIOCore

struct ServerConfig {
    var bind: String
    var port: Int
    var staticDir: String
    var token: String
    var policy: AccessPolicy
    var inputEnabled: Bool
}

/// Clientes do canal de controle, pra broadcast (ex.: lista de displays mudou).
final class ControlClients: @unchecked Sendable {
    private let lock = NSLock()
    private var writers: [UUID: WebSocketOutboundWriter] = [:]

    func add(_ id: UUID, _ w: WebSocketOutboundWriter) { lock.withLock { writers[id] = w } }
    func remove(_ id: UUID) { _ = lock.withLock { writers.removeValue(forKey: id) } }

    func broadcast(_ m: HostMessage) async {
        let text = m.json()
        for w in lock.withLock({ Array(writers.values) }) {
            try? await w.write(.text(text))
        }
    }
}

/// Checagem de `Host` + headers de segurança em todas as respostas HTTP.
struct SecurityMiddleware<Context: RequestContext>: RouterMiddleware {
    let policy: AccessPolicy

    func handle(_ request: Request, context: Context, next: (Request, Context) async throws -> Response) async throws -> Response {
        guard policy.hostAllowed(request.head.authority) else {
            throw HTTPError(.misdirectedRequest)
        }
        var res = try await next(request, context)
        res.headers[HTTPField.Name("Content-Security-Policy")!] =
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' data: blob:; " +
            "style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'"
        res.headers[HTTPField.Name("X-Content-Type-Options")!] = "nosniff"
        res.headers[HTTPField.Name("Referrer-Policy")!] = "no-referrer"
        res.headers[HTTPField.Name("Cross-Origin-Resource-Policy")!] = "same-origin"
        res.headers[.cacheControl] = "no-store"
        return res
    }
}

/// Autorização do upgrade de WebSocket: Host, Origin e token (via subprotocolo).
struct UpgradeGuard: Sendable {
    let policy: AccessPolicy
    let token: String
    let limiter: AuthLimiter
    let logger: Logger

    func check(_ req: Request) throws -> RouterShouldUpgrade {
        let now = Date().timeIntervalSince1970
        guard policy.hostAllowed(req.head.authority) else {
            logger.warning("upgrade recusado: Host não permitido")
            throw HTTPError(.misdirectedRequest)
        }
        guard policy.originAllowed(req.headers[.origin]) else {
            logger.warning("upgrade recusado: Origin não permitido", metadata: ["origin": "\(req.headers[.origin] ?? "-")"])
            throw HTTPError(.forbidden)
        }
        guard !limiter.isBlocked(now: now) else { throw HTTPError(.tooManyRequests) }
        let sp = SessionToken.parseSubprotocols(req.headers[values: .secWebSocketProtocol])
        guard sp.hasProtocol, let t = sp.token, SessionToken.constantTimeEquals(t, token) else {
            limiter.recordFailure(now: now)
            logger.warning("upgrade recusado: token inválido")
            throw HTTPError(.unauthorized)
        }
        return .upgrade([.secWebSocketProtocol: SessionToken.subprotocol])
    }
}

func virtualCapability(_ platform: HostPlatform) -> VirtualCapability {
    guard let v = platform.virtualDisplays else { return VirtualCapability(available: false, reason: "não suportado nesta plataforma", max: 0) }
    let reason = v.unavailableReason
    return VirtualCapability(available: reason == nil, reason: reason, max: v.maxDisplays)
}

func buildApplication(config: ServerConfig, hub: StreamHub, platform: HostPlatform, clients: ControlClients, logger: Logger) -> some ApplicationProtocol {
    let router = Router(context: BasicWebSocketRequestContext.self)
    let guardian = UpgradeGuard(policy: config.policy, token: config.token, limiter: AuthLimiter(), logger: logger)

    router.add(middleware: SecurityMiddleware(policy: config.policy))
    router.get("/healthz") { _, _ in "ok" }
    router.add(middleware: FileMiddleware(config.staticDir, searchForIndexHtml: true, logger: logger))

    // ---------------- canal de controle ----------------
    router.ws("/ws/control", shouldUpgrade: { req, _ in try guardian.check(req) }) { inbound, outbound, ctx in
        let log = ctx.logger
        let clientId = UUID()
        clients.add(clientId, outbound)
        defer { clients.remove(clientId) }
        log.info("cliente de controle conectado")
        for try await message in inbound.messages(maxSize: 64 * 1024) {
            guard case .text(let text) = message, let m = ClientMessage.parse(text) else { continue }
            switch m {
            case .hello(let ua):
                log.info("hello", metadata: ["ua": "\(ua.prefix(120))"])
                let p = platform.permissions
                let welcome = HostMessage.welcome(
                    hostTimeUs: HostClock.nowMicros(),
                    displays: await hub.displays(),
                    permissions: Permissions(screen: p.screenCapture(), accessibility: p.accessibility()),
                    inputEnabled: config.inputEnabled,
                    virtualDisplays: virtualCapability(platform)
                )
                try await outbound.write(.text(welcome.json()))
            case let .ping(id, c0):
                try await outbound.write(.text(HostMessage.pong(id: id, c0: c0, h: HostClock.nowMicros()).json()))
            case .keyframe(let d):
                await hub.requestKeyframe(display: d)
            case let .streamConfig(d, fps, kbps, _):
                await hub.configure(display: d, fps: fps, bitrateKbps: kbps)
            case let .stats(d, fps, decodeMs, e2eMs):
                log.debug("stats", metadata: ["display": "\(d)", "fps": "\(fps)", "decodeMs": "\(decodeMs)", "e2eMs": "\(e2eMs)"])
            case .displayCreate(let spec):
                guard let v = platform.virtualDisplays else {
                    try await outbound.write(.text(HostMessage.error(code: "virtual.unsupported", message: "displays virtuais não suportados").json()))
                    continue
                }
                do {
                    let d = try await v.create(spec)
                    log.info("display virtual criado", metadata: ["display": "\(d.id)", "tamanho": "\(d.width)x\(d.height)"])
                    logMemory(log)
                    await clients.broadcast(.displays(await hub.displays()))
                } catch {
                    log.error("criação de display virtual falhou", metadata: ["erro": "\(error)"])
                    try await outbound.write(.text(HostMessage.error(code: "virtual.create", message: "\(error)").json()))
                }
            case .displayDestroy(let id):
                do {
                    guard let v = platform.virtualDisplays, v.ids().contains(id) else { throw VirtualDisplayError.notVirtual(id) }
                    await hub.removeDisplay(id)
                    try await v.destroy(id: id)
                    log.info("display virtual removido", metadata: ["display": "\(id)"])
                    await clients.broadcast(.displays(await hub.displays()))
                } catch {
                    try await outbound.write(.text(HostMessage.error(code: "virtual.destroy", message: "\(error)").json()))
                }
            case .unknown(let t):
                log.debug("mensagem desconhecida", metadata: ["t": "\(t)"])
            }
        }
        log.info("cliente de controle desconectado")
    }

    // ---------------- vídeo, um socket por display ----------------
    router.ws("/ws/video", shouldUpgrade: { req, _ in try guardian.check(req) }) { inbound, outbound, ctx in
        guard let id = ctx.request.uri.queryParameters.get("display", as: Int.self) else { return }
        let sub: VideoSubscriber
        do {
            sub = try await hub.subscribe(display: id)
        } catch {
            ctx.logger.error("falha ao iniciar stream", metadata: ["display": "\(id)", "erro": "\(error)"])
            return
        }
        ctx.logger.info("cliente de vídeo conectado", metadata: ["display": "\(id)"])
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask {
                    for await var msg in sub.stream {
                        VideoProtocol.patchSendTime(&msg, HostClock.nowMicros())
                        try await outbound.write(.binary(ByteBuffer(bytes: msg)))
                        sub.didSend()
                    }
                }
                group.addTask {
                    // o cliente não manda nada aqui; só esperamos o socket fechar
                    for try await _ in inbound.messages(maxSize: 1024) {}
                }
                _ = try await group.next()
                group.cancelAll()
            }
        } catch {
            ctx.logger.debug("socket de vídeo encerrado", metadata: ["erro": "\(error)"])
        }
        await hub.unsubscribe(display: id, sub)
        ctx.logger.info("cliente de vídeo desconectado", metadata: ["display": "\(id)"])
    }

    return Application(
        router: router,
        server: .http1WebSocketUpgrade(webSocketRouter: router),
        configuration: .init(address: .hostname(config.bind, port: config.port), serverName: nil),
        logger: logger
    )
}

func logMemory(_ log: Logger) {
    if let mb = ProcessStats.footprintMB() {
        log.info("memória do host: \(String(format: "%.0f", mb)) MB")
    }
}
