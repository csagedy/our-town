#!/usr/bin/env python3
"""Build the game.

    python3 tools/build.py

Draws every sprite and every room with code, then writes:

    index.html            shell + inlined sprite sheet + inlined game data
    assets/rooms/*.svg    one static image per room
    assets/grain.png      paper texture tile

Two deliberate choices, both about old hardware:

* Room art ships as a standalone .svg loaded through <img>. The browser
  rasterises it once, then only ever composites a bitmap -- so the rooms can
  carry as much halftone detail as we like for free.
* The sprite sheet is *inlined* into index.html rather than referenced. Chrome
  refuses cross-file <use href="sheet.svg#id">, and inlining also means the
  whole game is one request and runs correctly from a file:// double-click,
  with no server and no fetch().
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import draw                      # noqa: E402
import gamedata as G             # noqa: E402
import palette as P              # noqa: E402
import rooms_elev as R           # noqa: E402
import sprites_food as SF        # noqa: E402
import sprites_people as SP      # noqa: E402


def symbol(sid, inner):
    return ('<symbol id="s-%s" viewBox="0 0 100 100" '
            'overflow="visible">%s</symbol>' % (sid, inner))


def build_sprite_sheet():
    out = []
    for key, fn in SF.FOOD.items():
        out.append(symbol(key, fn()))
    for key, fn in SP.PROPS.items():
        out.append(symbol(key, fn()))
    for key, cfg in SP.CAST.items():
        out.append(symbol(key, SP.person(**cfg)))
    for key, fn in SP.ANIMALS.items():
        out.append(symbol(key, fn()))
    for key, fn in SP.FACES.items():
        out.append(symbol(key, fn()))
    return ('<svg id="sheet" xmlns="http://www.w3.org/2000/svg" '
            'aria-hidden="true"><defs>%s</defs></svg>' % "".join(out))


def build_rooms():
    """Write one .svg per room, plus the whole-house view."""
    import elevation as EL
    os.makedirs(os.path.join(ROOT, "assets", "rooms"), exist_ok=True)
    meta, bodies = {}, {}
    for key, fn in R.ROOMS.items():
        body, m = fn()
        bodies[key] = body
        doc = EL.svg_open(1200, 860) + body + EL.svg_close()
        path = os.path.join(ROOT, "assets", "rooms", "%s.svg" % key)
        with open(path, "w") as f:
            f.write(doc)
        m["art"] = "assets/rooms/%s.svg" % key
        m["bytes"] = len(doc)
        meta[key] = m

    house_svg, cells = R.house(bodies)
    doc = EL.svg_open(1200, 860) + house_svg + EL.svg_close()
    with open(os.path.join(ROOT, "assets", "rooms", "house.svg"), "w") as f:
        f.write(doc)
    meta["_house"] = {"art": "assets/rooms/house.svg", "cells": cells,
                      "bytes": len(doc)}
    return meta


def build_data(room_meta):
    items = {}
    for key, (kind, name) in G.ITEMS.items():
        items[key] = {"name": name, "kind": kind}
        if key in G.TOPPING_ICON:
            items[key]["icon"] = G.TOPPING_ICON[key]
    chars = {}
    for key, name in G.CHARACTERS.items():
        chars[key] = {"name": name,
                      "face": key in SP.CAST,
                      "animal": key in SP.ANIMALS,
                      "lines": G.CHATTER.get(key, [])}
    house = room_meta.pop("_house")
    return {
        "view": {"w": 1200, "h": 860},
        "rooms": room_meta,
        "house": house,
        "roomOrder": ["kitchen", "shop", "garden", "upstairs"],
        "items": items,
        "characters": chars,
        "faces": G.FACES,
        "sources": G.SOURCES,
        "doughRules": G.DOUGH_RULES,
        "recipes": G.RECIPES,
        "doughDefault": G.DOUGH_DEFAULT,
        "mysteryNames": G.MYSTERY_NAMES,
        "lines": {
            "greetings": G.GREETINGS, "wants": G.WANTS, "thanks": G.THANKS,
            "idle": G.IDLE, "oven": G.OVEN_LINES,
        },
        "palette": {
            "paper": P.PAPER, "paperPale": P.PAPER_PALE,
            "paperDeep": P.PAPER_DEEP, "navy": P.NAVY, "navyDeep": P.NAVY_DEEP,
            "teal": P.TEAL, "coral": P.CORAL, "yellow": P.YELLOW,
            "pink": P.PINK, "green": P.GREEN, "orange": P.ORANGE,
            "plum": P.PLUM, "sea": P.SEA,
        },
    }


def build_index(sheet, data):
    tpl_path = os.path.join(HERE, "index.template.html")
    with open(tpl_path) as f:
        tpl = f.read()
    html = tpl.replace("<!--SPRITE_SHEET-->", sheet)
    html = html.replace("<!--GAME_DATA-->", json.dumps(data, separators=(",", ":")))
    out = os.path.join(ROOT, "index.html")
    with open(out, "w") as f:
        f.write(html)
    return len(html)


def main():
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    grain = draw.grain_png(os.path.join(ROOT, "assets", "grain.png"), 96)
    sheet = build_sprite_sheet()
    room_meta = build_rooms()
    data = build_data(room_meta)
    size = build_index(sheet, data)

    n_sprites = (len(SF.FOOD) + len(SP.PROPS) + len(SP.CAST) +
                 len(SP.ANIMALS) + len(SP.FACES))
    print("sprites      %4d  (%d KB inlined)" % (n_sprites, len(sheet) // 1024))
    for k, m in sorted(room_meta.items()):
        print("room %-10s     %d KB" % (k.lstrip("_"), m["bytes"] // 1024))
    print("grain.png         %d KB" % (grain // 1024))
    print("index.html       %d KB total" % (size // 1024))


if __name__ == "__main__":
    main()
