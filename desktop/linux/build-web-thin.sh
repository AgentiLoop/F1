#!/usr/bin/env bash
# Packages the web-thin Linux app (x64 + arm64, Raspberry Pi included, in one tarball): the AgentiLoopF1 launcher
# opens the hosted game in a Chrome / Chromium app window (WebKitGTK f1web.py as fallback); install.sh installs a
# browser if needed + a menu entry.
# Usage: ./build-web-thin.sh   (F1_VERSION=x.y.z overrides the version, default: latest git tag)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION="${F1_VERSION:-$(git -C "$HERE" describe --tags --abbrev=0)}"
URL="${F1_WEB_URL:-https://f1.gokart.games/}"
STAGE="$HERE/build/AgentiLoopF1-web-thin"
TGZ="$HERE/../release/AgentiLoopF1-web-thin-$VERSION-linux.tar.gz"

rm -rf "$HERE/build"; mkdir -p "$STAGE"
cp "$HERE/AgentiLoopF1" "$HERE/install.sh" "$HERE/f1web.py" "$HERE/../icon/F1.png" "$STAGE/"
cp "$HERE/README-web-thin.txt" "$STAGE/README.txt"
echo "$URL" > "$STAGE/url.txt"
chmod +x "$STAGE/AgentiLoopF1" "$STAGE/install.sh" "$STAGE/f1web.py"
mkdir -p "$(dirname "$TGZ")"; rm -f "$TGZ"
COPYFILE_DISABLE=1 tar -czf "$TGZ" -C "$HERE/build" AgentiLoopF1-web-thin
ls -la "$TGZ"
