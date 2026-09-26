#!/bin/sh
# Rebuild every sprite and the mockup from scratch. Usage: scripts/render_all.sh
# Optional: TOY_PALETTE=path/to/palette.json scripts/render_all.sh
set -e
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
DIR=$(cd "$(dirname "$0")" && pwd)
rm -f "$DIR/../sprites/_render_log.json"
for s in bg_cafe_kitchen char_big_kid char_little_kid prop_pan prop_tomato prop_cupcake prop_bowl compose_mockup; do
  echo "== $s"
  "$BLENDER" -b --factory-startup -P "$DIR/$s.py" 2>&1 | grep -E "^\[|Error|Traceback" || true
done
