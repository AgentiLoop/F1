#!/usr/bin/env bash
# Builds the web-thin macOS app (universal arm64 + x86_64): a WKWebView window on the hosted game, no bundled
# game files. Signs with Developer ID, optionally notarizes + staples, and zips it into desktop/release/.
# Usage: ./build-web-thin.sh [notarize]   (F1_VERSION=x.y.z overrides the version, default: latest git tag)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION="${F1_VERSION:-$(git -C "$HERE" describe --tags --abbrev=0)}"
URL="${F1_WEB_URL:-https://f1.gokart.games/}"
APP="$HERE/build/AgentiLoop Racing F1.app"
ZIP="$HERE/../release/AgentiLoopF1-web-thin-$VERSION-mac-universal.zip"
IDENTITY="Developer ID Application: Todd Bruss (469UCUB275)"

swift build --package-path "$HERE" -c release --arch arm64 --arch x86_64
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$(swift build --package-path "$HERE" -c release --arch arm64 --arch x86_64 --show-bin-path)/F1Racing" "$APP/Contents/MacOS/"
cp "$HERE/../icon/F1.icns" "$APP/Contents/Resources/"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>AgentiLoop Racing F1</string>
  <key>CFBundleDisplayName</key><string>AgentiLoop Racing F1</string>
  <key>CFBundleExecutable</key><string>F1Racing</string>
  <key>CFBundleIconFile</key><string>F1</string>
  <key>CFBundleIdentifier</key><string>games.gokart.f1.webthin</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.racing-games</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>F1WebURL</key><string>$URL</string>
</dict>
</plist>
PLIST
codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"
mkdir -p "$(dirname "$ZIP")"; rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
if [ "${1:-}" = notarize ]; then
  xcrun notarytool submit "$ZIP" -p "App Store Connect Profile" --wait
  xcrun stapler staple "$APP"
  rm -f "$ZIP"; ditto -c -k --keepParent "$APP" "$ZIP"
  spctl -a -vv "$APP"
fi
ls -la "$ZIP"
