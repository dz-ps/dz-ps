#!/usr/bin/env bash
# Valida um diretório GTFS com o MobilityData GTFS Validator. Erro (severity ERROR) => exit 1.
# Uso: ./scripts/gtfs-validator.sh <pasta-gtfs> [pasta-relatorio]
set -euo pipefail
# Versão: GTFS_VALIDATOR_VERSAO, ou a última release publicada no GitHub.
VERSAO="${GTFS_VALIDATOR_VERSAO:-$(curl -fsSL https://api.github.com/repos/MobilityData/gtfs-validator/releases/latest 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].lstrip("v"))' 2>/dev/null || true)}"
[ -n "$VERSAO" ] || { echo "Não consegui descobrir a versão do validador; defina GTFS_VALIDATOR_VERSAO."; exit 2; }
GTFS="${1:?pasta GTFS}"
SAIDA="${2:-$(mktemp -d)}"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/rotavix"
JAR="$CACHE/gtfs-validator-$VERSAO-cli.jar"
mkdir -p "$CACHE"
if [ ! -s "$JAR" ]; then
  echo "Baixando GTFS Validator $VERSAO…"
  curl -fsSL -o "$JAR" "https://github.com/MobilityData/gtfs-validator/releases/download/v$VERSAO/gtfs-validator-$VERSAO-cli.jar"
fi
ZIP="$SAIDA/feed.zip"
(cd "$GTFS" && zip -q -j "$ZIP" ./*.txt)
java -jar "$JAR" --input "$ZIP" --output_base "$SAIDA" --country_code br >/dev/null
python3 - "$SAIDA/report.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
avisos = {}
for n in r.get("notices", []):
    avisos.setdefault(n["severity"], []).append(f'{n["code"]} ({n["totalNotices"]})')
for sev in ("ERROR", "WARNING", "INFO"):
    print(f"{sev}: {', '.join(avisos.get(sev, [])) or 'nenhum'}")
sys.exit(1 if avisos.get("ERROR") else 0)
PY
echo "Relatório: $SAIDA/report.html"
