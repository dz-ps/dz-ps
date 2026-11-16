#!/usr/bin/env bash
# Instala o APK de debug no aparelho conectado via adb (ex.: Poco X7 Pro com Depuração USB).
set -euo pipefail
APK="apps/app/android/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || { echo "APK não encontrado. Rode: pnpm android:apk"; exit 1; }
command -v adb >/dev/null || { echo "adb não encontrado. Rode ./scripts/doctor.sh"; exit 1; }
N="$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')"
[ "$N" -ge 1 ] || { echo "Nenhum aparelho autorizado. No HyperOS: Opções do desenvolvedor > Depuração USB e Instalar via USB."; exit 1; }
adb install -r "$APK"
PKG="$(grep -o "appId: '[^']*'" apps/app/src/brand.ts | cut -d"'" -f2)"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
echo "Instalado e aberto ($PKG). Para depurar o WebView: chrome://inspect no Chrome do computador."
