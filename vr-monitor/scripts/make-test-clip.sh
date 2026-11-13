#!/usr/bin/env bash
# Gera o clipe H.264 Annex B usado pela fonte sintética (--source synthetic).
# High profile, sem B-frames, IDR a cada 1 s, 1280x800@60, com relógio na imagem.
set -euo pipefail
OUT="${1:-$(cd "$(dirname "$0")/.." && pwd)/host/test-clip.h264}"
command -v ffmpeg >/dev/null || { echo "ffmpeg ausente (brew install ffmpeg)"; exit 1; }
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1280x800:rate=60,drawtext=text='%{pts\:hms}':x=40:y=40:fontsize=64:fontcolor=white:box=1:boxcolor=black" \
  -t 6 -c:v libx264 -profile:v high -preset veryfast -tune zerolatency -bf 0 -g 60 \
  -x264-params "keyint=60:min-keyint=60:scenecut=0" -pix_fmt yuv420p -b:v 4M \
  -bsf:v h264_mp4toannexb -f h264 "$OUT" 2>/dev/null || \
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1280x800:rate=60" \
  -t 6 -c:v libx264 -profile:v high -preset veryfast -tune zerolatency -bf 0 -g 60 \
  -x264-params "keyint=60:min-keyint=60:scenecut=0" -pix_fmt yuv420p -b:v 4M \
  -bsf:v h264_mp4toannexb -f h264 "$OUT"
echo "clipe gerado: $OUT ($(wc -c < "$OUT") bytes)"
