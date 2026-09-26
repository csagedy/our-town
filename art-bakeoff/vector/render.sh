#!/bin/sh
# Rasterize an SVG with headless Chrome: render.sh in.svg out.png [w h]
W=${3:-2048}; H=${4:-1536}
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --default-background-color=00000000 \
  --screenshot="$2" --window-size=$W,$H "file://$(cd "$(dirname "$1")"; pwd)/$(basename "$1")" >/dev/null 2>&1
