#!/usr/bin/env bash
# Verifica as ferramentas do ambiente de desenvolvimento do RotaVix.
# Funciona em macOS (Intel e Apple Silicon) e Linux. Não instala nada:
# só mostra o que falta e o comando sugerido.
#
# Uso: ./scripts/doctor.sh        (sai com código 1 se faltar algo obrigatório)
set -u

OS="$(uname -s)"
ARCH="$(uname -m)"
FALTA_OBRIG=0

if [ -t 1 ]; then OK=$'\e[32mOK\e[0m'; NO=$'\e[31mFALTA\e[0m'; OLD=$'\e[33mVELHO\e[0m'; else OK=OK; NO=FALTA; OLD=VELHO; fi

# Sugestão de instalação por sistema: macOS usa Homebrew; Linux, apt (Debian/Ubuntu).
sugerir() { # $1 = item
  case "$OS:$1" in
    Darwin:node)    echo "brew install fnm && fnm install 22 && fnm default 22" ;;
    Linux:node)     echo "curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22" ;;
    *:pnpm)         echo "corepack enable && corepack prepare pnpm@10 --activate" ;;
    Darwin:python)  echo "brew install uv && uv python install 3.12" ;;
    Linux:python)   echo "curl -LsSf https://astral.sh/uv/install.sh | sh && uv python install 3.12" ;;
    Darwin:uv)      echo "brew install uv" ;;
    Linux:uv)       echo "curl -LsSf https://astral.sh/uv/install.sh | sh" ;;
    Darwin:docker)  echo "brew install --cask docker   # Docker Desktop (Apple Silicon nativo); alternativa leve: brew install colima docker docker-compose" ;;
    Linux:docker)   echo "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER" ;;
    Darwin:java)    echo "brew install --cask temurin@21" ;;
    Linux:java)     echo "sudo apt-get install -y openjdk-21-jdk" ;;
    Darwin:studio)  echo "brew install --cask android-studio   # depois: abra, SDK Manager > Android SDK 35 + Platform-Tools + Build-Tools" ;;
    Linux:studio)   echo "sudo snap install android-studio --classic   # ou baixe em developer.android.com/studio" ;;
    Darwin:adb)     echo "brew install --cask android-platform-tools   # ou via SDK Manager do Android Studio" ;;
    Linux:adb)      echo "sudo apt-get install -y android-sdk-platform-tools   # ou via SDK Manager" ;;
    *)              echo "(ver docs/SETUP.md)" ;;
  esac
}

linha() { printf "  %-26s %-7s %s\n" "$1" "$2" "$3"; }

checa() { # $1 rótulo, $2 comando, $3 chave de sugestão, $4 obrigatorio(1/0), $5 versão mínima (major), $6 comando de versão
  local rot="$1" cmd="$2" key="$3" obrig="$4" min="${5:-}" vcmd="${6:-}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    linha "$rot" "$NO" "→ $(sugerir "$key")"
    [ "$obrig" = 1 ] && FALTA_OBRIG=1
    return
  fi
  local ver
  ver="$(eval "$vcmd" 2>/dev/null | grep -v JAVA_TOOL_OPTIONS | head -1)"
  if [ -n "$min" ]; then
    local maj
    maj="$(printf '%s' "$ver" | grep -Eo '[0-9]+' | head -1)"
    if [ -n "$maj" ] && [ "$maj" -lt "$min" ]; then
      linha "$rot" "$OLD" "$ver (precisa ≥ $min) → $(sugerir "$key")"
      [ "$obrig" = 1 ] && FALTA_OBRIG=1
      return
    fi
  fi
  linha "$rot" "$OK" "$ver"
}

echo "RotaVix doctor: $OS $ARCH"
echo
echo "Obrigatórios"
checa "Node.js ≥ 22"        node   node   1 22 "node --version | tr -d v"
checa "pnpm ≥ 10"           pnpm   pnpm   1 10 "pnpm --version"
checa "uv (Python)"         uv     uv     1 "" "uv --version"
if command -v uv >/dev/null 2>&1 && uv python find 3.12 >/dev/null 2>&1; then
  linha "Python ≥ 3.12 (uv)" "$OK" "$(uv python find 3.12 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(sys.version_info < (3,12))'; then
  linha "Python ≥ 3.12" "$OK" "$(python3 --version)"
else
  linha "Python ≥ 3.12" "$NO" "→ $(sugerir python)"; FALTA_OBRIG=1
fi
checa "Docker"              docker docker 1 "" "docker --version"
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then linha "Docker Compose v2" "$OK" "$(docker compose version --short)"; else linha "Docker Compose v2" "$NO" "→ atualize o Docker"; FALTA_OBRIG=1; fi
  if docker info >/dev/null 2>&1; then linha "Docker daemon" "$OK" "rodando ($(docker info --format '{{.Architecture}}'))"; else linha "Docker daemon" "$NO" "→ abra o Docker Desktop / colima start"; fi
fi
checa "Java ≥ 17 (Validator)" java java 1 17 "java -version 2>&1"

echo
echo "Android (Fase do app nativo)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -z "$SDK" ] && [ "$OS" = Darwin ] && [ -d "$HOME/Library/Android/sdk" ] && SDK="$HOME/Library/Android/sdk"
[ -z "$SDK" ] && [ -d "$HOME/Android/Sdk" ] && SDK="$HOME/Android/Sdk"
if [ "$OS" = Darwin ] && [ -d "/Applications/Android Studio.app" ]; then linha "Android Studio" "$OK" "/Applications/Android Studio.app"
elif command -v studio >/dev/null 2>&1 || command -v android-studio >/dev/null 2>&1; then linha "Android Studio" "$OK" "no PATH"
else linha "Android Studio" "$NO" "→ $(sugerir studio)"; fi
if [ -n "$SDK" ] && [ -d "$SDK" ]; then linha "Android SDK" "$OK" "$SDK"; else linha "Android SDK" "$NO" "→ instale pelo SDK Manager e exporte ANDROID_HOME"; fi
[ -n "$SDK" ] && [ -x "$SDK/platform-tools/adb" ] && PATH="$SDK/platform-tools:$PATH"
checa "adb"                 adb    adb    0 "" "adb version"
if command -v adb >/dev/null 2>&1; then
  N="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')"
  linha "Aparelho via adb" "$( [ "$N" -gt 0 ] && echo "$OK" || echo "$NO")" "$N conectado(s) (ative Depuração USB no HyperOS)"
fi

echo
if [ "$FALTA_OBRIG" = 1 ]; then echo "Faltam itens obrigatórios."; exit 1; fi
echo "Tudo certo para as fases web/backend/ETL."
