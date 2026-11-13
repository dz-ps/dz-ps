#!/usr/bin/env bash
# Fase 0 — serve tools/probe/ em 127.0.0.1, faz adb reverse e abre no Chrome do celular.
# http://localhost no celular é contexto seguro, então sensores/câmera/WebCodecs funcionam.
set -euo pipefail

PORT="${PORT:-8421}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/tools/probe"
ADB=(adb)
[ -n "${ANDROID_SERIAL:-}" ] && ADB=(adb -s "$ANDROID_SERIAL")

command -v adb >/dev/null || { echo "adb ausente (brew install --cask android-platform-tools)"; exit 1; }
command -v python3 >/dev/null || { echo "python3 ausente"; exit 1; }

cleanup() {
  "${ADB[@]}" reverse --remove "tcp:$PORT" >/dev/null 2>&1 || true
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR" >/dev/null 2>&1 &
SRV=$!
sleep 0.5

"${ADB[@]}" reverse "tcp:$PORT" "tcp:$PORT"
"${ADB[@]}" shell am start -a android.intent.action.VIEW \
  -d "http://localhost:$PORT/" com.android.chrome >/dev/null

echo "Sondagem aberta no celular em http://localhost:$PORT/"
echo "Também dá pra abrir no Mac: http://127.0.0.1:$PORT/"
echo "Ctrl-C para encerrar (desfaz o adb reverse)."
wait "$SRV"
