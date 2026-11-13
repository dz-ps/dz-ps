# Progresso

Legenda: ✅ feito · 🟡 em andamento / aguardando validação · ⬜ não iniciado

| Fase | Status | Resumo |
|---|---|---|
| 0. Ambiente + arquitetura | 🟡 aguardando sua execução no Mac/celular | `check-env.sh`, `probe.sh`, `docs/ARCHITECTURE.md` |
| 1. Stream da tela principal (plano, USB, latência) | ⬜ | |
| 2. Displays virtuais (N, um stream por display) | ⬜ | |
| 3. VR: painéis, estéreo, head tracking, distorção, calibração | ⬜ | |
| 4. Input: gaze, foco segue olhar, toque, controle VR BOX | ⬜ | |
| 5. Mãos: MediaPipe, raio, gestos, debug | ⬜ | |
| 6. Passthrough, layout, Wi-Fi seguro, perf, README | ⬜ | |

## Fase 0 — feito
- `docs/ARCHITECTURE.md`: decisões, interfaces do host, protocolo (controle JSON + vídeo binário AVCC), segurança, legibilidade/resolução, perf.
- `scripts/check-env.sh`: checa macOS ≥ 14 / arm64, CLT + Swift ≥ 6, Node ≥ 20, adb, celular conectado (modelo, Android, Chrome, tela, refresh), opcionais. Pergunta antes de instalar qualquer coisa via brew.
- `scripts/probe.sh` + `tools/probe/index.html`: sondagem de capacidades do celular (WebCodecs com benchmark real de encode→decode, WebGL2, sensores e frequência real, fullscreen/orientação/wake lock, câmeras traseiras com capabilities e fps medido, BarcodeDetector, log de eventos do controle). Validada no Chromium headless (Linux): sem erros de JS, e o caminho AVCC + `description` decodifica.

## Fase 0 — falta
- Rodar `check-env.sh` no Mac e a sondagem no Poco X7 Pro, e me mandar os resultados.

## Decisões que divergem do pedido (detalhes no ARCHITECTURE.md)
- Token de sessão obrigatório **também no USB** (CSWSH a partir do navegador do Mac e outros apps do celular conseguem alcançar o localhost do adb reverse).
- Foco segue olhar tem dois modos ("só cursor" e "cursor + clique"), porque mover o cursor no macOS não troca o foco de teclado.

## Problemas conhecidos / riscos abertos
- **Sessão de desenvolvimento roda num container Linux na nuvem**: não consigo compilar Swift com ScreenCaptureKit/VideoToolbox nem falar com o adb. Até isso mudar, o host vai ser escrito "às cegas" e você compila e me manda os erros. Recomendado: rodar o Claude Code no próprio Mac (CLI ou app desktop) a partir da Fase 1.
- Limite de displays virtuais no M1 Air: a validar na Fase 2.
- Custo do MediaPipe na thread principal: a medir na Fase 5 (o plano B é um Worker).
- A ultrawide pode não ser exposta pelo Chrome no HyperOS: a sondagem vai dizer.
- O projeto está em `vr-monitor/` dentro do repo de perfil `dz-ps/dz-ps`. Dá pra extrair pra um repo próprio depois com `git subtree split --prefix vr-monitor`.
