"""The four rooms.

Each builder returns (svg_markup, meta). `meta` is what the game engine needs
and the picture cannot tell it: where the floor is (so a dragged thing can be
clamped to it), and where each interactive station sits in viewBox pixels.
"""

import math

import furniture as F
import palette as P
from draw import circle, ellipse, line, n, path, rect, rng, text
from iso import (VIEW_H, VIEW_W, ZUNIT, box, cyl, edge_band, floor, glow, ht,
                 iso, lamp_pool, poly, post, skirting, slab, svg_close,
                 svg_open, walls)

W = D = 9.0      # room is 9x9 tiles
WALL_H = 4.6


def _meta(stations, surfaces=None, w=W, d=D):
    """`surfaces` are the tops of counters, tables and beds, in grid units:
    (x, y, w, d, height). Dropping something inside one puts it *on* the
    surface instead of on the floor, which is the whole reason furniture
    stops looking like a thing sprites sink into."""
    return {
        "surfaces": [{"x": s[0], "y": s[1], "w": s[2], "d": s[3], "h": s[4]}
                     for s in (surfaces or [])],
        "floor": [list(iso(0, 0, 0)), list(iso(w, 0, 0)),
                  list(iso(w, d, 0)), list(iso(0, d, 0))],
        "grid": {"w": w, "d": d},
        "stations": {k: {"x": round(iso(*v[:3])[0], 1),
                         "y": round(iso(*v[:3])[1], 1),
                         "gx": v[0], "gy": v[1], "gz": v[2],
                         "r": v[3] if len(v) > 3 else 60}
                     for k, v in stations.items()},
    }


def _shell(floor_ink, left_ink, right_ink, floor_dens=55, tiles=True):
    return "".join([
        walls(W, D, WALL_H, left_ink, right_ink),
        floor(W, D, floor_ink, floor_dens, tiles),
        skirting(W, D),
        edge_band(W, D),
    ])


# ==================================================================== SHOP

def shop():
    o = [_shell(P.YELLOW, P.PAPER_PALE, P.TEAL, 45)]

    # --- walls: window, door, shelves, pictures
    o.append(F.window("R", 1.4, 3.4, 2.0, 3.5, 2))
    o.append(F.door_arch("R", 7.0, 8.6, 3.2))
    o.append(F.window("L", 2.2, 4.2, 2.0, 3.5, 2))
    o.append(F.wall_shelf("L", 5.4, 8.4, 2.5, jars=6, seed="shopshelf"))
    o.append(F.picture("R", 4.6, 5.6, 2.4, 3.4, P.CORAL))
    o.append(F.picture("R", 5.9, 6.7, 2.6, 3.3, P.TEAL))
    o.append(F.bunting(0.3, 0.25, 8.6, 0.25, 3.95, 10))
    o.append(F.bunting(0.25, 0.3, 0.25, 8.6, 3.95, 10))

    # --- daylight from the two windows, pooling on the floor
    o.append(lamp_pool(5.9, 2.0, 2.4, 2.0))
    o.append(lamp_pool(2.4, 1.2, 2.0, 1.8, P.YELLOW))

    # --- the back-of-house line, drawn back to front
    o.append(F.display_case(0.7, 0.45, 3.5, 1.15, 1.15))
    o.append(F.clutter(0.8, 0.55, 1.9, 3.2, 0.9, "casetop", 3,
                       [P.YELLOW, P.PINK]))
    o.append(F.counter(4.7, 0.45, 1.9, 1.15, 1.2, P.TEAL, P.PAPER_PALE))
    o.append(F.register(5.05, 0.6, 1.2))
    o.append(F.clutter(5.9, 0.6, 1.2, 0.6, 0.8, "tilljar", 2,
                       [P.TEAL, P.GREEN]))
    o.append(F.ground_shadow(8.5, 0.5, 0.5))
    o.append(F.plant(8.5, 0.5, P.GREEN, True))
    o.append(F.chalkboard(8.1, 2.5, 0, 0.9, 1.5))

    # --- the cafe half
    o.append(F.rug(2.0, 3.6, 4.4, 4.0, P.PINK))
    o.append(F.ground_shadow(2.4, 5.2, 0.5))
    o.append(F.round_table(2.4, 5.2, 0.62, 0.95, P.CORAL))
    o.append(F.ground_shadow(1.4, 5.0, 0.28))
    o.append(F.stool(1.4, 5.0, 0.6, P.YELLOW))
    o.append(F.ground_shadow(3.3, 5.6, 0.28))
    o.append(F.stool(3.3, 5.6, 0.6, P.TEAL))
    o.append(F.ground_shadow(6.2, 4.3, 0.5))
    o.append(F.round_table(6.2, 4.3, 0.58, 0.95, P.TEAL))
    o.append(F.ground_shadow(5.3, 4.1, 0.28))
    o.append(F.stool(5.3, 4.1, 0.6, P.CORAL))
    o.append(F.ground_shadow(7.0, 4.9, 0.28))
    o.append(F.stool(7.0, 4.9, 0.6, P.YELLOW))
    o.append(F.ground_shadow(4.2, 7.9, 0.75))
    o.append(F.table(3.3, 7.3, 1.8, 1.2, 0.95, P.ORANGE))
    o.append(F.clutter(3.5, 7.5, 0.95, 1.4, 0.8, "tabletop", 3,
                       [P.TEAL, P.PINK]))
    o.append(F.chair(2.7, 7.5, 0))
    o.append(F.chair(5.2, 7.5, 2, P.PINK))
    o.append(F.ground_shadow(0.6, 7.4, 0.35))
    o.append(F.plant(0.6, 7.4, P.GREEN))
    o.append(F.ground_shadow(8.4, 7.0, 0.5))
    o.append(F.plant(8.4, 7.0, P.MOSS, True))
    o.append(F.ground_shadow(7.9, 5.6, 0.26))
    o.append(F.stool(7.9, 5.6, 0.5, P.PINK))

    # --- the small light
    o.append(glow(5.9, 2.0, 1.4, 74))
    o.append(F.hanging_lamp(5.9, 1.2, 4.3, 1.5, P.CORAL))

    st = {
        "case":    (2.45, 1.0, 1.9, 150),
        "counter": (5.65, 1.0, 1.2, 90),
        "door":    (7.8, 0.2, 0.0, 70),
        "table1":  (2.4, 5.2, 0.95, 70),
        "table2":  (6.2, 4.3, 0.95, 70),
        "table3":  (4.2, 7.9, 0.95, 80),
    }
    m = _meta(st, [
        (0.7, 0.45, 3.5, 1.15, 1.15),    # display case counter top
        (4.7, 0.45, 1.9, 1.15, 1.20),    # service counter
        (1.78, 4.58, 1.24, 1.24, 0.95),  # round table 1
        (5.58, 3.68, 1.16, 1.16, 0.95),  # round table 2
        (3.3, 7.3, 1.8, 1.2, 0.95),      # long table
    ])
    # eight display slots along the top of the case, left to right
    m["slots"] = [{"x": round(iso(1.05 + i * 0.42, 1.02, 1.32)[0], 1),
                   "y": round(iso(1.05 + i * 0.42, 1.02, 1.32)[1], 1)}
                  for i in range(8)]
    return "".join(o), m


# ================================================================= KITCHEN

def kitchen():
    """White-tiled working kitchen. Every horizontal surface carries clutter --
    that density is what the reference art is actually made of."""
    o = [_shell(P.PAPER_DEEP, P.PAPER_PALE, P.PAPER_PALE, 30)]

    o.append(F.window("L", 5.6, 7.8, 2.1, 3.6, 3))
    o.append(F.wall_shelf("L", 1.6, 5.0, 2.4, jars=7, seed="pantryA"))
    o.append(F.wall_shelf("L", 1.6, 5.0, 3.2, jars=7, seed="pantryB"))
    o.append(F.wall_shelf("R", 1.0, 4.4, 2.9, jars=7, seed="pantryC"))
    o.append(F.wall_shelf("R", 1.0, 4.4, 3.6, jars=7, seed="pantryD"))
    o.append(F.picture("R", 5.0, 5.9, 2.6, 3.4, P.TEAL))
    # a rail of hanging pans over the back counter
    for i in range(5):
        u = 1.3 + i * 0.62
        o.append(F.wall_panel("R", u - 0.16, 1.85, u + 0.16, 2.35,
                              [P.CORAL, P.TEAL, P.YELLOW, P.PLUM, P.GREEN][i], 75))

    o.append(lamp_pool(4.5, 4.4, 2.8, 2.3))
    o.append(lamp_pool(1.2, 6.6, 1.8, 1.6, P.YELLOW))

    # --- the working line
    o.append(F.oven(6.4, 0.4, 2.2, 1.35, 1.9))
    o.append(F.clutter(6.5, 0.5, 1.9, 2.0, 1.1, "ovtop", 3, [P.TEAL, P.CORAL]))
    o.append(F.counter(4.4, 0.45, 1.8, 1.1, 1.05, P.TEAL_DEEP, P.PAPER_PALE))
    o.append(F.cooling_rack(4.55, 0.6, 1.05, 1.5, 0.85))
    o.append(F.fridge(0.4, 0.4, 1.3, 1.2, 2.5))
    o.append(F.clutter(0.45, 0.45, 2.5, 1.2, 1.1, "fridgetop", 3))
    o.append(F.sink(0.4, 2.2, 1.3, 1.0, 1.05))
    o.append(F.counter(0.4, 3.5, 1.4, 1.1, 1.05, P.TEAL_DEEP, P.PAPER_PALE))
    o.append(F.clutter(0.45, 3.6, 1.05, 1.3, 1.0, "leftcount", 5))
    o.append(F.shelf_unit(0.45, 6.6, 1.5, 0.6, 2.5, 4, P.ORANGE, "kshelf"))

    # --- the island, the thing she will actually use
    o.append(F.counter(3.2, 3.6, 3.0, 2.2, 1.05, P.CORAL, P.PAPER_PALE))
    o.append(F.rolling_pin(5.05, 4.85, 1.05, P.YELLOW_PALE))
    o.append(F.clutter(5.4, 3.75, 1.05, 0.7, 0.8, "island", 3,
                       [P.YELLOW, P.TEAL]))
    o.append(F.mixing_bowl(4.0, 4.7, 1.05, 0.72))
    o.append(F.ground_shadow(3.0, 6.2, 0.3))
    o.append(F.stool(3.0, 6.2, 0.6, P.YELLOW))
    o.append(F.ground_shadow(6.9, 4.4, 0.3))
    o.append(F.stool(6.9, 4.4, 0.6, P.TEAL))

    o.append(F.ground_shadow(8.4, 6.6, 0.5))
    o.append(F.plant(8.4, 6.6, P.GREEN, True))
    o.append(F.ground_shadow(0.6, 8.4, 0.35))
    o.append(F.plant(0.6, 8.4, P.MOSS))
    o.append(F.bunting(0.25, 0.3, 0.25, 8.6, 3.9, 9))
    # sacks and crates in the front of house
    o.append(F.ground_shadow(2.2, 7.6, 0.45))
    o.append(cyl(2.2, 7.6, 0, 0.36, 0.8, P.PAPER_DEEP, 60))
    o.append(F.ground_shadow(6.4, 7.2, 0.5))
    o.append(box(6.1, 6.9, 0, 0.8, 0.7, 0.6, P.ORANGE, 72))
    o.append(box(6.2, 7.0, 0.6, 0.6, 0.5, 0.45, P.TEAL, 72))
    o.append(F.rug(3.4, 6.6, 2.4, 1.8, P.SEA))

    o.append(glow(4.7, 4.6, 3.0, 66))
    o.append(F.hanging_lamp(4.7, 4.6, 4.3, 1.3, P.YELLOW))

    st = {
        "bowl":   (4.0, 4.7, 1.05, 95),
        "prep":   (5.4, 4.6, 1.05, 110),
        "oven":   (7.5, 1.9, 0.95, 105),
        "rack":   (5.3, 1.0, 1.12, 95),
        "pantry": (0.9, 4.0, 1.05, 95),
        "sink":   (1.05, 2.7, 1.05, 70),
    }
    return "".join(o), _meta(st, [
        (3.2, 3.6, 3.0, 2.2, 1.05),      # the island
        (4.4, 0.45, 1.8, 1.1, 1.05),     # cooling-rack counter
        (0.4, 3.5, 1.4, 1.1, 1.05),      # left counter
        (0.4, 2.2, 1.3, 1.0, 1.05),      # sink surround
        (6.4, 0.4, 2.2, 1.35, 1.90),     # top of the oven
    ])


# ================================================================== GARDEN

def garden():
    """Where the ingredients actually come from. Tapping the tree, the bushes,
    the patch or the coop hands you something -- the only 'economy' in the game
    is that food has an origin."""
    o = ["".join([floor(W, D, P.TEAL, 40, False), edge_band(W, D)])]
    o.append(F.grass(W, D, "lawn", 420))
    o.append(F.fence("L", 0, D, 1.1, P.PAPER_PALE, 9))
    o.append(F.fence("R", 0, W, 1.1, P.PAPER_PALE, 9))

    # the path has to fan across the screen, not straight down it:
    # equal steps in x and y project to a vertical line in isometric.
    for i, (sx, sy) in enumerate([(1.1, 1.5), (1.7, 2.1), (2.5, 2.5),
                                  (3.3, 2.9), (4.0, 3.5), (4.3, 4.3),
                                  (3.9, 5.2), (3.6, 6.1)]):
        o.append(F.stepping_stone(sx, sy))

    o.append(F.well(4.4, 4.4))
    o.append(F.tree(1.7, 1.7, 3.4, P.MOSS, P.CORAL))

    for i, (bx, by) in enumerate([(6.6, 0.9), (7.7, 1.9), (6.9, 2.9),
                                  (8.1, 3.7)]):
        o.append(F.ground_shadow(bx, by, 0.5))
        o.append(F.bush(bx, by, P.GREEN, P.PLUM if i % 2 else P.BERRY))

    o.append(F.pumpkin_patch(1.0, 5.8, 2.0, 2.4, "pp", 6))
    o.append(F.coop(6.6, 6.2, 1.7, 1.5, 1.1))

    o.append(F.ground_shadow(4.3, 7.6, 0.8))
    o.append(F.table(3.4, 7.0, 1.9, 1.2, 0.9, P.PLUM))
    o.append(F.clutter(3.6, 7.2, 0.9, 1.5, 0.8, "picnic", 3, [P.YELLOW, P.TEAL]))
    o.append(F.chair(2.7, 7.2, 0, P.YELLOW))
    o.append(F.chair(5.4, 7.2, 2, P.YELLOW))

    o.append(F.ground_shadow(6.2, 4.6, 0.5))
    o.append(F.plant(6.2, 4.6, P.GREEN, True))
    o.append(F.ground_shadow(0.7, 3.4, 0.35))
    o.append(F.plant(0.7, 3.4, P.MOSS))
    o.append(F.bunting(0.3, 0.3, 0.3, 8.6, 1.05, 8, 18))

    o.append(glow(4.4, 4.4, 2.0, 46))

    st = {
        "tree":    (1.7, 1.7, 1.9, 130),
        "bushes":  (7.3, 2.3, 0.6, 140),
        "patch":   (2.0, 7.0, 0.3, 130),
        "coop":    (7.4, 6.9, 0.7, 100),
        "well":    (4.4, 4.4, 0.8, 75),
        "picnic":  (4.3, 7.6, 0.9, 85),
    }
    return "".join(o), _meta(st, [
        (3.4, 7.0, 1.9, 1.2, 0.90),      # picnic table
        (3.9, 3.9, 1.0, 1.0, 0.75),      # the well head
        (6.6, 6.2, 1.7, 1.5, 1.10),      # coop roof ledge
    ])


# =============================================================== UPSTAIRS

def upstairs():
    """The night room. No stations, nothing to do -- which is the point."""
    o = [_shell(P.NAVY, P.NAVY, P.NAVY, 62)]

    # a window onto the night, with the moon in it
    o.append(F.wall_panel("R", 5.4, 1.9, 8.0, 3.8, P.NAVY_DEEP, 85))
    wc = iso(6.7, 0, 2.85)
    o.append(F.stars(wc[0], wc[1], 150, 95, "win", 14))
    o.append(F.moon(wc[0] + 30, wc[1] - 8, 20))
    o.append(F.window("R", 5.4, 8.0, 1.9, 3.8, 3, lit=False, pane=False))

    o.append(F.picture("L", 2.0, 3.0, 2.6, 3.6, P.CORAL))
    o.append(F.picture("L", 3.4, 4.2, 2.8, 3.5, P.YELLOW))
    o.append(F.wall_shelf("L", 5.6, 8.2, 2.6, jars=5, seed="upshelf"))

    o.append(F.rug(2.6, 3.4, 4.2, 3.8, P.CORAL))
    o.append(F.bed(0.5, 4.8, 2.1, 3.2))
    o.append(F.shelf_unit(0.5, 0.6, 1.6, 0.6, 2.8, 4, P.PLUM, "books"))
    o.append(F.table(6.4, 2.0, 1.4, 1.0, 0.8, P.PLUM))
    o.append(F.stool(5.6, 3.4, 0.55, P.TEAL))
    o.append(F.cat_bed(7.4, 5.6))
    o.append(F.plant(8.4, 7.6, P.MOSS, True))
    o.append(F.plant(0.6, 8.4, P.GREEN))

    # the lamp on the little table -- the small light itself
    o.append(lamp_pool(3.9, 4.6, 3.0, 2.4))
    o.append(lamp_pool(7.0, 2.4, 1.6, 1.3))
    o.append(glow(3.9, 3.9, 2.9, 96))
    o.append(glow(7.05, 2.4, 0.9, 40))
    o.append(F.hanging_lamp(3.9, 3.9, 4.3, 1.6, P.YELLOW))

    st = {
        "bedside": (6.9, 2.4, 0.8, 80),
        "bed":     (1.5, 6.2, 0.7, 110),
        "rugmid":  (4.6, 5.2, 0.02, 120),
        "catbed":  (7.4, 5.6, 0.1, 70),
    }
    return "".join(o), _meta(st, [
        (0.5, 4.8, 2.1, 3.2, 0.72),      # the bed
        (6.4, 2.0, 1.4, 1.0, 0.80),      # bedside table
    ])


ROOMS = {
    "kitchen": ("The Kitchen", kitchen),
    "shop": ("The Shop", shop),
    "garden": ("The Garden", garden),
    "upstairs": ("Upstairs", upstairs),
}
