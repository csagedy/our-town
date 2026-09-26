"""The four rooms, drawn as front elevations.

Each builder returns (svg, meta). The art holds fixed scenery only -- walls,
counters, the oven, shelves, the display case. Everything you can pick up is a
live sprite the game places on top.

`meta` is what the picture cannot tell the engine:

    band      the floor strip things stand in: back line, front line, x limits
    surfaces  horizontal lines you can set something down on, as (x0, x1, y)
    stations  interaction points -- the bowl, the oven, the pantry, the door
    slots     the display-case positions, left to right

A surface being a *line segment* rather than a 3D box is the quiet win of this
direction: "is it on the counter?" is one x-range test and one y compare.
"""

import math

import elevation as EL
import palette as P
from draw import (circle, ellipse, line, n, path, rect, rng, sparkle, text)

RX, RY, RW, RH = 30, 16, 1140, 828


# The garden is the one room that wants a different split: outdoors is mostly
# ground, and a tall band of empty sky is the failure mode of drawing a garden
# head-on.
FLOOR_FRACTION = {"garden": 0.46}


def _room(key):
    return EL.Room(RX, RY, RW, RH, key,
                   RH * FLOOR_FRACTION[key] if key in FLOOR_FRACTION else None)


def _meta(r, title, stations, surfaces, slots=None):
    m = {
        "name": title,
        "band": {"floor": round(r.floor, 1), "front": round(r.front, 1),
                 "x0": round(r.x + 26, 1), "x1": round(r.x + r.w - 26, 1)},
        "surfaces": [{"x0": round(s[0], 1), "x1": round(s[1], 1),
                      "y": round(s[2], 1)} for s in surfaces],
        "stations": {k: {"x": round(v[0], 1), "y": round(v[1], 1),
                         "r": v[2] if len(v) > 2 else 80}
                     for k, v in stations.items()},
    }
    if slots:
        m["slots"] = [{"x": round(s[0], 1), "y": round(s[1], 1)} for s in slots]
    return m


# ================================================================== kitchen

def kitchen():
    r = _room("kitchen")
    out = [EL.shell(r, "tile")]

    lamp, cone = EL.pendant(r, r.u(.50), 104, P.JAM, 240)
    out.append(cone)

    out.append(EL.window(r, r.u(.135), 185, 150, RY + 58))
    out.append(EL.shelf(r, r.u(.33), RY + 150, 250, 6, "kshA"))
    out.append(EL.shelf(r, r.u(.33), RY + 252, 250, 5, "kshB"))
    out.append(EL.clock(r, r.u(.60), RY + 96, 32))
    out.append(EL.picture(r, r.u(.70), RY + 106, 92, 74, P.TEAL))
    out.append(EL.apron_rail(r, r.u(.79), RY + 214, 220, 3))
    out.append(EL.shelf(r, r.u(.60), RY + 300, 200, 4, "kshC"))
    out.append(EL.bunting(r, RX + 30, RX + RW - 30, RY + 26, 11, 36))

    # --- the working line: prep, mix, cool, bake
    oven_cx, oven_w, oven_h = r.u(.885), 200, 205
    out.append(EL.oven(r, oven_cx, oven_w, oven_h))

    cnt_cx, cnt_w, cnt_h = r.u(.545), 380, 128
    out.append(EL.counter(r, cnt_cx, cnt_w, cnt_h, P.TEAL, P.PAPER_DEEP, 3))
    ctop = r.floor - cnt_h - 18

    lft_cx, lft_w, lft_h = r.u(.115), 215, 118
    out.append(EL.counter(r, lft_cx, lft_w, lft_h, P.PLUM, P.PAPER_DEEP, 2))
    ltop = r.floor - lft_h - 18

    bowl_cx = r.u(.455)
    out.append(EL.mixing_bowl(r, bowl_cx, ctop, 1.0))
    rack_cx = r.u(.655)
    out.append(EL.cooling_rack(r, rack_cx, ctop, 175))

    out.append(EL.rug(r, r.u(.42), 400, P.ROSE))
    out.append(EL.plant(r, r.u(.055), True))
    out.append(lamp)

    st = {
        "bowl":   (bowl_cx, ctop - 52, 92),
        "prep":   (r.u(.33), ctop - 16, 70),
        "oven":   (oven_cx, r.floor - oven_h * 0.40, 96),
        "rack":   (rack_cx, ctop - 14, 80),
        "pantry": (r.u(.33), RY + 210, 130),
        "sink":   (r.u(.115), ltop - 14, 70),
    }
    surf = [
        (lft_cx - lft_w / 2 - 8, lft_cx + lft_w / 2 + 8, ltop),
        (cnt_cx - cnt_w / 2 - 8, cnt_cx + cnt_w / 2 + 8, ctop),
        (oven_cx - oven_w / 2, oven_cx + oven_w / 2, r.floor - oven_h - 6),
    ]
    return "".join(out), _meta(r, "The Kitchen", st, surf)


# ===================================================================== shop

def shop():
    r = _room("shop")
    out = [EL.shell(r, "stripe")]

    lamp, cone = EL.pendant(r, r.u(.325), 112, P.PUMPKIN, 240)
    out.append(cone)

    door_cx = r.u(.915)
    out.append(EL.doorway(r, door_cx, 168, 288))
    out.append(EL.window(r, r.u(.655), 200, 155, RY + 62))
    out.append(EL.sign(r, r.u(.145), RY + 86, 240, 76, "BAKERY"))
    out.append(EL.shelf(r, r.u(.46), RY + 196, 188, 5, "shopsh"))
    out.append(EL.bunting(r, RX + 30, RX + RW - 30, RY + 28, 11, 38))

    case_cx, case_w, case_h = r.u(.255), 366, 246
    case, shelf_slots, top_slots = EL.display_case(r, case_cx, case_w, case_h)
    out.append(case)

    till_cx, till_w, till_h = r.u(.555), 198, 128
    out.append(EL.counter(r, till_cx, till_w, till_h, P.JAM, P.PAPER_DEEP, 2))
    cty = r.floor - till_h - 18

    tbl_cx, tbl_w, tbl_h = r.u(.785), 210, 110
    out.append(EL.rug(r, r.u(.72), 380, P.SAGE))
    out.append(EL.chair(r, r.u(.682), 136, P.TEAL))
    out.append(EL.chair(r, r.u(.888), 136, P.TEAL, True))
    out.append(EL.table(r, tbl_cx, tbl_w, tbl_h, P.CARAMEL))
    tty = r.floor - tbl_h - 6

    out.append(EL.plant(r, r.u(.035), True))
    out.append(lamp)

    # display slots: the lower shelf first, then the top, left to right
    slots = [(sx + 42, sy + 4) for sx, sy in shelf_slots]
    slots += [(sx + 42, sy + 3) for sx, sy in top_slots]

    st = {
        "case":    (case_cx, r.floor - case_h * 0.55, 150),
        "counter": (till_cx, cty - 14, 90),
        "door":    (door_cx, r.at(.35), 80),
        "table1":  (tbl_cx, tty - 12, 86),
        "table2":  (r.u(.60), r.at(.75), 90),
        "table3":  (r.u(.33), r.at(.85), 90),
    }
    surf = [
        (till_cx - till_w / 2 - 8, till_cx + till_w / 2 + 8, cty),
        (tbl_cx - tbl_w / 2, tbl_cx + tbl_w / 2, tty),
        (case_cx - case_w / 2, case_cx + case_w / 2, r.floor - case_h + 96),
    ]
    return "".join(out), _meta(r, "The Shop", st, surf, slots)


# =================================================================== garden

def garden():
    """Outdoors is the hard one in elevation -- a garden is a horizontal space
    and this projection has no horizon. It gets depth from layers instead:
    sky, a hedge line along the back, then the grass band."""
    r = _room("garden")
    sky = "#CFE3EA"
    out = ['<rect x="%s" y="%s" width="%s" height="%s" rx="18" fill="%s"/>' % (
        n(RX), n(RY), n(RW), n(RH), sky)]

    # sun and a few clouds
    out.append(circle(r.u(.87), RY + 78, 44, fill=P.GLOW))
    out.append(circle(r.u(.87), RY + 78, 62, fill=P.GLOW, opacity=0.28))
    for cx, cy, s in [(r.u(.30), RY + 66, 1.0), (r.u(.58), RY + 112, .72),
                      (r.u(.12), RY + 130, .6)]:
        for dx, dy, rad in ((-36, 6, 26), (0, -8, 34), (34, 6, 24)):
            out.append(ellipse(cx + dx * s, cy + dy * s, rad * s, rad * s * .72,
                               fill=P.WHITE, opacity=0.9))

    # a picket fence, then a hedge in front of it: two layers of middle
    # distance, which is what stops a head-on garden reading as a backdrop
    fy = r.floor - 96
    out.append(rect(RX, fy, RW, 11, 4, fill=P.PAPER_PALE))
    out.append(rect(RX, fy + 34, RW, 11, 4, fill=P.PAPER_PALE))
    fx = RX + 16
    while fx < RX + RW - 10:
        out.append(path("M%s %s l%s %s l%s %s l%s %s Z" % (
            n(fx), n(fy + 58), n(0), n(-52), n(9), n(-11), n(9), n(11)),
            fill=P.PAPER_PALE))
        out.append(path("M%s %s l%s %s l%s %s l%s %s Z" % (
            n(fx), n(fy + 58), n(0), n(-52), n(9), n(-11), n(9), n(11)),
            fill="none", stroke=P.INK, w=1.5))
        fx += 42

    # a hedge along the back, which is what gives the scene a middle distance
    hedge_y = r.floor - 6
    rr = rng("hedge")
    hx = RX
    while hx < RX + RW:
        hr = rr.uniform(30, 46)
        out.append(circle(hx, hedge_y - hr * .45, hr, fill=P.GREEN_DEEP))
        hx += hr * 1.15
    out.append(rect(RX, hedge_y - 10, RW, 16, 0, fill=P.GREEN_DEEP))

    # grass band
    out.append(rect(RX, r.floor, RW, r.floor_h, 0, fill=P.SAGE))
    out.append(line(RX, r.floor, RX + RW, r.floor, P.INK, 2.2))
    g = rng("grass")
    for _ in range(300):
        gx = g.uniform(RX + 4, RX + RW - 4)
        gy = g.uniform(r.floor + 4, RY + RH - 8)
        out.append(path("M%s %s q%s %s %s %s" % (
            n(gx), n(gy), n(g.uniform(-2, 2)), n(-6),
            n(g.uniform(-4, 4)), n(-12)),
            stroke=P.GREEN, w=2, fill="none", stroke_linecap="round",
            opacity=0.55))

    # the apple tree
    tx = r.u(.15)
    out.append(rect(tx - 18, r.floor - 214, 36, 216, 14, fill=P.CARAMEL))
    out.append(rect(tx - 18, r.floor - 214, 36, 216, 14, fill="none",
                    stroke=P.INK, w=EL.LW))
    canopy = [(tx - 78, r.floor - 252, 74), (tx + 70, r.floor - 250, 70),
              (tx - 12, r.floor - 312, 84), (tx + 40, r.floor - 208, 60),
              (tx - 66, r.floor - 204, 56)]
    for cx, cy, rad in canopy:
        out.append(circle(cx, cy, rad, fill=P.GREEN))
    for cx, cy, rad in canopy[:3]:
        out.append(circle(cx - rad * .26, cy - rad * .26, rad * .52,
                          fill=P.SAGE, opacity=0.5))
    ar = rng("apples")
    for _ in range(11):
        cx, cy, rad = ar.choice(canopy)
        ax = cx + ar.uniform(-rad * .7, rad * .7)
        ay = cy + ar.uniform(-rad * .5, rad * .7)
        out.append(circle(ax, ay, 11, fill=P.CHERRY))
        out.append(circle(ax, ay, 11, fill="none", stroke=P.INK, w=1.6))

    # berry bushes
    bush_cx = r.u(.80)
    for i, bx in enumerate([.74, .81, .88]):
        cx = r.u(bx)
        for dx, dy, rad in ((-28, -26, 34), (28, -26, 30), (0, -52, 36)):
            out.append(circle(cx + dx, r.floor + dy, rad, fill=P.GREEN))
        for j in range(5):
            out.append(circle(cx - 34 + j * 17, r.floor - 36 - (j % 3) * 15, 7,
                              fill=P.BERRY if i % 2 else P.JAM))

    # pumpkin patch, sitting properly in the grass
    patch_cx = r.u(.235)
    pr = rng("pumpkins")
    for i in range(4):
        cx = patch_cx + (i - 1.5) * 52 + pr.uniform(-6, 6)
        cy = r.floor + 44 + pr.uniform(-8, 10)
        s = pr.uniform(.85, 1.15)
        out.append(ellipse(cx, cy + 22 * s, 34 * s, 9 * s, fill=P.SHADOW_HEX,
                           opacity=0.13))
        for dx, rx in ((-13 * s, 15 * s), (13 * s, 15 * s), (0, 20 * s)):
            out.append(ellipse(cx + dx, cy, rx, 24 * s, fill=P.PUMPKIN))
        out.append(ellipse(cx, cy, 32 * s, 24 * s, fill="none", stroke=P.INK,
                           w=EL.LW))
        out.append(line(cx, cy - 22 * s, cx + 4, cy - 36 * s, P.GREEN, 4.5))

    # the chicken coop
    coop_cx = r.u(.66)
    cw, chh = 150, 118
    cx0 = coop_cx - cw / 2
    cy0 = r.floor + 46 - chh
    out.append(EL.shadow_under(coop_cx, r.floor + 52, cw * 1.1))
    out.append(EL.rr(cx0, cy0, cw, chh, 8, P.JAM))
    out.append(path("M%s %s L%s %s L%s %s Z" % (
        n(cx0 - 18), n(cy0 + 4), n(coop_cx), n(cy0 - 58), n(cx0 + cw + 18),
        n(cy0 + 4)), fill=P.DUSK))
    out.append(path("M%s %s L%s %s L%s %s Z" % (
        n(cx0 - 18), n(cy0 + 4), n(coop_cx), n(cy0 - 58), n(cx0 + cw + 18),
        n(cy0 + 4)), fill="none", stroke=P.INK, w=EL.LW))
    out.append(path("M%s %s a%s %s 0 0 1 %s 0 l0 %s l%s 0 Z" % (
        n(coop_cx - 26), n(cy0 + chh), n(26), n(30), n(52), n(-40), n(-52)),
        fill=P.INK, opacity=0.85))
    out.append(EL.rr(cx0, cy0, cw, chh, 8, "none", True, EL.LW))

    # picnic table
    tbl_cx, tbl_w, tbl_h = r.u(.45), 210, 108
    picnic_base = r.at(.30)
    out.append(EL.chair(r, r.u(.335), 126, P.BUTTER, False, picnic_base))
    out.append(EL.chair(r, r.u(.565), 126, P.BUTTER, True, picnic_base))
    out.append(EL.table(r, tbl_cx, tbl_w, tbl_h, P.PLUM, picnic_base))
    tty = picnic_base - tbl_h - 6
    out.append(EL.bunting(r, RX + 30, RX + RW - 30, RY + 30, 10, 40))


    st = {
        "tree":   (tx, r.floor - 300, 130),
        "bushes": (bush_cx, r.floor - 30, 130),
        "patch":  (patch_cx, r.floor + 40, 120),
        "coop":   (coop_cx, cy0 + chh * 0.5, 96),
        "picnic": (tbl_cx, tty - 12, 84),
    }
    surf = [(tbl_cx - tbl_w / 2, tbl_cx + tbl_w / 2, tty)]
    return "".join(out), _meta(r, "The Garden", st, surf)


# ================================================================= upstairs

def upstairs():
    r = _room("upstairs")
    out = [EL.shell(r, "dots")]

    lamp, cone = EL.pendant(r, r.u(.50), 130, P.BUTTER, 260)
    out.append(cone)

    out.append(EL.window(r, r.u(.80), 200, 158, RY + 62, night=True))
    out.append(EL.picture(r, r.u(.33), RY + 96, 88, 70, P.JAM))
    out.append(EL.picture(r, r.u(.44), RY + 110, 72, 58, P.BUTTER))
    out.append(EL.shelf(r, r.u(.62), RY + 200, 186, 4, "upsh"))

    out.append(EL.rug(r, r.u(.52), 440, P.JAM))
    bed_cx = r.u(.17)
    out.append(EL.bed(r, bed_cx, 320))
    out.append(EL.bookshelf(r, r.u(.91), 168, 250, "upbooks"))
    tbl_cx, tbl_w, tbl_h = r.u(.66), 166, 98
    out.append(EL.table(r, tbl_cx, tbl_w, tbl_h, P.PLUM))
    tty = r.floor - tbl_h - 6
    out.append(lamp)

    st = {
        "bedside": (tbl_cx, tty - 12, 80),
        "bed":     (bed_cx, r.floor - 100, 110),
        "rugmid":  (r.u(.52), r.at(.6), 120),
    }
    surf = [
        (tbl_cx - tbl_w / 2, tbl_cx + tbl_w / 2, tty),
        (bed_cx - 150, bed_cx + 150, r.floor - 108),
    ]
    return "".join(out), _meta(r, "Upstairs", st, surf)


ROOMS = {"kitchen": kitchen, "shop": shop, "garden": garden,
         "upstairs": upstairs}


def house(rooms_svg):
    """All four rooms at once. Each is drawn full size and scaled as a group,
    which is both simpler and more honest than re-proportioning furniture."""
    W, H = 1200, 860
    pad, gap, titleh = 26, 14, 44
    cw = (W - pad * 2 - gap) / 2.0
    ch = (H - pad * 2 - gap - titleh) / 2.0
    k = min(cw / RW, ch / RH)
    order = [("upstairs", 0, 0), ("garden", 1, 0),
             ("kitchen", 0, 1), ("shop", 1, 1)]

    cells, defs = [], []
    body = []
    for i, (key, col, row) in enumerate(order):
        cx = pad + col * (cw + gap)
        cy = pad + titleh + row * (ch + gap)
        defs.append('<clipPath id="cell%d"><rect x="%s" y="%s" width="%s" '
                    'height="%s" rx="14"/></clipPath>' % (
                        i, n(cx), n(cy), n(cw), n(ch)))
        ox = cx + (cw - RW * k) / 2.0
        oy = cy + (ch - RH * k) / 2.0
        body.append('<g clip-path="url(#cell%d)"><g transform="translate(%s %s) '
                    'scale(%s) translate(%s %s)">%s</g></g>' % (
                        i, n(ox), n(oy), n(k), n(-RX), n(-RY), rooms_svg[key]))
        body.append('<rect x="%s" y="%s" width="%s" height="%s" rx="14" '
                    'fill="none" stroke="%s" stroke-width="3"/>' % (
                        n(cx), n(cy), n(cw), n(ch), P.INK))
        # the exact transform used above, so the game can place live sprites
        # into these cells and the house view shows the real world, not a
        # picture of an empty one
        cells.append({"room": key, "x": round(cx, 1), "y": round(cy, 1),
                      "w": round(cw, 1), "h": round(ch, 1),
                      "ox": round(ox, 2), "oy": round(oy, 2),
                      "k": round(k, 5), "rx": RX, "ry": RY})
    svg = ("<defs>" + "".join(defs) + "</defs>" + "".join(body) +
           text(W / 2, 32, "Little Lantern Bakery", 28, P.INK))
    return svg, cells
