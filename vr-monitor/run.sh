#!/usr/bin/env bash
# Builda cliente e host, sobe o host em 127.0.0.1, configura o adb reverse e abre no Chrome do celular.
#
#   ./run.sh                      # tela principal do Mac → celular via USB
#   ./run.sh --no-phone           # só o host; abra a URL impressa no Chrome do Mac
#   ./run.sh --synthetic          # clipe de teste em vez da captura (não precisa de permissão)
#   ./run.sh --virtual 2          # cria 2 displays virtuais e mostra só eles no celular
#   ./run.sh --query "show=all&hw=sw"  # parâmetros do cliente (antes do #t=)
#   ./run.sh -- --fps 30 --kbps 4000   # argumentos depois de -- vão pro vrmonitor
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8420}"
PHONE=1
QUERY=""
VIRTUAL_ARGS=()
SOURCE_ARGS=()
HOST_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --no-phone) PHONE=0 ;;
    --synthetic) SOURCE_ARGS=(--source synthetic --clip "$ROOT/host/test-clip.h264") ;;
    --virtual) shift; VIRTUAL_ARGS=(--virtual "$1") ;;
    --query) shift; QUERY="?${1#\?}" ;;
    --) shift; HOST_ARGS=("$@"); break ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "argumento desconhecido: $1"; exit 2 ;;
  esac
  shift
done
ADB=(adb)
[ -n "${ANDROID_SERIAL:-}" ] && ADB=(adb -s "$ANDROID_SERIAL")

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

step "build do cliente"
( cd "$ROOT/client" && { [ -d node_modules ] || npm ci; } && npm run build --silent )

# O build do Swift fica fora do repo: o banco SQLite do SwiftPM (build.db) corrompe ("disk I/O
# error") quando a pasta é sincronizada pelo iCloud Drive (Mesa/Documentos) ou Dropbox.
SCRATCH="${VRM_SCRATCH:-$HOME/Library/Caches/vr-monitor/host-build}"
mkdir -p "$SCRATCH"
step "build do host em $SCRATCH (a primeira vez baixa e compila as dependências: alguns minutos)"
if ! ( cd "$ROOT/host" && swift build -c release --scratch-path "$SCRATCH" ); then
  echo
  echo "build do host falhou."
  echo "Se o erro for 'disk I/O error' no build.db: confira se não há outro 'swift build' rodando"
  echo "(pgrep -fl swift-build) e apague o cache:  rm -rf \"$SCRATCH\""
  exit 1
fi
BIN="$SCRATCH/release/vrmonitor"
[ -x "$BIN" ] || { echo "binário não encontrado em $BIN"; exit 1; }

if [ ${#SOURCE_ARGS[@]} -gt 0 ] && [ ! -f "$ROOT/host/test-clip.h264" ]; then
  step "gerando clipe de teste"
  "$ROOT/scripts/make-test-clip.sh"
fi

# token de sessão: 128 bits, base64url. Vai pro host por variável de ambiente (não aparece no ps)
# e pro celular no fragmento da URL (#t=…), que o navegador nunca envia ao servidor.
TOKEN="$(openssl rand -base64 16 | tr '+/' '-_' | tr -d '=\n')"
URL="http://localhost:$PORT/$QUERY#t=$TOKEN"

HOST_PID=""
cleanup() {
  [ -n "$HOST_PID" ] && kill "$HOST_PID" 2>/dev/null && wait "$HOST_PID" 2>/dev/null
  [ "$PHONE" -eq 1 ] && "${ADB[@]}" reverse --remove "tcp:$PORT" >/dev/null 2>&1
  true
}
trap cleanup EXIT INT TERM

step "subindo o host"
VRM_TOKEN="$TOKEN" "$BIN" --port "$PORT" --static "$ROOT/client/dist" \
  ${SOURCE_ARGS[@]+"${SOURCE_ARGS[@]}"} ${VIRTUAL_ARGS[@]+"${VIRTUAL_ARGS[@]}"} ${HOST_ARGS[@]+"${HOST_ARGS[@]}"} &
HOST_PID=$!

for _ in $(seq 1 60); do
  if ! kill -0 "$HOST_PID" 2>/dev/null; then
    wait "$HOST_PID"; code=$?; HOST_PID=""
    echo "o host saiu (código $code) — veja a mensagem acima"; exit "$code"
  fi
  curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 0.25
done

if [ "$PHONE" -eq 1 ]; then
  step "celular"
  if ! "${ADB[@]}" get-state >/dev/null 2>&1; then
    echo "nenhum celular via adb. Conecte o cabo e aceite a depuração USB, ou use --no-phone."
    echo "No Mac: $URL"
  else
    "${ADB[@]}" reverse "tcp:$PORT" "tcp:$PORT"
    # o '#' precisa ir entre aspas para o shell remoto não tratar como comentário
    "${ADB[@]}" shell "am start -a android.intent.action.VIEW -d '$URL' com.android.chrome" >/dev/null
    echo "aberto no Chrome do celular."
  fi
fi
echo "No Mac (simulador/plano): $URL"
echo "Ctrl-C para encerrar."
wait "$HOST_PID"
