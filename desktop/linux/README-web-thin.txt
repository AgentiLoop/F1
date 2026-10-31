AgentiLoop Racing F1 web-thin for Linux (x64 and arm64, Raspberry Pi 4 / 5 included)

Plays the hosted game at https://f1.gokart.games in a Chrome or Chromium app window: no tabs or address
bar, its own profile. No game files are bundled, so it needs an internet connection and always runs the
latest deployed version. The game needs WebGL; on a Raspberry Pi expect a low frame rate.

1. Unpack:
     tar -xzf AgentiLoopF1-web-thin-*-linux.tar.gz
2. Install (one step):
     ./AgentiLoopF1-web-thin/install.sh
   If no Chrome, Chromium, Edge or Brave is installed, it installs Google Chrome on x64 (apt / dnf) or
   Chromium on arm64 and other distros. Then it adds "AgentiLoop Racing F1" to the Games menu, adds an
   `agentiloop-f1` command and starts the game.

Other ways:
  ./AgentiLoopF1-web-thin/AgentiLoopF1     play without installing
  ./install.sh --uninstall                  removes the app, menu entry and saved settings
With no Chromium-based browser it falls back to a WebKitGTK window (sudo apt install python3-gi gir1.2-webkit2-4.1).

Pick a browser:  F1_BROWSER=chromium ./AgentiLoopF1
Other URL (e.g. a local server):  F1_WEB_URL=http://192.168.1.10:5188/ ./AgentiLoopF1
F11 toggles full screen.
