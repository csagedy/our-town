#!/bin/sh
# Rebuild every sprite, the mockup and the sheet. Usage: scripts/render_all.sh
set -e
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
DIR=$(cd "$(dirname "$0")" && pwd)
rm -f "$DIR/../sprites/_render_log.json"
for s in bg_cafe_kitchen characters props compose_mockup compose_sheet; do
  echo "== $s"
  "$BLENDER" -b --factory-startup -P "$DIR/$s.py" 2>&1 | grep -E "^\[|Error|Traceback" || true
done
