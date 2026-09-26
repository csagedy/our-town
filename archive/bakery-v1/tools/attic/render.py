#!/usr/bin/env python3
"""Render the retired isometric direction. See README.md in this directory."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)

if "--warm" not in sys.argv:
    import palette_riso
    sys.modules["palette"] = palette_riso

import iso                                   # noqa: E402
import palette as P                          # noqa: E402
import rooms as R                            # noqa: E402

out = os.path.join(ROOT, "previews")
os.makedirs(out, exist_ok=True)
tag = "warm-iso" if "--warm" in sys.argv else "riso-iso"
defs = iso.halftone_defs()
for key, (title, fn) in R.ROOMS.items():
    body, _ = fn()
    doc = (iso.svg_open() + "<defs>" + defs + "</defs>" +
           '<rect width="%d" height="%d" fill="%s"/>' % (
               iso.VIEW_W, iso.VIEW_H, P.PAPER) +
           body + iso.svg_close())
    p = os.path.join(out, "%s-%s.svg" % (tag, key))
    open(p, "w").write(doc)
    print("%-22s %d KB" % (os.path.basename(p), len(doc) // 1024))
