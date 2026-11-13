# Arquitetura — vr-monitor

Monitor virtual em VR caseiro: displays virtuais no Mac → captura → H.264 em hardware →
WebSocket → Chrome no Android (WebCodecs + Three.js) → estéreo com distorção de lente num
VR Box 2.0, com head tracking 3DoF, gaze, toque, controle BT e mãos (MediaPipe).

Este documento registra as decisões e o protocolo. Onde eu divergi dos defaults pedidos,
a seção começa com **[Desvio]** e explica o porquê.

---

## 1. Visão geral

```
┌──────────────────────── Mac (host, Swift CLI) ─────────────────────────┐
│                                                                         │
│  VirtualDisplayProvider ──► FrameSource (SCStream/display) ──► Encoder  │
│   (CGVirtualDisplay)          420v, cursor, idle-aware        (VT H.264)│
│                                                                   │     │
│  InputInjector (CGEvent) ◄── ControlChannel (JSON) ◄──┐           ▼     │
│                                                       │   VideoChannel  │
│               HTTP server (Hummingbird) ── static ────┤   (binário)     │
│               bind 127.0.0.1:8420                     │           │     │
└───────────────────────────────────────────────────────┼───────────┼─────┘
                         adb reverse tcp:8420 (USB)     │           │
┌───────────────────────── Android / Chrome ────────────┼───────────┼─────┐
│  http://localhost:8420  (contexto seguro)             ▼           ▼     │
│  ControlClient ◄──► Input (gaze, toque, gamepad, mãos)   VideoDecoder   │
│  ClockSync                                              (WebCodecs, HW) │
│  HeadTracker (RelativeOrientationSensor)                     │VideoFrame│
│  Scene (painéis curvos) ─► StereoRenderer (2 câmeras off-axis) ─►       │
│                            DistortionPass (k1,k2, centro por olho)      │
│  HandTracker (MediaPipe, câmera traseira) ─► Passthrough (mesmo stream) │
└─────────────────────────────────────────────────────────────────────────┘
```

Estrutura do repo (planejada):

```
vr-monitor/
  host/            Swift Package (CLI `vrmonitor`)
    Sources/
      CGVirtualDisplayBridge/   target C com headers da API privada
      HostCore/                 protocolos (interfaces) + protocolo de rede, sem dependência de plataforma
      HostMac/                  implementações macOS (SCK, VT, CGEvent, CGVirtualDisplay)
      vrmonitor/                main, CLI, servidor
    Tests/
  client/          Vite + TypeScript strict + Three.js
    src/
      net/ video/ scene/ stereo/ tracking/ input/ hands/ ui/ calib/
    test/          Vitest
  scripts/         check-env.sh, run.sh, probe.sh
  tools/probe/     página de sondagem de capacidades do celular (Fase 0)
  docs/            ARCHITECTURE.md, PROGRESS.md
```

---

## 2. Host (Swift)

### 2.1 Interfaces (camada portável)

Tudo que é específico do macOS fica atrás de protocolos em `HostCore`. O servidor e a lógica
de sessão só conhecem essas interfaces.

```swift
protocol VirtualDisplayProvider {
  func create(_ spec: DisplaySpec) async throws -> DisplayHandle   // largura, altura, hiDPI, nome, refresh
  func destroy(_ id: DisplayID) async throws
  func list() -> [DisplayInfo]                                       // inclui displays físicos (main)
}

protocol FrameSource {          // um por display
  var frames: AsyncStream<CapturedFrame> { get }   // pixel buffer + captureTimeUs
  func start(fps: Int) async throws
  func stop() async
  func lastFrame() -> CapturedFrame?              // pra reenviar quando o SCStream está idle
}

protocol VideoEncoder {
  var output: AsyncStream<EncodedUnit> { get }    // config (avcC) ou sample (AVCC), keyframe flag
  func encode(_ frame: CapturedFrame, forceKeyframe: Bool)
  func update(bitrateKbps: Int, fps: Int)
}

protocol InputInjector {
  func preflight() -> PermissionState
  func inject(_ event: InputEvent, on display: DisplayInfo) throws  // coords normalizadas [0,1]
}

protocol PermissionChecker { func screenCapture() -> PermissionState; func accessibility() -> PermissionState }
```

**[Ajuste na Fase 1]** No código, o `HostCore` expõe captura+encode juntos como
`VideoStreamSource` (que emite `EncodedUnit`: config ou frame AVCC), mais um `HostPlatform`
(lista de displays, permissões, fábrica de streams). `FrameSource` e `VideoEncoder` viraram
detalhes internos do `HostMac` (`MacDisplayStream` + `H264Encoder`), porque o `CVPixelBuffer` não
existe fora do macOS e não vale a pena abstraí-lo. Também existe um `SyntheticStream` (clipe H.264
em loop) que roda em qualquer plataforma, pra testar sem captura.

**Sobre portar pro Windows:** o contrato realmente estável é o **protocolo de rede** (seção 4).
O cliente não sabe nada do host. No Windows, o host provavelmente seria reescrito (C#/Rust/C++)
com: driver IddCx (ex.: Virtual Display Driver) → Windows.Graphics.Capture ou DXGI Desktop
Duplication → Media Foundation / NVENC / AMF / QSV → `SendInput`. As interfaces Swift acima são o
mapa de módulos dessa reescrita. Swift on Windows existe, mas as APIs de sistema seriam todas novas
de qualquer forma, então não vou investir em portabilidade do código Swift em si.

### 2.2 Displays virtuais — `CGVirtualDisplay`

- API privada do CoreGraphics (`CGVirtualDisplay`, `CGVirtualDisplayDescriptor`,
  `CGVirtualDisplaySettings`, `CGVirtualDisplayMode`), a mesma que o DeskPad usa.
- Os headers Objective-C ficam num target C do SwiftPM (`CGVirtualDisplayBridge`) só com
  declarações `@interface`. Os símbolos existem no CoreGraphics em runtime, então não há nada pra
  linkar além do framework.
- O display existe enquanto o objeto `CGVirtualDisplay` estiver vivo. O host mantém as referências
  e destrói tudo em SIGINT/SIGTERM. Se o processo morrer com SIGKILL, o macOS remove os displays
  sozinho.
- **Risco:** o limite de displays no M1 Air. O M1 aceita só 1 monitor externo **físico**, mas
  displays virtuais não passam pelo mesmo caminho de hardware: o BetterDisplay cria vários no M1.
  Vou validar na Fase 2, nesta ordem: 1 display, depois 2, depois 3. Também vou medir o custo de GPU
  e memória de cada display extra no WindowServer.
- **[Implementação, Fase 2]** `MacVirtualDisplays`:
  - as quatro classes são declaradas com `weak_import` e checadas com `NSClassFromString` antes do
    uso; se o macOS remover a API, o host continua funcionando com os displays físicos e explica o
    motivo;
  - o `serialNum` é estável por "slot" (1…N), então o macOS lembra o arranjo de cada display entre
    execuções;
  - o tamanho físico declarado é de ~110 ppi;
  - depois do `applySettings`, o host espera o display aparecer em `CGGetActiveDisplayList`
    (até 4 s) antes de devolvê-lo;
  - `destroy` solta a referência; no Ctrl-C/SIGTERM todos são removidos;
  - limite padrão: 4 (`--max-virtual`).
- **Fallback:** criar as telas virtuais no BetterDisplay e o host só capturar (o `FrameSource` não
  depende de quem criou o display). Fica documentado no README.
- HiDPI: por padrão **desligado** (1x). Ver seção 6 (legibilidade).

### 2.3 Captura — ScreenCaptureKit

- Um `SCStream` por display, `SCContentFilter(display:excludingWindows:[])`.
- `SCStreamConfiguration`: `pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange` (420v),
  `queueDepth = 4` (3 + 1 porque o host segura o último buffer), `showsCursor = true`, `minimumFrameInterval = 1/fps`, `width/height` = resolução
  do display em pixels, `colorSpaceName = sRGB`.
- O status de `SCStreamFrameInfo` vem em cada sample. Frames `.idle`/`.blank` não carregam pixels
  novos e são descartados. Mantemos uma referência ao último `CVPixelBuffer` `.complete`.
  - Quando o cliente pede keyframe (entrou agora, ou deu erro de decode), o encoder recodifica esse
    último buffer com `ForceKeyFrame`. Com a tela parada, o cliente recebe imagem assim mesmo.
  - Reter 1 buffer com queueDepth 3 diminui o pool disponível. Se aparecer stall, copio o buffer
    pra um pool próprio (só nesse caso).
- Timestamp: `SCStreamFrameInfo.displayTime` (mach absolute time) convertido pra µs. Esse é o
  `captureTimeUs` que vai no fio.
- Permissão: `CGPreflightScreenCaptureAccess()` no boot. Se faltar, chamo
  `CGRequestScreenCaptureAccess()` e mostro instruções (seção 7).

### 2.4 Encode — VideoToolbox H.264

- `VTCompressionSession` com `kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder = true`
  e `kVTVideoEncoderSpecification_EnableLowLatencyRateControl = true` (macOS 11.3+; se a criação
  falhar com ela, tento de novo sem e registro isso no log).
- Propriedades: `RealTime = true`, `AllowFrameReordering = false` (sem B-frames),
  `ProfileLevel = H264_High_AutoLevel`, `AverageBitRate` e `ExpectedFrameRate` configuráveis,
  `MaxKeyFrameInterval = fps * 10` (keyframe periódico só como rede de segurança). Keyframe sob
  demanda via `kVTEncodeFrameOptionKey_ForceKeyFrame`.
- Formato de saída: o VT entrega **AVCC** (NAL units com prefixo de 4 bytes) e os parâmetros
  (SPS/PPS) no `CMFormatDescription`. Ver a decisão de formato em 4.3.
- Backpressure: se o WebSocket de vídeo tiver mais de 2 frames na fila de envio, o host descarta
  os próximos P-frames, marca o stream como "sujo" e força keyframe. Nunca mando um P-frame depois
  de um descarte.

### 2.5 Transporte — Hummingbird 2

- `hummingbird` + `hummingbird-websocket` (2.x, async/await). Isso exige macOS 14+ e Swift 6
  (o `check-env.sh` valida).
- Serve o build do cliente (`client/dist`) como estático, com CSP restritiva.
- Endpoints:
  - `GET /` e assets: cliente web.
  - `GET /ws/control`: JSON (texto), um por cliente.
  - `GET /ws/video?display=<id>`: binário, **um WebSocket por display**. Assim o backpressure é
    por stream e cada display pode ter fps e bitrate próprios. Pelo USB tudo passa no mesmo túnel
    do adb, então a separação não ajuda contra head-of-line blocking; ela serve pra organizar o
    controle de fluxo.

### 2.6 Input — CGEvent

- Coordenadas chegam **normalizadas** `[0,1]` relativas ao display. O host converte com
  `CGDisplayBounds(displayID)` (pontos globais, já cobre a posição do display no arranjo).
- Move: `CGEvent(mouseEventSource:mouseType:.mouseMoved, ...)`. Durante drag, o tipo vira
  `.leftMouseDragged`. Clique: down/up com `clickState`. Botão direito: `.rightMouseDown/Up`.
  Scroll: `CGEvent(scrollWheelEvent2Source:units:.pixel, ...)`.
- `AXIsProcessTrustedWithOptions` no boot. Sem permissão, o vídeo continua funcionando e o input
  vira no-op com aviso no cliente.
- **Foco segue olhar:** `focusDisplay` move o cursor pro último ponto conhecido daquele display
  (ou o centro) e manda um clique só se o usuário ativou "foco com clique". Mover o cursor não
  muda a janela com foco de teclado no macOS. Pra digitação cair no display certo, o foco precisa
  de um clique (ou do app ativo já estar naquele display). Por isso há duas opções: "só cursor"
  (padrão) e "cursor + clique".

---

## 3. Cliente (TypeScript + Vite + Three.js)

### 3.1 Decode

- **[Ajuste pós-sondagem]** `hardwareAcceleration` é configurável (`auto` | `prefer-hardware` |
  `prefer-software`). No Poco X7 Pro, o decode em software foi **mais rápido e mais estável** que o
  de hardware em 1280×800 (mediana 8.7 vs 15.9 ms; p95 11.3 vs 57 ms; ver seção 12). No modo `auto`,
  o cliente mede os dois nos primeiros ~60 frames do stream real e fica com o de menor p95. Com
  3 streams em software, o custo de CPU entra no orçamento: os displays fora do olhar já caem pra
  10–15 fps.
- `VideoDecoder` com `optimizeForLatency: true`,
  `codec` vindo do host (ex.: `avc1.640028`), `description` = avcC (ver 4.3).
- `EncodedVideoChunk.timestamp = captureTimeUs`, então o `VideoFrame` de saída carrega o tempo de
  captura e a latência ponta a ponta sai direto daí.
- Política de fila: se `decodeQueueSize > 2`, descarto chunks até o próximo keyframe e peço um.
  Também só fico com o `VideoFrame` mais recente por display: o anterior leva `close()` na hora.
- Upload: `VideoFrame` → textura via `gl.texImage2D(..., frame)` (WebGL2 aceita `VideoFrame` como
  `TexImageSource`). No Three.js, isso é uma `Texture` customizada com `needsUpdate` controlado por
  mim; sem canvas 2D no meio. `frame.close()` logo depois do upload.
- Mipmaps: `generateMipmap` a cada frame novo custa GPU. Com 1280x800 é aceitável, mas fica atrás
  de uma flag: em painel minificado (visão geral) é ligado; em modo foco (≈1:1) pode ser desligado.
  Anisotropia no máximo do `EXT_texture_filter_anisotropic`.
- Erro do decoder → `reset()`, `configure()` com o último config e pedido de keyframe pelo canal de
  controle.

### 3.2 Cena

- Cada display vira um **painel cilíndrico**: pose (posição + orientação), raio de curvatura `R`,
  largura angular, altura. Raio infinito = painel plano.
- Layout padrão: arco centrado no usuário, `R = 1.3 m`, cada painel com ~55° de largura, 2° de
  espaço entre eles. O display principal fica no centro.
- Geometria: `CylinderGeometry` aberta (segmento), normais pra dentro, UV mapeando a textura.

### 3.3 Estéreo manual + distorção

- Não uso WebXR: no Chrome Android ele exige ARCore/Cardboard e não dá controle de lente.
- Por olho: um `WebGLRenderTarget` (tamanho = metade da tela × `renderScale`) renderizado com uma
  câmera de **frustum assimétrico** (off-axis). O frustum é calculado a partir do centro da lente
  na tela, da distância tela-lente e dos limites da tela, igual ao Cardboard SDK. Isso resolve o
  "centro da lente ≠ centro da metade da tela".
- Os olhos ficam a ±IPD/2 do centro da cabeça. O centro da cabeça fica `neckOffset` atrás e abaixo
  dos olhos (opcional, ajuda a reduzir o enjoo na rotação).
- Distortion pass: um quad em tela cheia por olho, fragment shader com
  `r_src = r · (1 + k1·r² + k2·r⁴)`, `r` em unidades tan-ângulo relativas ao **centro da lente**
  (configurável em mm, por olho). Fora do domínio sai preto. Correção de aberração cromática fica
  como opcional futuro (3 amostras com k levemente diferentes).
- Geometria da tela do Poco X7 Pro: 6.67", 2712×1220, ≈446 ppi ⇒ ≈17.6 px/mm, área útil
  ≈154.5 × 69.5 mm. Cada metade tem ≈77 mm, então o centro da metade fica a ≈38.6 mm do meio. As
  lentes do VR Box ficam a ~31–33 mm do meio (IPD de lente ~63 mm): ~6 mm de diferença por lado,
  que precisa ser configurável.
- Fullscreen + `screen.orientation.lock('landscape')` + `navigator.wakeLock.request('screen')`
  (reaplicado em `visibilitychange`).
- Taxa: `requestAnimationFrame` roda na taxa do display. Limito a 60 por padrão pulando frames pelo
  timestamp; 90 e 120 ficam como opção. **Na sondagem o rAF do Chrome veio travado em 60 Hz** (o
  HyperOS limita o navegador), então 90/120 provavelmente nem ficam disponíveis. O cliente detecta
  a taxa real e esconde as opções que o aparelho não entrega.

### 3.4 Head tracking 3DoF

- `RelativeOrientationSensor({ frequency: 60, referenceFrame: 'screen' })`. 60 Hz é o teto do Chrome:
  confirmado na sondagem, pedir 120 também entrega 60 (e o giroscópio idem). Por isso a predição
  abaixo é importante. O quaternion vem no frame da tela, já considerando a paisagem.
- Fallback: `deviceorientation` (alpha/beta/gamma → quaternion, compensando `screen.orientation.angle`).
- Predição: extrapolação curta (~1 frame) usando a velocidade angular derivada dos quaternions,
  configurável (0 = sem predição).
- Recentralizar (duplo toque ou botão do controle): zera só o **yaw**. Pitch e roll vêm da
  gravidade e já são absolutos.

### 3.5 Calibração

- Tela própria: grade de linhas retas renderizada pelo pipeline real, com sliders de IPD,
  separação de lentes, centro vertical da lente, distância tela-lente, FOV, k1, k2, distância dos
  painéis e offset da câmera traseira.
- Presets em `localStorage`, export/import em JSON. O preset inicial é o **VR Box 2.0 / Poco X7
  Pro** (valores de partida, todos a calibrar):
  - separação de lentes 63 mm, centro vertical da lente 35 mm acima da borda inferior da tela;
  - distância tela-lente 39 mm, FOV máximo por olho 50° pra cada lado;
  - k1 = 0.34, k2 = 0.55 (os padrões do Cardboard v2: ponto de partida, não verdade).
- Opcional (última fase): `BarcodeDetector` lendo o QR do viewer → URL `goo.gl/...`/`google.com/cardboard/cfg?p=...`
  → protobuf base64 → parâmetros. Depende do VR Box ter QR (muitos não têm).

---

## 4. Protocolo

### 4.1 Autenticação (em todos os modos)

**[Desvio]** O pedido era token de pareamento só no modo Wi-Fi. Eu exijo token **sempre**, porque
bind em `127.0.0.1` sozinho não basta:

1. **Cross-Site WebSocket Hijacking:** qualquer página aberta no navegador do Mac consegue fazer
   `new WebSocket('ws://127.0.0.1:8420/ws/control')`. WebSocket não passa por CORS. Sem token,
   uma aba maliciosa receberia sua tela e injetaria input.
2. **DNS rebinding** contra o HTTP local.
3. **Outros apps no celular:** o `adb reverse` escuta no loopback do Android e **qualquer app** do
   celular alcança `localhost:8420`.

Mecanismo:
- Ao subir, o host gera um token de 128 bits (CSPRNG, base64url) por sessão.
- O `run.sh` abre `http://localhost:8420/#t=<token>` via `adb shell am start`. O fragmento não vai
  pro servidor nem pros logs. O cliente guarda o token em `sessionStorage` e limpa a URL com
  `history.replaceState`.
- Os WebSockets mandam o token como subprotocolo:
  `new WebSocket(url, ['vrm.v1', 'vrm.auth.' + token])`. O servidor valida em tempo constante e
  responde com `vrm.v1`. Sem token válido, o servidor rejeita no upgrade (401). Nenhum byte de
  vídeo sai e nenhum input entra.
- Além do token, o servidor checa `Origin` (allowlist: `http://localhost:8420`,
  `http://127.0.0.1:8420` e, no Wi-Fi, `https://<host>:<porta>`) e `Host` (anti-rebinding).
- Limitador **global** de falhas: 5 falhas em 10 s → novas tentativas bloqueadas por 5 s. Não dá
  pra ser por peer, porque via `adb reverse` todo mundo chega de 127.0.0.1. O bloqueio é curto pra
  um atacante local não travar o cliente legítimo; com token de 128 bits, força bruta já é inviável.
- Upgrade recusado volta como HTTP 400 (é assim que o Hummingbird trata erro no `shouldUpgrade`).
  O motivo real (Host, Origin ou token) vai pro log do host.
- IDs de display no protocolo são pequenos (1, 2, …) e o host mapeia pro `CGDirectDisplayID`
  (o de monitor externo não cabe em u16).

### 4.2 Canal de controle — `/ws/control` (JSON)

Todas as mensagens têm `t` (tipo). Cliente → host:

| `t` | campos | efeito |
|---|---|---|
| `hello` | `client: {ua, screenW, screenH, dpr}` | primeira mensagem; o host responde `welcome` |
| `ping` | `id, c0` (ms, `performance.now()` do cliente) | sync de relógio |
| `keyframe` | `display` | força keyframe (reaproveitando o último frame se estiver idle) |
| `stream.config` | `display, fps?, bitrateKbps?, active?` | fps/bitrate por display (modos de performance) |
| `display.create` | `width, height, hiDPI?, name?` | cria display virtual |
| `display.destroy` | `display` | destrói |
| `input` | `display, kind, x?, y?, button?, dx?, dy?` | `kind ∈ move, down, up, click, scroll`; `x,y ∈ [0,1]`; `button ∈ left, right` |
| `focus` | `display, click?: bool` | foco segue olhar |
| `stats` | `display, fps, decodeMs, e2eMs` | telemetria do cliente (o host só loga números) |

Host → cliente:

| `t` | campos |
|---|---|
| `welcome` | `proto: 1, hostTimeUs, displays: DisplayInfo[], permissions: {screen, accessibility}, inputEnabled, virtualDisplays: {available, reason?, max}` |
| `pong` | `id, c0, h` (µs do host no momento da resposta) |
| `displays` | `displays: DisplayInfo[]` (enviado quando a lista muda) |
| `error` | `code, message` |

`DisplayInfo = { id, name, width, height, virtual: bool, main: bool }`. `width`/`height` em pixels
do stream.

**Sync de relógio:** o cliente manda `ping` a cada 1 s (5 rápidos no início). Ao receber, calcula
`rtt = c1 - c0` e `offset = h - (c0 + c1)/2` (convertendo ms↔µs). Usa o offset da amostra de
**menor RTT** numa janela das últimas 20. Latência e2e = `nowClient + offset - captureTimeUs`,
medida quando o frame é desenhado.

### 4.3 Canal de vídeo — `/ws/video?display=<id>` (binário, host → cliente)

**Decisão de formato: AVCC.** O VT já produz AVCC, então o host não converte nada por frame. Os
parâmetros (avcC record montado a partir de SPS/PPS do `CMFormatDescription`) vão numa mensagem
`CONFIG` e entram como `description` no `VideoDecoder.configure`. Annex B exigiria reescrever os
prefixos de start code em todo frame no host e reinjetar SPS/PPS em banda. O AVCC deixa a troca
de resolução explícita (um `CONFIG` novo).

Regra: **um `CONFIG` precede todo keyframe** (custa ~40 bytes). Assim qualquer keyframe é ponto de
entrada válido. O cliente só reconfigura o decoder se os bytes do avcC ou as dimensões mudarem.

Header fixo de 28 bytes, little-endian:

| offset | tamanho | campo |
|---|---|---|
| 0 | 2 | magic `0x4D56` ("VM") |
| 2 | 1 | versão = 1 |
| 3 | 1 | tipo: 1 = CONFIG, 2 = FRAME |
| 4 | 2 | `displayId` (u16) |
| 6 | 2 | flags: bit0 = keyframe, bit1 = repeat (reenvio do último frame idle) |
| 8 | 4 | `seq` (u32, por stream) |
| 12 | 8 | `captureTimeUs` (u64, relógio monotônico do host) |
| 20 | 8 | `sendTimeUs` (u64, quando o host enfileirou no socket) |

Payload:
- `CONFIG`: `width u16, height u16, codecLen u8, codec ASCII[codecLen], avcC[resto]`.
- `FRAME`: sample AVCC (NALs com prefixo de tamanho de 4 bytes), sem SPS/PPS.

Encode e decode dessas mensagens moram em `client/src/net/protocol.ts` e
`host/Sources/HostCore/Protocol.swift`, com testes dos dois lados usando os mesmos vetores
(arquivos `.bin` de fixture compartilhados).

---

## 5. Interação

### 5.1 Gaze e toque
- Raio do gaze: centro da cabeça → frente da câmera ciclópica. Interseção com os painéis
  (seção 5.4) devolve `(painel, u, v)`.
- O painel olhado ganha uma borda destacada e a retícula aparece no ponto.
- **Foco segue olhar** (toggle): dwell configurável (padrão 600 ms) no mesmo painel → `focus`.
- Toque único na tela do celular (botão do cardboard) = `click` no ponto do gaze. Duplo toque =
  recentralizar. Pra distinguir os dois, o toque único espera 250 ms; dá pra trocar pra
  "clique imediato e recentralizar com toque longo" na config, se o atraso incomodar.

### 5.2 Controle "VR BOX" (Fase 4)
- Gamepad API (`navigator.getGamepads()` em polling no rAF) **e** `keydown`/`keyup`,
  `pointer`/`wheel`, porque dependendo do modo o controle aparece como gamepad, teclado/mídia ou
  mouse.
- Tela de mapeamento: "aperte o botão para a ação X". Captura o que chegar (botão de gamepad,
  `code` de tecla ou botão de mouse) e salva em `localStorage`. Ações: recentralizar, clique,
  toggle passthrough, toggle mãos, modo foco.
- A página de sondagem da Fase 0 já registra os eventos que o controle gera em cada modo.

### 5.3 Mãos (Fase 5)
- `getUserMedia` na câmera traseira escolhida (lista por `enumerateDevices`; a ultrawide é
  preferida se aparecer), 640×480 @ 15/30 fps. **No Poco X7 Pro o Chrome só expõe a câmera
  principal** ("camera 0", máx. 4096×3072): **a ultrawide não aparece**. Isso é limitação do
  Camera2/HyperOS e não tem contorno pela web. O FOV horizontal da principal fica em ~65–70°, então
  as mãos precisam ficar mais à frente e mais centralizadas. A sondagem mediu 15 fps entregues
  pedindo 30 (provável auto-exposição em pouca luz): a refazer com boa luz. O mesmo `MediaStream` alimenta o MediaPipe e o
  passthrough.
- `@mediapipe/tasks-vision` `HandLandmarker`, `runningMode: 'VIDEO'`, `delegate: 'GPU'`, 1 mão. O
  wasm e o modelo `.task` ficam no build (nada de CDN em runtime).
- **Ponto de mira estável:** média dos landmarks 5 (MCP do indicador) e 9 (MCP do médio), com
  pesos configuráveis. Pinçar quase não mexe esses pontos.
- **Raio:**
  1. Landmark → direção no frame da câmera, usando o FOV calibrável da câmera (pinhole).
  2. Profundidade estimada: `z ≈ f_px · palmWidth_m / palmWidth_px`. O `palmWidth_m` sai dos
     `worldLandmarks` (métricos), e a largura da palma é a distância 5↔17.
  3. Ponto da mão no frame da cabeça = `cameraOffset` (calibrável, em mm, com rotação opcional) +
     direção · z.
  4. O raio sai do centro da cabeça e passa por esse ponto. Depois ele é rotacionado pela
     orientação da cabeça **no timestamp do frame da câmera**: guardo um histórico curto de
     quaternions pra compensar os ~50–80 ms de atraso da câmera + inferência.
  5. One Euro Filter na direção do raio (yaw/pitch), com `minCutoff`/`beta` configuráveis.
- **Gestos:** máquina de estados com histerese e debounce. As distâncias são normalizadas pelo
  tamanho da mão (`|L0 − L9|` em world landmarks).
  - `IDLE → PINCH_CANDIDATE` quando `d(4,8) < enter` (padrão 0.25). Sai quando `> exit` (0.35).
  - Pinça curta (< 250 ms, pouco movimento) = clique esquerdo.
  - Pinça mantida (> 250 ms ou movimento > limiar) = `DRAG` (down → moves → up).
  - Pinça polegar-médio `d(4,12)` = clique direito (com os mesmos limiares).
  - Punho: todas as pontas perto da palma (`d(tip, L0) / d(mcp, L0) < 1.15`) → `SCROLL`, com o
    delta vertical do centro da palma virando scroll.
  - Modo layout (toggle): pinça mantida num painel → `GRAB` move o painel no arco (yaw/pitch) e a
    distância muda o raio. Com as duas mãos, redimensiona (se a perf aguentar 2 mãos; senão, a
    pinça polegar-médio no modo layout redimensiona).
  - Debounce: N frames consecutivos pra entrar em qualquer estado (padrão 2).
- Overlay de debug: esqueleto 2D (no canto da visão, em ambos os olhos), retícula do raio e o
  estado atual.
- **Risco de perf:** `detectForVideo` é síncrono. Na thread principal ele disputa com o render a
  60 fps. Plano: medir no Poco X7 Pro (Dimensity 8400 / Mali-G720). Se o custo passar de ~6 ms por
  frame do render, movo o HandLandmarker pra um Worker com `OffscreenCanvas`.

### 5.4 Interseção raio-painel
- O raio é transformado pro frame local do painel. Lá o painel é um cilindro de eixo Y local,
  raio `R`, com o centro do arco em `(0, 0, R)` local (o painel passa pela origem local, voltado
  pra -Z).
- Quadrática ray-cylinder no plano XZ. Fico com a menor raiz `t > 0` cuja interseção esteja dentro
  do intervalo angular `[−w/2, w/2]` e de altura `[−h/2, h/2]`. `u = (θ + w/2)/w`, `v = (h/2 − y)/h`.
- Painel plano (`R = ∞`): interseção raio-plano.
- Vários painéis: fica o de menor `t`. Coberto por testes unitários (casos: frontal, borda, fora
  do arco, atrás, painel plano, raio paralelo).

### 5.5 Passthrough (Fase 6)
- `VideoTexture` do mesmo `<video>` da câmera, num quad de fundo preso à cabeça, **mono** (a mesma
  imagem nos dois olhos), com opacidade ajustável. Fica atrás dos painéis.

---

## 6. Legibilidade e resolução padrão

- Por olho: ≈1356×1220 px em ≈95–100° de FOV horizontal ⇒ **≈13 px/grau** depois da distorção
  (no centro é um pouco melhor, na borda pior).
- Painel padrão: 55° de largura ⇒ ≈715 px efetivos.
- Modo foco: o painel olhado vem pra ~0.9 m e ocupa ~85° ⇒ ≈1100 px efetivos.
- **Default: display virtual 1280×800 em 1x (sem HiDPI).** Ele é dimensionado pro **modo foco**,
  onde a leitura acontece (≈1.15× de sobreamostragem). Na visão geral fica ≈1.8× minificado, e
  mipmap + anisotropia cuidam disso. Qualquer coisa acima (1920×1080, HiDPI) é banda e GPU
  desperdiçadas: o olho não resolve esses pixels.
- Preset "economia": 960×600. Preset "denso": 1440×900, só pra quem usar modo foco o tempo todo.
- Com ~13 ppd, texto de 13 px na tela fica no limite da leitura. Aumentar a fonte dos apps (ou
  usar zoom de 125–150%) ajuda mais do que subir a resolução.

---

## 7. Permissões no macOS

- A **Gravação de Tela** e a **Acessibilidade** são concedidas ao **app de terminal** que roda o
  binário (Terminal, iTerm2, Ghostty, VS Code…), não ao `vrmonitor`.
- O host detecta: `CGPreflightScreenCaptureAccess()` e `AXIsProcessTrusted()`. Se faltar, imprime o
  caminho exato: *Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela e Áudio do
  Sistema / Acessibilidade → ativar o seu terminal → reabrir o terminal*.
- No macOS 15+ o sistema pede de novo, periodicamente, a confirmação da Gravação de Tela pra apps
  que não são da Apple. Isso é esperado.

---

## 8. Segurança (modelo de ameaça: stream de tela + injeção de input = RCE)

| Ameaça | Mitigação |
|---|---|
| Acesso pela rede | bind `127.0.0.1` por padrão; nunca `0.0.0.0` sem `--wifi` |
| Aba maliciosa no navegador do Mac (CSWSH) | token obrigatório via subprotocolo + allowlist de `Origin` |
| DNS rebinding | allowlist de `Host` |
| Outros apps no celular (loopback do adb reverse) | token |
| Wi-Fi: sniffing/MITM | `--wifi` exige TLS (mkcert ou cert do Tailscale); sem cert válido o host não sobe |
| Wi-Fi: força bruta no token | token de 128 bits, comparação em tempo constante, bloqueio após 5 falhas |
| Flood de input | token bucket: move 240/s, clique/scroll 30/s; o excesso é descartado e contado |
| Input indesejado | `--view-only` desliga a injeção; o terminal mostra quem conectou; só 1 cliente controla por vez |
| Vazamento de conteúdo | o host não loga pixels nem NALs, só metadados (tamanho, fps, tempos) |
| Path traversal / XSS | estático só de `client/dist`, CSP `default-src 'self'` (+ `wasm-unsafe-eval` pro MediaPipe) |
| Supply chain | `Package.resolved` e `package-lock.json` versionados; wasm e modelo do MediaPipe vendorizados |

Modo Wi-Fi: `vrmonitor --wifi --bind <ip-da-interface> --cert cert.pem --key key.pem`. O host
imprime no terminal um QR com `https://<ip>:<porta>/#t=<token>`. Com Tailscale, o bind vai no IP
`100.x` e usa o cert de `tailscale cert`.

---

## 9. Performance e observabilidade

- Overlay de stats (HUD preso à cabeça, renderizado nos dois olhos; no modo plano/simulador é
  DOM): fps de render, frame time, fps recebido e decodificado por stream, tempo de decode
  (submit → output), latência e2e (captura → desenho), RTT e offset do relógio, bitrate.
- **Aviso de throttling:** como a web não lê temperatura, uso o fps como sinal. Se o render ficar
  < 90% do alvo ou o decode < 80% do fps do stream por mais de 5 s seguidos, mostro um ícone de
  aviso.
- Modos de performance:
  - **Foco no olhado** (padrão com 2+ displays): o painel olhado recebe o fps cheio (60), os
    outros 10–15 fps e bitrate menor, via `stream.config`.
  - **Adaptativo:** se a latência e2e ou a fila de decode crescem, o bitrate cai em degraus. Ele
    só sobe de novo depois de um período estável.
- Orçamento de latência (USB, 60 Hz): captura 8–16 ms + encode 3–6 + adb/USB 2–5 + decode 5–15 +
  espera do rAF 0–16 + scanout ~8 ⇒ **~40–70 ms** pra meta de 100 ms.

---

## 10. Conexão e scripts

- **USB (padrão):** `adb reverse tcp:8420 tcp:8420`. O celular acessa `http://localhost:8420`, que
  é contexto seguro, então sensores, câmera e WebCodecs funcionam sem certificado. Também carrega a
  bateria e tem latência menor que o Wi-Fi.
- `./run.sh`: builda o cliente (`npm ci && npm run build`), builda o host (`swift build -c release`),
  sobe o host, espera o `/healthz`, roda `adb reverse` e abre
  `am start -a android.intent.action.VIEW -d 'http://localhost:8420/#t=…' com.android.chrome`.
  No Ctrl-C, desfaz o `adb reverse` e destrói os displays.
- **Simulador** (`?sim=1`, no Chrome do Mac): mono, sem distorção, arrastar com o mouse gira a
  cabeça, clique = toque, roda = scroll. Usa o mesmo cliente e o mesmo host.

---

## 11. Ambiente de desenvolvimento

- Requisitos: macOS 14+, Apple Silicon, Xcode Command Line Tools com Swift 6+, Node 20+, adb
  (`android-platform-tools`). `mkcert` é opcional (Fase 6).
- `scripts/check-env.sh` verifica tudo isso e pergunta antes de instalar via brew.
- `tools/probe/`: página de sondagem do celular. Testa WebCodecs H.264, WebGL2/anisotropia,
  sensores e a frequência real deles, câmeras traseiras e suas capabilities, BarcodeDetector,
  taxa do display, e registra os eventos do controle VR BOX. Serve pra derrubar os riscos antes
  de escrever código.

---

## 12. Resultados da sondagem — Poco X7 Pro (2412DPC0AG), Android 16, Chrome 157

| Item | Resultado | Consequência |
|---|---|---|
| Contexto seguro via `adb reverse` | ✅ | plano USB confirmado |
| Tela em fullscreen paisagem | 2711×1219 px físicos (834×375 CSS, dpr 3.25) | praticamente a tela toda é útil |
| rAF | 60 Hz | 90/120 provavelmente indisponíveis |
| GPU | Mali-G720 MC7, WebGL2, aniso 16×, MSAA 4×, max texture 8192 | ok |
| H.264 decode 1280×800 (submit→output, 60 fps) | HW: mediana 15.9 / p95 57 ms · SW: 8.7 / 11.3 ms | decoder configurável, `auto` mede e escolhe |
| `RelativeOrientationSensor` | 60 Hz (pedindo 60 ou 120) | predição de 1 frame |
| Câmeras traseiras expostas | só a principal | sem ultrawide; FOV ~65–70° |
| fps de câmera medido (640×480) | 15 (traseira), 20 (frontal) | refazer com boa luz |
| BarcodeDetector | `qr_code` suportado | leitura do QR do viewer é viável |
| WebGPU | disponível | não usado por enquanto |

Observação: o benchmark de decode é sintético (frames de "tela" gerados pelo VideoEncoder do
próprio celular, com o hardware rodando antes do software). A Fase 1 refaz a medição com o stream
real do Mac.
