#!/usr/bin/env bash
# Fase 0 — checagem do ambiente de desenvolvimento no Mac (host) e no celular (via adb).
# Compatível com o bash 3.2 do macOS. Não instala nada sem perguntar.
#
# Uso:  ./scripts/check-env.sh            # checa e oferece instalar o que faltar
#       ./scripts/check-env.sh --no-install
#       ./scripts/check-env.sh --report   # gera também docs/env-report.txt (sem dados sensíveis)

set -u

NO_INSTALL=0
REPORT=0
for a in "$@"; do
  case "$a" in
    --no-install) NO_INSTALL=1 ;;
    --report) REPORT=1 ;;
    *) echo "argumento desconhecido: $a"; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_FILE="$ROOT/docs/env-report.txt"
FAILS=0
WARNS=0
LOG=""

c_ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; LOG="$LOG\n[ok]   $1"; }
c_warn() { printf '  \033[33m!\033[0m %s\n' "$1"; LOG="$LOG\n[warn] $1"; WARNS=$((WARNS+1)); }
c_fail() { printf '  \033[31m✘\033[0m %s\n' "$1"; LOG="$LOG\n[FAIL] $1"; FAILS=$((FAILS+1)); }
section(){ printf '\n\033[1m%s\033[0m\n' "$1"; LOG="$LOG\n\n== $1"; }

# version_ge "6.0.3" "6.0"  -> 0 se a >= b
version_ge() {
  local a="$1" b="$2" i x y
  local IFS=.
  # shellcheck disable=SC2206
  local A=($a) B=($b)
  for i in 0 1 2; do
    x="${A[$i]:-0}"; y="${B[$i]:-0}"
    x="${x//[^0-9]/}"; y="${y//[^0-9]/}"
    x="${x:-0}"; y="${y:-0}"
    if [ "$x" -gt "$y" ]; then return 0; fi
    if [ "$x" -lt "$y" ]; then return 1; fi
  done
  return 0
}

ask_install() { # $1 = descrição, $2 = comando
  if [ "$NO_INSTALL" -eq 1 ]; then
    echo "     → para instalar: $2"
    return 1
  fi
  printf '     → instalar %s com:  %s\n       Continuar? [s/N] ' "$1" "$2"
  read -r ans </dev/tty || ans=""
  case "$ans" in
    s|S|y|Y) eval "$2" ;;
    *) echo "     pulado."; return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
section "Sistema"
if [ "$(uname -s)" != "Darwin" ]; then
  c_fail "não é macOS ($(uname -s)). O host precisa rodar no Mac."
else
  PV="$(sw_vers -productVersion)"; BV="$(sw_vers -buildVersion)"
  if version_ge "$PV" "14.0"; then c_ok "macOS $PV ($BV)"; else c_fail "macOS $PV — preciso de 14+ (Hummingbird 2 / ScreenCaptureKit recente)"; fi
  ARCH="$(uname -m)"
  if [ "$ARCH" = "arm64" ]; then c_ok "arquitetura arm64"; else c_warn "arquitetura $ARCH (esperado arm64; rodando sob Rosetta?)"; fi
  MODEL="$(sysctl -n hw.model 2>/dev/null || echo '?')"
  CHIP="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo '?')"
  MEM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 ))
  c_ok "modelo $MODEL, $CHIP, ${MEM_GB} GB RAM"
  # Displays atuais (útil para a Fase 2)
  NDISP="$(system_profiler SPDisplaysDataType 2>/dev/null | grep -c 'Resolution:' || true)"
  c_ok "displays ativos detectados: ${NDISP:-?}"
fi
TERM_APP="${TERM_PROGRAM:-desconhecido}"
c_ok "app de terminal: $TERM_APP  (é ele que vai receber Gravação de Tela e Acessibilidade)"

# ---------------------------------------------------------------------------
section "Homebrew"
if command -v brew >/dev/null 2>&1; then
  c_ok "brew $(brew --version | head -1 | awk '{print $2}')"
  HAVE_BREW=1
else
  c_warn "Homebrew ausente. Instale em https://brew.sh (não instalo automaticamente: é um curl|bash)."
  HAVE_BREW=0
fi

# ---------------------------------------------------------------------------
section "Xcode Command Line Tools / Swift"
if xcode-select -p >/dev/null 2>&1; then
  c_ok "developer dir: $(xcode-select -p)"
else
  c_fail "Command Line Tools ausentes"
  ask_install "Xcode Command Line Tools" "xcode-select --install"
fi
if command -v swift >/dev/null 2>&1; then
  SV="$(swift --version 2>/dev/null | head -1 | sed -E 's/.*version ([0-9]+(\.[0-9]+)*).*/\1/')"
  if version_ge "$SV" "6.0"; then c_ok "swift $SV"; else c_fail "swift $SV — preciso de 6.0+ (atualize CLT/Xcode 16+)"; fi
else
  c_fail "swift não encontrado"
fi

# ---------------------------------------------------------------------------
section "Node / npm"
if command -v node >/dev/null 2>&1; then
  NV="$(node -v | sed 's/^v//')"
  if version_ge "$NV" "20.0"; then c_ok "node $NV"; else c_fail "node $NV — preciso de 20+"; [ $HAVE_BREW -eq 1 ] && ask_install "node" "brew install node"; fi
else
  c_fail "node ausente"
  [ $HAVE_BREW -eq 1 ] && ask_install "node" "brew install node"
fi
command -v npm >/dev/null 2>&1 && c_ok "npm $(npm -v)" || c_fail "npm ausente"

# ---------------------------------------------------------------------------
section "adb (Android platform-tools)"
if command -v adb >/dev/null 2>&1; then
  c_ok "$(adb version | head -1)"
else
  c_fail "adb ausente"
  [ $HAVE_BREW -eq 1 ] && ask_install "android-platform-tools" "brew install --cask android-platform-tools"
fi

# ---------------------------------------------------------------------------
section "Opcionais"
command -v mkcert >/dev/null 2>&1 && c_ok "mkcert (modo Wi-Fi)" || c_warn "mkcert ausente — só necessário no modo Wi-Fi (Fase 6): brew install mkcert"
command -v tailscale >/dev/null 2>&1 && c_ok "tailscale (alternativa de cert)" || true
command -v python3 >/dev/null 2>&1 && c_ok "python3 (usado por scripts/probe.sh)" || c_warn "python3 ausente — scripts/probe.sh precisa dele"

# ---------------------------------------------------------------------------
section "Celular (via adb)"
if command -v adb >/dev/null 2>&1; then
  adb start-server >/dev/null 2>&1
  DEVS="$(adb devices | awk 'NR>1 && $2=="device"{print $1}')"
  UNAUTH="$(adb devices | awk 'NR>1 && $2=="unauthorized"{print $1}')"
  if [ -n "$UNAUTH" ]; then
    c_warn "dispositivo não autorizado — desbloqueie o celular e aceite a chave RSA de depuração USB"
  fi
  NDEV="$(printf '%s\n' "$DEVS" | grep -c . || true)"
  if [ "$NDEV" -eq 0 ]; then
    c_fail "nenhum dispositivo autorizado. Ative Opções do desenvolvedor → Depuração USB (no HyperOS também 'Depuração USB (configurações de segurança)')."
  elif [ "$NDEV" -gt 1 ]; then
    c_warn "mais de um dispositivo; os scripts vão exigir ANDROID_SERIAL"
  fi
  if [ "$NDEV" -ge 1 ]; then
    S="$(printf '%s\n' "$DEVS" | head -1)"
    sh_() { adb -s "$S" shell "$@" 2>/dev/null | tr -d '\r'; }
    c_ok "modelo: $(sh_ getprop ro.product.manufacturer) $(sh_ getprop ro.product.model) ($(sh_ getprop ro.product.device))"
    c_ok "Android $(sh_ getprop ro.build.version.release) (SDK $(sh_ getprop ro.build.version.sdk)), SoC $(sh_ getprop ro.soc.model)"
    c_ok "tela: $(sh_ wm size | tail -1), $(sh_ wm density | tail -1)"
    CV="$(sh_ dumpsys package com.android.chrome | grep -m1 versionName | sed 's/.*=//')"
    if [ -n "$CV" ]; then
      CMAJ="${CV%%.*}"
      if [ "$CMAJ" -ge 120 ] 2>/dev/null; then c_ok "Chrome $CV"; else c_warn "Chrome $CV — atualize (WebCodecs/sensores ficam melhores em versões recentes)"; fi
    else
      c_fail "Chrome (com.android.chrome) não encontrado no celular"
    fi
    RATES="$(sh_ dumpsys display | grep -oE 'fps=[0-9.]+' | sort -u | tr '\n' ' ')"
    [ -n "$RATES" ] && c_ok "taxas de atualização expostas: $RATES"
    if adb -s "$S" reverse --list >/dev/null 2>&1; then c_ok "adb reverse suportado"; else c_warn "adb reverse falhou"; fi
  fi
fi

# ---------------------------------------------------------------------------
section "Resumo"
echo "  falhas: $FAILS   avisos: $WARNS"
if [ "$REPORT" -eq 1 ]; then
  mkdir -p "$(dirname "$REPORT_FILE")"
  printf '%b\n' "check-env $(date -u +%Y-%m-%dT%H:%MZ)$LOG\n\nfalhas=$FAILS avisos=$WARNS" > "$REPORT_FILE"
  echo "  relatório salvo em $REPORT_FILE"
fi
[ "$FAILS" -eq 0 ]
