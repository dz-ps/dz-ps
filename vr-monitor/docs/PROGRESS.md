# Progresso

Legenda: ✅ feito · 🟡 em andamento / aguardando validação · ⬜ não iniciado

| Fase | Status | Resumo |
|---|---|---|
| 0. Ambiente + arquitetura | ✅ (controle VR BOX fica pra quando você tiver o viewer) | `check-env.sh`, `probe.sh`, `docs/ARCHITECTURE.md` |
| 1. Stream da tela principal (plano, USB, latência) | ✅ validado no Poco X7 Pro via USB | `./run.sh` |
| 2. Displays virtuais (N, um stream por display) | 🟡 código pronto; aguardando teste no Mac (limite de displays e memória) | `./run.sh --virtual 1` |
| 3. VR: painéis, estéreo, head tracking, distorção, calibração | ⬜ | |
| 4. Input: gaze, foco segue olhar, toque, controle VR BOX | ⬜ | |
| 5. Mãos: MediaPipe, raio, gestos, debug | ⬜ | |
| 6. Passthrough, layout, Wi-Fi seguro, perf, README | ⬜ | |

## Fase 0 — feito
- `docs/ARCHITECTURE.md`: decisões, interfaces do host, protocolo (controle JSON + vídeo binário AVCC), segurança, legibilidade/resolução, perf.
- `scripts/check-env.sh`: checa macOS ≥ 14 / arm64, CLT + Swift ≥ 6, Node ≥ 20, adb, celular conectado (modelo, Android, Chrome, tela, refresh), opcionais. Pergunta antes de instalar qualquer coisa via brew.
- `scripts/probe.sh` + `tools/probe/index.html`: sondagem de capacidades do celular (WebCodecs com benchmark real de encode→decode, WebGL2, sensores e frequência real, fullscreen/orientação/wake lock, câmeras traseiras com capabilities e fps medido, BarcodeDetector, log de eventos do controle). Validada no Chromium headless (Linux): sem erros de JS, e o caminho AVCC + `description` decodifica.

## Fase 0 — resultado da sondagem no celular
Ver ARCHITECTURE.md §12. Resumo: WebCodecs, sensores (60 Hz), fullscreen, orientação, wake lock e
BarcodeDetector ok. O decode em software foi mais estável que em hardware, então o decoder ficou
configurável. Ultrawide não exposta. Câmera a 15 fps (refazer com luz).

## Fase 0 — ambiente do Mac
macOS 26.5.2 (Tahoe), MacBookAir10,1 (M1, **8 GB RAM**), iTerm2, brew, CLT com Swift 6.3.3
(sem o Xcode completo, o que basta pra SwiftPM), Node 26.3, Tailscale presente. O `adb` faltava
na hora do relatório; a sondagem rodou depois, então ele já foi instalado. 2 displays ativos
(interno + 1 externo).

## Fase 0 — falta
- Controle VR BOX: a sondagem registrou só `pointerdown` de toque (nenhum gamepad ou tecla). Falta
  confirmar se esses toques vieram do controle (alguns modos emulam toque na tela) ou do dedo.

## Fase 1 — feito
- **Host (Swift 6.3, SwiftPM):**
  - `HostCore` (protocolo binário, mensagens de controle, H.264/avcC, token, Origin/Host, limitador, fonte sintética);
  - `HostMac` (ScreenCaptureKit 420v + VideoToolbox H.264 em HW com low-latency RC, BT.709, keyframe sob demanda reaproveitando o último frame);
  - `vrmonitor` (Hummingbird 2 + WebSocket: estático, `/healthz`, `/ws/control`, `/ws/video?display=N`, backpressure por assinante).
- **Cliente (TS strict + Vite + Three.js):**
  - WebCodecs AVCC com `description`, decoder `auto` (mede HW vs SW com o stream real e escolhe pelo p95);
  - upload `VideoFrame` → textura WebGL via `texSubImage2D` (sem canvas 2D), `frame.close()` sempre;
  - sync de relógio (menor RTT), HUD com fps, decode, e2e e quebra host/rede/decode/espera, aviso de throttling;
  - fullscreen, paisagem, wake lock.
- `run.sh`: build, token, host, `adb reverse`, `am start`.
- **Testes:**
  - 18 em Swift (protocolo com vetores compartilhados, H.264, auth, mensagens, fonte sintética);
  - 12 no cliente (protocolo com os mesmos vetores, clock sync, estatísticas).
- **Validado neste container Linux:**
  - host com fonte sintética + cliente no Chromium headless, de ponta a ponta;
  - token errado, Origin errado e Host errado são recusados.
- **Não validado:** `HostMac` (ScreenCaptureKit/VideoToolbox) não compila no Linux. Foi escrito com
  atenção às assinaturas, mas é o primeiro ponto a checar no Mac.

## Fase 1 — validado no Mac (simulador, Chrome do Mac)
- `HostMac` compilou sem ajustes; captura + encode HW funcionando.
- e2e 8–9 ms (p95 22), host 0.9–1.9 ms, decode 1.5 ms (o `auto` escolheu software no Chrome do Mac).
- Bug corrigido: o limitador de fps pulava um frame sim, um não em displays que não são múltiplos
  de 60 (75 Hz → 37.5 fps). Agora usa um acumulador (`FrameLimiter`, com testes).
- O "espelho infinito" ao ver no Mac o mesmo display capturado é esperado.

## Fase 1 — validado no celular (Poco X7 Pro, USB, conteúdo de jogo em movimento)
- Render 56–61 fps; e2e **23 ms** (p95 33–34), bem abaixo da meta de 100 ms.
- Quebra: host 2.0–2.4 · rede (adb/USB) 4.1–4.2 · decode 6.6–6.7 · espera 8.6–9.4 ms.
- O `auto` escolheu `prefer-software` (6.7 / p95 10 ms), confirmando a sondagem. Fila 0–1.
- Bitrate 3.4–5.6 Mbps a 1280×720 com jogo em movimento.
- Descartados 41: concentrados no início (espera do keyframe + troca HW→SW do `auto`), sem erros.

## Fase 1 — observações para depois
- "desenhado" (46 fps) < "dec" (50 fps): quando dois frames saem do decoder entre dois rAF, o mais
  antigo é descartado. É correto pra latência, mas dá pra suavizar na Fase 3 (ver se o padrão de
  chegada ajuda o pacing).
- A "espera" (~9 ms ≈ meio frame) é o tempo até o próximo rAF; dá pra cortar uns ms alinhando o
  pacing, se for preciso.
- A build do host foi movida pra `~/Library/Caches/vr-monitor/host-build` (o `build.db` corrompeu
  com o repo na Mesa, provavelmente por sincronização do iCloud).

## Fase 2 — feito
- **Host:**
  - target `CGVirtualDisplayBridge` (headers da API privada, `weak_import`);
  - `MacVirtualDisplays` (criar/destruir, serial estável, espera ficar ativo);
  - `VirtualDisplayProvider` no `HostCore`;
  - mensagens `display.create`/`display.destroy` e broadcast de `displays` pra todos os clientes;
  - encerramento dos streams de display removido;
  - `--virtual N`, `--virtual-size`, `--virtual-hidpi`, `--max-virtual`;
  - log a cada 10 s com memória do host e fps/kbps por stream;
  - remoção de todos os virtuais no encerramento.
- **Cliente:**
  - grade com um stream por display, reconciliada com a lista do host;
  - barra pra criar (com tamanho) e remover displays;
  - HUD por stream;
  - `?show=auto|all|1,3`.
- `scripts/mem-snapshot.sh` (vrmonitor + WindowServer + pressão de memória → `docs/mem-log.txt`).
- `run.sh --virtual N` e `--query`.
- **Testes:** 20 em Swift (mensagens novas, `VirtualDisplaySpec`, displays virtuais sintéticos) + 17 no cliente.
- **Validado no Linux:** com displays sintéticos, criar 1→3 (o botão desabilita no limite), remover
  um (os sockets dele são encerrados) e o Ctrl-C remove todos.
- **Não validado:** `MacVirtualDisplays` (API privada no macOS 26) — é o teste principal desta fase.

## Fase 2 — falta
- Teste no Mac: 1, 2 e 3 displays, com memória em cada passo.

## Decisões que divergem do pedido (detalhes no ARCHITECTURE.md)
- Token de sessão obrigatório **também no USB** (CSWSH a partir do navegador do Mac e outros apps do celular conseguem alcançar o localhost do adb reverse).
- Foco segue olhar tem dois modos ("só cursor" e "cursor + clique"), porque mover o cursor no macOS não troca o foco de teclado.

## Problemas conhecidos / riscos abertos
- 8 GB de RAM: cada display virtual custa framebuffers no WindowServer + pool do SCStream + sessão
  VT. Vou medir memória na Fase 2 junto com o limite de displays.
- macOS 26 (Tahoe): `CGVirtualDisplay` é API privada e pode ter mudado. A validação vem logo no
  início da Fase 2; se quebrar, o fallback é o BetterDisplay.
- **Sessão de desenvolvimento roda num container Linux na nuvem**: não consigo compilar Swift com ScreenCaptureKit/VideoToolbox nem falar com o adb. Até isso mudar, o host vai ser escrito "às cegas" e você compila e me manda os erros. Recomendado: rodar o Claude Code no próprio Mac (CLI ou app desktop) a partir da Fase 1.
- Limite de displays virtuais no M1 Air: a validar na Fase 2.
- Custo do MediaPipe na thread principal: a medir na Fase 5 (o plano B é um Worker).
- Ultrawide **não** é exposta pelo Chrome no HyperOS: hand tracking vai usar a câmera principal (FOV menor).
- rAF travado em 60 Hz no Chrome do HyperOS: 90/120 provavelmente fora de alcance.
- Decode H.264 em hardware com p95 alto (57 ms) no benchmark sintético: confirmar com stream real na Fase 1.
- O projeto está em `vr-monitor/` dentro do repo de perfil `dz-ps/dz-ps`. Dá pra extrair pra um repo próprio depois com `git subtree split --prefix vr-monitor`.
