#!/usr/bin/env python3
"""Render a contact sheet of every sprite, for eyeballing the art.

    python3 tools/contact_sheet.py        -> previews/sheet.svg

Not part of the game build. It exists because the fastest way to catch a
sprite that reads badly is to see all of them at once, small.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import elevation as EL                                # noqa: E402
import palette as P                                   # noqa: E402
import sprites_food as SF                             # noqa: E402
import sprites_people as SP                           # noqa: E402
from draw import text                                 # noqa: E402


def main():
    items = []
    for k, f in SF.FOOD.items():
        items.append((k, f()))
    for k, f in SP.PROPS.items():
        items.append((k, f()))
    for k, v in SP.CAST.items():
        items.append((k, SP.person(**v) + SP.FACES["face-happy"]()))
    for k, f in SP.ANIMALS.items():
        items.append((k, f()))
    for k, f in SP.FACES.items():
        items.append((k, f()))

    cols, cell = 10, 122
    rows = (len(items) + cols - 1) // cols
    w, h = cols * cell, rows * cell + 16
    out = [EL.svg_open(w, h)]
    for i, (k, s) in enumerate(items):
        cx, cy = (i % cols) * cell, (i // cols) * cell
        out.append('<g transform="translate(%d %d) scale(1.06)">%s</g>' % (
            cx + 6, cy + 4, s))
        out.append(text(cx + cell / 2, cy + cell - 6, k, 9.5, P.INK_SOFT))
    out.append(EL.svg_close())

    os.makedirs(os.path.join(ROOT, "previews"), exist_ok=True)
    p = os.path.join(ROOT, "previews", "sheet.svg")
    with open(p, "w") as f:
        f.write("".join(out))
    print("%d sprites -> previews/sheet.svg (%dx%d)" % (len(items), w, h))


if __name__ == "__main__":
    main()
