#!/usr/bin/env bash
# Fotografia de memória pra medir o custo de cada display virtual (Fase 2).
# Uso: ./scripts/mem-snapshot.sh [rótulo]   → também acrescenta em docs/mem-log.txt
set -u
LABEL="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
out() { printf '%s\n' "$1"; printf '%s\n' "$1" >> "$ROOT/docs/mem-log.txt"; }
out "== $(date '+%H:%M:%S') ${LABEL}"
for p in vrmonitor WindowServer; do
  pid="$(pgrep -x "$p" | head -1)"
  if [ -n "$pid" ]; then
    rss_kb="$(ps -o rss= -p "$pid" | tr -d ' ')"
    out "$(printf '  %-13s %6d MB (RSS)' "$p" $((rss_kb / 1024)))"
  else
    out "  $p: não está rodando"
  fi
done
out "  displays ativos: $(system_profiler SPDisplaysDataType 2>/dev/null | grep -c 'Resolution:')"
out "  $(memory_pressure 2>/dev/null | grep 'free percentage' | sed 's/System-wide memory free percentage/memória livre/')"
out "  swap: $(sysctl -n vm.swapusage 2>/dev/null)"
