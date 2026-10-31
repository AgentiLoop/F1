#!/usr/bin/env bash
# Packages the web-thin Windows app (x64 + ARM64 in one zip): f1-web.ps1 opens the hosted game in a Microsoft
# Edge app window, so nothing is compiled or bundled. Install.cmd / AgentiLoopF1.cmd / Uninstall.cmd wrap it.
# Usage: ./build-web-thin.sh   (F1_VERSION=x.y.z overrides the version, default: latest git tag)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION="${F1_VERSION:-$(git -C "$HERE" describe --tags --abbrev=0)}"
URL="${F1_WEB_URL:-https://f1.gokart.games/}"
STAGE="$HERE/build/AgentiLoopF1-web-thin"
ZIP="$HERE/../release/AgentiLoopF1-web-thin-$VERSION-win.zip"

crlf() { sed 's/$/\r/'; }   # .cmd/.ps1/.txt with Windows line endings
rm -rf "$HERE/build"; mkdir -p "$STAGE"
cp "$HERE/../icon/F1.ico" "$STAGE/"
crlf < "$HERE/f1-web.ps1" > "$STAGE/f1-web.ps1"
crlf < "$HERE/README-web-thin.txt" > "$STAGE/README.txt"
printf '%s\r\n' "$URL" > "$STAGE/url.txt"
cmd() { printf '@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%%~dp0f1-web.ps1" %s\r\n%s\r\n' "$1" "$2" > "$STAGE/$3"; }
cmd ''           'if errorlevel 1 pause' Install.cmd
cmd '-Run'       'if errorlevel 1 pause' AgentiLoopF1.cmd
cmd '-Uninstall' 'pause'                 Uninstall.cmd
mkdir -p "$(dirname "$ZIP")"; rm -f "$ZIP"
(cd "$HERE/build" && zip -qrX "$ZIP" AgentiLoopF1-web-thin)
ls -la "$ZIP"
