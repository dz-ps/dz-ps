# vr-monitor

Monitor virtual em VR caseiro: displays virtuais no Mac transmitidos por H.264 para o Chrome do
Android dentro de um viewer tipo Cardboard, com head tracking, gaze, controle BT e hand tracking.

Status: **Fase 0**. Veja [docs/PROGRESS.md](docs/PROGRESS.md) e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Fase 0
```bash
./scripts/check-env.sh --report   # checa o ambiente do Mac + celular
./scripts/probe.sh                # abre a sondagem de capacidades no celular via USB
```

## Fase 1 — stream da tela principal
```bash
./run.sh                 # Mac → celular via USB (adb reverse)
./run.sh --no-phone      # só o host; abra a URL impressa no Chrome do Mac
./run.sh --synthetic     # clipe de teste no lugar da captura (precisa de ffmpeg)
./run.sh -- --fps 30 --kbps 4000
```
Parâmetros do cliente na URL (antes do `#`): `?hw=auto|hw|sw`, `?fps=60`, `?kbps=6000`,
`?display=N`, `?renderfps=60`.
