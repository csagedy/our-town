"""Isometric furniture vocabulary.

Rooms are assembled almost entirely from these. Keeping the vocabulary small
is what makes four rooms look like one bakery instead of four clip-art piles.
Everything takes grid coordinates; everything returns SVG.
"""

import math

import palette as P
from draw import (attrs, circle, ellipse, g, line, n, open_spline, path, rect,
                  rng, text)
from iso import ZUNIT, box, cyl, ht, iso, poly, post, slab


# ------------------------------------------------------------ wall surfaces

def wall_poly(plane, u0, z0, u1, z1):
    """A rectangle lying in one of the two back walls.
    plane 'R' = the y=0 wall (screen right), 'L' = the x=0 wall (screen left).
    """
    if plane == "R":
        return [(u0, 0, z0), (u1, 0, z0), (u1, 0, z1), (u0, 0, z1)]
    return [(0, u0, z0), (0, u1, z0), (0, u1, z1), (0, u0, z1)]


def wall_panel(plane, u0, z0, u1, z1, ink, dens=60, outline=True):
    pts = wall_poly(plane, u0, z0, u1, z1)
    out = [poly(pts, fill=ink, opacity=0.13), poly(pts, fill=ht(ink, dens))]
    if outline:
        out.append(poly(pts, fill="none", stroke=P.INK, w=1.2))
    return "".join(out)


def window(plane, u0, u1, z0=1.8, z1=3.6, panes=2, ink=None, lit=True,
           pane=True):
    """A window with a sill and mullions, and daylight coming through it."""
    ink = ink or P.PAPER_PALE
    out = [wall_panel(plane, u0 - 0.1, z0 - 0.1, u1 + 0.1, z1 + 0.1,
                      P.PAPER_DEEP, 45)]
    if pane:
        out.append(wall_panel(plane, u0, z0, u1, z1,
                              P.YELLOW_PALE if lit else P.SEA, 35))
    else:
        out.append(poly(wall_poly(plane, u0, z0, u1, z1),
                        fill="none", stroke=P.INK, w=1.4))
    for i in range(1, panes):
        u = u0 + (u1 - u0) * i / panes
        a = iso(*(wall_poly(plane, u, z0, u, z1)[0]))
        b = iso(*(wall_poly(plane, u, z0, u, z1)[3]))
        out.append(line(a[0], a[1], b[0], b[1], P.INK, 1.2))
    zm = (z0 + z1) / 2.0
    p = wall_poly(plane, u0, zm, u1, zm)
    a, b = iso(*p[0]), iso(*p[1])
    out.append(line(a[0], a[1], b[0], b[1], P.INK, 1.2))
    return "".join(out)


def door_arch(plane, u0, u1, h=3.4, ink=None):
    """An arched doorway. Customers walk in through this one."""
    ink = ink or P.TEAL_DEEP
    pts = wall_poly(plane, u0, 0, u1, h)
    a, b, c, d = (iso(*p) for p in pts)
    w = abs(b[0] - a[0]) or abs(b[1] - a[1])
    arc_r = (u1 - u0) * 0.5
    top_l, top_r = d, c
    mid = ((top_l[0] + top_r[0]) / 2.0, (top_l[1] + top_r[1]) / 2.0 - arc_r * 34)
    dpath = ("M%s %s L%s %s Q%s %s %s %s L%s %s Z" % (
        n(a[0]), n(a[1]), n(top_l[0]), n(top_l[1]),
        n(mid[0]), n(mid[1]), n(top_r[0]), n(top_r[1]),
        n(b[0]), n(b[1])))
    return "".join([
        path(dpath, fill=P.PAPER, opacity=0.9),
        path(dpath, fill=ht(P.NAVY, 25)),
        path(dpath, fill="none", stroke=P.INK, w=1.6),
        path(dpath, fill="none", stroke=ink, w=4, opacity=0.5),
    ])


def wall_shelf(plane, u0, u1, z, ink=None, jars=6, seed="shelf"):
    """A shelf board on a wall, with little jars and tins lined up on it."""
    ink = ink or P.CORAL
    r = rng(seed)
    out = [wall_panel(plane, u0, z, u1, z + 0.14, P.NAVY, 65)]
    for i in range(jars):
        u = u0 + (u1 - u0) * (i + 0.5) / jars
        h = r.uniform(0.28, 0.52)
        w_ = (u1 - u0) / jars * 0.55
        col = r.choice([P.CORAL, P.TEAL, P.YELLOW, P.PINK, P.GREEN, P.ORANGE])
        out.append(wall_panel(plane, u - w_ / 2, z + 0.14, u + w_ / 2,
                              z + 0.14 + h, col, 70))
    return "".join(out)


def picture(plane, u0, u1, z0, z1, ink=None):
    ink = ink or P.CORAL
    return (wall_panel(plane, u0, z0, u1, z1, P.PAPER_PALE, 30) +
            wall_panel(plane, u0 + .08, z0 + .08, u1 - .08, z1 - .08, ink, 60))


# ---------------------------------------------------------------- furniture

def table(x, y, w=2.0, d=1.4, h=0.95, ink=None, legs=True):
    ink = ink or P.CORAL
    out = []
    if legs:
        for lx, ly in ((x + .12, y + .12), (x + w - .12, y + .12),
                       (x + .12, y + d - .12), (x + w - .12, y + d - .12)):
            out.append(post(lx, ly, 0, h, P.INK, 2.0))
    out.append(box(x, y, h - 0.14, w, d, 0.14, ink, 85))
    return "".join(out)


def round_table(x, y, r=0.62, h=0.95, ink=None):
    ink = ink or P.CORAL
    c0, c1 = iso(x, y, 0), iso(x, y, h)
    return "".join([
        ellipse(c0[0], c0[1] + 2, r * 40, r * 20, fill=P.NAVY, opacity=0.16),
        ellipse(c0[0], c0[1], r * 30, r * 15, fill=ht(P.INK, 70)),
        line(c0[0], c0[1], c1[0], c1[1], P.INK, 5.0),
        ellipse(c0[0], c0[1] - 2, r * 26, r * 13, fill=ht(P.NAVY, 40),
                opacity=0.5),
        ellipse(c1[0], c1[1], r * 62, r * 31, fill=ink, opacity=0.14),
        ellipse(c1[0], c1[1], r * 62, r * 31, fill=ht(ink, 45)),
        ellipse(c1[0], c1[1], r * 62, r * 31, fill="none", stroke=P.INK, w=1.2),
    ])


def chair(x, y, facing=0, ink=None):
    """facing: 0 back-right, 1 back-left, 2 front-right, 3 front-left."""
    ink = ink or P.TEAL
    s = 0.52
    out = [box(x, y, 0, s, s, 0.5, ink, 62)]
    if facing == 0:
        out.append(box(x, y, 0.5, 0.1, s, 0.55, ink, 75))
    elif facing == 1:
        out.append(box(x, y, 0.5, s, 0.1, 0.55, ink, 75))
    elif facing == 2:
        out.append(box(x + s - 0.1, y, 0.5, 0.1, s, 0.55, ink, 75))
    else:
        out.append(box(x, y + s - 0.1, 0.5, s, 0.1, 0.55, ink, 75))
    return "".join(out)


def stool(x, y, h=0.6, ink=None):
    ink = ink or P.YELLOW
    return cyl(x, y, 0, 0.26, h, ink, 60)


def counter(x, y, w, d=1.1, h=1.15, ink=None, top=None):
    """A solid service counter with a lighter top slab."""
    ink = ink or P.TEAL
    return (box(x, y, 0, w, d, h - 0.1, ink, 70) +
            box(x - .06, y - .06, h - 0.1, w + .12, d + .12, 0.1,
                top or P.PAPER_DEEP, 40))


def display_case(x, y, w=3.4, d=1.1, h=1.15):
    """The glass case. Its top surface is where baked goods get stacked, so it
    is drawn deliberately open and readable rather than realistically glassy."""
    out = [counter(x, y, w, d, h, P.CORAL, P.PAPER_PALE)]
    # glass box above the counter
    gh = 0.75
    x2, y2, z2 = x + w - .05, y + d - .05, h + gh
    for pts in (
            [(x + .05, y2, z2), (x2, y2, z2), (x2, y2, h), (x + .05, y2, h)],
            [(x2, y + .05, z2), (x2, y2, z2), (x2, y2, h), (x2, y + .05, h)],
            [(x + .05, y + .05, z2), (x2, y + .05, z2), (x2, y2, z2),
             (x + .05, y2, z2)]):
        out.append(poly(pts, fill=P.TEAL_PALE, opacity=0.10))
        out.append(poly(pts, fill='none', stroke=P.INK, w=1.2))
    # shelf line inside
    p = [(x + .05, y + .05, h + gh * .5), (x + w - .05, y + .05, h + gh * .5)]
    a, b = iso(*p[0]), iso(*p[1])
    out.append(line(a[0], a[1], b[0], b[1], P.INK, 0.9, opacity="0.5"))
    # a warm light inside the case
    out.append(_soft_pool(x + w / 2, y + d / 2, h + gh, w * 0.42, P.YELLOW))
    return "".join(out)


def _soft_pool(x, y, z, r, ink):
    c = iso(x, y, z)
    return ellipse(c[0], c[1], r * 62, r * 31, fill=ht(ink, 40), opacity=0.55)


def shelf_unit(x, y, w=1.6, d=0.5, h=2.6, shelves=4, ink=None, seed="su"):
    """A free-standing shelf stacked with little coloured things."""
    ink = ink or P.ORANGE
    r = rng(seed)
    out = [box(x, y, 0, w, d, h, ink, 70)]
    for i in range(1, shelves + 1):
        z = h * i / (shelves + 1)
        out.append(box(x - .04, y - .04, z, w + .08, d + .08, 0.06,
                       P.PAPER_DEEP, 40))
        k = r.randint(2, 4)
        for j in range(k):
            bw = w / k * 0.6
            bx = x + w * (j + 0.5) / k - bw / 2
            out.append(box(bx, y + .08, z + .06, bw, d * .6,
                           r.uniform(0.18, 0.36),
                           r.choice([P.TEAL, P.YELLOW, P.PINK, P.GREEN,
                                     P.CORAL]), 70))
    return "".join(out)


def rug(x, y, w, d, ink=None, stripes=True):
    ink = ink or P.PINK
    out = [slab(x, y, 0.01, w, d, ink, 40)]
    if stripes:
        for i in range(1, 5):
            u = x + w * i / 5.0
            a, b = iso(u, y, 0.012), iso(u, y + d, 0.012)
            out.append(line(a[0], a[1], b[0], b[1], P.INK, 1.4, opacity="0.30"))
    return "".join(out)


def plant(x, y, ink=None, big=False):
    """A potted plant. There is no such thing as too many of these."""
    ink = ink or P.GREEN
    ph = 0.42 if not big else 0.6
    out = [cyl(x, y, 0, 0.2 if not big else 0.3, ph, P.ORANGE, 70)]
    c = iso(x, y, ph)
    r = rng("plant%s%s" % (x, y))
    n_ = 7 if not big else 11
    for i in range(n_):
        a = -math.pi / 2 + (i - n_ / 2) * 0.34 + r.uniform(-.1, .1)
        ln = (34 if not big else 54) * r.uniform(0.7, 1.15)
        ex, ey = c[0] + math.cos(a) * ln, c[1] + math.sin(a) * ln
        out.append(path("M%s %s Q%s %s %s %s" % (
            n(c[0]), n(c[1]), n((c[0] + ex) / 2 - math.cos(a) * 8),
            n((c[1] + ey) / 2), n(ex), n(ey)),
            stroke=ink, w=2.2, fill="none", stroke_linecap="round"))
        out.append(ellipse(ex, ey, 5.5, 3.4, fill=ht(ink, 70),
                           transform="rotate(%s %s %s)" % (n(math.degrees(a) + 90),
                                                           n(ex), n(ey))))
    return "".join(out)


def tree(x, y, h=3.2, ink=None, fruit=None):
    """The garden's apple tree. Canopy is a cluster of screened circles -- five
    overlapping discs read as foliage far better than any drawn leaf shape."""
    ink = ink or P.MOSS
    base, top = iso(x, y, 0), iso(x, y, h * 0.55)
    out = [ground_shadow(x, y, 0.8),
           path("M%s %s Q%s %s %s %s" % (n(base[0] - 7), n(base[1]),
                                         n(top[0] - 5), n((base[1] + top[1]) / 2),
                                         n(top[0] - 4), n(top[1])),
                stroke=P.PLUM, w=13, fill="none", stroke_linecap="round"),
           path("M%s %s L%s %s" % (n(top[0] - 4), n(top[1] + 6),
                                   n(top[0] + 22), n(top[1] - 14)),
                stroke=P.PLUM, w=7, stroke_linecap="round"),
           path("M%s %s L%s %s" % (n(top[0] - 4), n(top[1] + 10),
                                   n(top[0] - 26), n(top[1] - 10)),
                stroke=P.PLUM, w=7, stroke_linecap="round")]
    r = rng("tree%s" % x)
    discs = []
    for i in range(7):
        a = i * math.tau / 7 + r.uniform(-.2, .2)
        discs.append((top[0] + math.cos(a) * r.uniform(24, 46),
                      top[1] - 34 + math.sin(a) * r.uniform(14, 26),
                      r.uniform(34, 50)))
    discs.append((top[0], top[1] - 40, 54))
    for cx, cy, rr in discs:
        out.append(circle(cx, cy, rr, fill=ink, opacity=0.14))
    for cx, cy, rr in discs:
        out.append(circle(cx, cy, rr, fill=ht(ink, 62)))
    for cx, cy, rr in discs:
        out.append(circle(cx, cy, rr, fill="none", stroke=P.INK, w=1.1,
                          opacity=0.55))
    if fruit:
        for i in range(11):
            a = r.uniform(0, math.tau)
            fx = top[0] + math.cos(a) * r.uniform(12, 62)
            fy = top[1] - 38 + math.sin(a) * r.uniform(10, 34)
            out.append(circle(fx, fy, 6, fill=fruit))
            out.append(circle(fx, fy, 6, fill="none", stroke=P.INK, w=1.0))
    return "".join(out)


def bush(x, y, ink=None, berries=None, r_=0.55):
    ink = ink or P.GREEN
    c = iso(x, y, 0)
    out = []
    r = rng("bush%s%s" % (x, y))
    for i in range(5):
        cx = c[0] + r.uniform(-24, 24)
        cy = c[1] + r.uniform(-12, 4) - 14
        rr = r.uniform(16, 26)
        out.append(circle(cx, cy, rr, fill=ink, opacity=0.12))
        out.append(circle(cx, cy, rr, fill=ht(ink, 65)))
    if berries:
        for i in range(8):
            out.append(circle(c[0] + r.uniform(-26, 26),
                              c[1] + r.uniform(-26, 2), 3.6, fill=berries))
    return "".join(out)


def fence(plane, u0, u1, z=1.0, ink=None, posts=8):
    ink = ink or P.PAPER_PALE
    out = [wall_panel(plane, u0, z * 0.45, u1, z * 0.62, ink, 55),
           wall_panel(plane, u0, z * 0.85, u1, z, ink, 55)]
    for i in range(posts + 1):
        u = u0 + (u1 - u0) * i / posts
        out.append(wall_panel(plane, u - 0.05, 0, u + 0.05, z, ink, 70))
    return "".join(out)


def bunting(x0, y0, x1, y1, z=3.2, flags=9, sag=26):
    """A string of little triangular flags. Pure charm, almost free."""
    a, b = iso(x0, y0, z), iso(x1, y1, z)
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag
    out = [path("M%s %s Q%s %s %s %s" % (n(a[0]), n(a[1]), n(mx), n(my),
                                         n(b[0]), n(b[1])),
                stroke=P.INK, w=1.2, fill="none")]
    cols = [P.CORAL, P.TEAL, P.YELLOW, P.PINK, P.GREEN]
    for i in range(1, flags):
        t = i / float(flags)
        px = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mx + t * t * b[0]
        py = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * my + t * t * b[1]
        out.append(path("M%s %s L%s %s L%s %s Z" % (
            n(px - 7), n(py), n(px + 7), n(py), n(px), n(py + 18)),
            fill=ht(cols[i % len(cols)], 75)))
        out.append(path("M%s %s L%s %s L%s %s Z" % (
            n(px - 7), n(py), n(px + 7), n(py), n(px), n(py + 18)),
            fill="none", stroke=P.INK, w=0.8))
    return "".join(out)


def hanging_lamp(x, y, z=4.2, drop=1.4, ink=None):
    """A pendant lamp with its light pooling on whatever is below."""
    ink = ink or P.CORAL
    top, bot = iso(x, y, z), iso(x, y, z - drop)
    return "".join([
        line(top[0], top[1], bot[0], bot[1], P.INK, 1.4),
        path("M%s %s L%s %s L%s %s Z" % (
            n(bot[0] - 26), n(bot[1] + 18), n(bot[0] + 26), n(bot[1] + 18),
            n(bot[0]), n(bot[1] - 8)), fill=ht(ink, 75)),
        path("M%s %s L%s %s L%s %s Z" % (
            n(bot[0] - 26), n(bot[1] + 18), n(bot[0] + 26), n(bot[1] + 18),
            n(bot[0]), n(bot[1] - 8)), fill="none", stroke=P.INK, w=1.2),
        ellipse(bot[0], bot[1] + 18, 26, 8, fill=P.YELLOW_PALE),
    ])


def oven(x, y, w=2.2, d=1.3, h=1.9):
    """The oven. Round door, warm light behind it, a chimney of steam."""
    out = [box(x, y, 0, w, d, h, P.NAVY, 72)]
    c = iso(x + w / 2, y + d + 0.01, h * 0.52)
    out += [
        ellipse(c[0], c[1], 52, 44, fill=P.PAPER_DEEP),
        ellipse(c[0], c[1], 52, 44, fill=ht(P.NAVY, 40)),
        ellipse(c[0], c[1], 52, 44, fill="none", stroke=P.INK, w=2.0),
        ellipse(c[0], c[1], 40, 34, fill=ht(P.ORANGE, 85)),
        ellipse(c[0], c[1], 40, 34, fill="none", stroke=P.INK, w=1.4),
        ellipse(c[0], c[1], 24, 20, fill=ht(P.YELLOW, 70)),
        ellipse(c[0], c[1] + 46, 16, 5, fill=ht(P.PAPER_DEEP, 60)),
        line(c[0] - 44, c[1] + 44, c[0] + 44, c[1] + 44, P.INK, 3),
    ]
    # dials
    for i in range(3):
        dc = iso(x + w / 2 - 0.35 + i * 0.35, y + d + 0.01, h * 0.88)
        out.append(circle(dc[0], dc[1], 6, fill=ht(P.CORAL, 80)))
        out.append(circle(dc[0], dc[1], 6, fill="none", stroke=P.INK, w=1.1))
    out.append(box(x + .1, y + .1, h, w - .2, d - .2, 0.12, P.PAPER_DEEP, 40))
    return "".join(out)


def mixing_bowl(x, y, z, r=0.72):
    """The big stand bowl on the prep island."""
    c = iso(x, y, z)
    rx, ry = r * 62, r * 31
    body = ("M%s %s A%s %s 0 0 0 %s %s L%s %s A%s %s 0 0 1 %s %s Z" % (
        n(c[0] - rx), n(c[1] - 8), n(rx), n(ry * 2.1), n(c[0] + rx), n(c[1] - 8),
        n(c[0] + rx * .70), n(c[1] - 8), n(rx * .70), n(ry * .8),
        n(c[0] - rx * .70), n(c[1] - 8)))
    return "".join([
        path(body, fill=P.PAPER_PALE),
        path(body, fill=ht(P.TEAL, 45)),
        path(body, fill="none", stroke=P.INK, w=1.5),
        ellipse(c[0], c[1] - 8, rx, ry, fill=ht(P.PAPER_DEEP, 40)),
        ellipse(c[0], c[1] - 8, rx, ry, fill="none", stroke=P.INK, w=1.8),
    ])


def cooling_rack(x, y, z, w=1.6, d=0.9):
    out = [box(x, y, z, w, d, 0.06, P.PAPER_DEEP, 35)]
    for i in range(1, 7):
        u = x + w * i / 7.0
        a, b = iso(u, y, z + 0.07), iso(u, y + d, z + 0.07)
        out.append(line(a[0], a[1], b[0], b[1], P.INK, 1.0, opacity="0.6"))
    for lx, ly in ((x + .06, y + .06), (x + w - .06, y + .06),
                   (x + .06, y + d - .06), (x + w - .06, y + d - .06)):
        out.append(post(lx, ly, z - 0.14, 0.14, P.INK, 1.6))
    return "".join(out)


def sink(x, y, w=1.4, d=1.0, h=1.05):
    out = [counter(x, y, w, d, h, P.TEAL_DEEP, P.PAPER_PALE)]
    out.append(box(x + .2, y + .18, h - .16, w - .4, d - .36, 0.1,
                   P.SEA, 45))
    tc = iso(x + w / 2, y + 0.16, h)
    out.append(path("M%s %s L%s %s Q%s %s %s %s" % (
        n(tc[0]), n(tc[1]), n(tc[0]), n(tc[1] - 30),
        n(tc[0] + 16), n(tc[1] - 32), n(tc[0] + 16), n(tc[1] - 18)),
        stroke=P.INK, w=2.6, fill="none", stroke_linecap="round"))
    return "".join(out)


def bed(x, y, w=2.0, d=3.0):
    out = [box(x, y, 0, w, d, 0.5, P.PLUM, 70),
           box(x - .05, y - .05, 0.5, w + .1, d * 0.72, 0.22, P.TEAL, 50),
           box(x + .12, y + d * 0.70, 0.5, w - .24, d * 0.26, 0.2,
               P.PAPER_PALE, 30),
           box(x, y, 0.5, w, 0.12, 1.1, P.PLUM, 80)]
    return "".join(out)


def chalkboard(x, y, z=0.0, w=1.1, h=1.7):
    """An A-frame chalkboard: two legs, a dark board, a chalk squiggle. The
    bakery's name is *not* drawn here -- the player names the shop, and the
    room art is built before there is a name to draw."""
    bl = iso(x, y + 0.55, 0)
    br = iso(x + w, y + 0.55, 0)
    top = iso(x + w / 2, y + 0.55, h)
    back = iso(x + w / 2, y + 1.15, 0)
    out = [ground_shadow(x + w / 2, y + 0.75, 0.6),
           line(top[0], top[1], back[0], back[1], P.INK, 4)]
    face = "M%s %s L%s %s L%s %s Z" % (n(top[0]), n(top[1]),
                                       n(bl[0]), n(bl[1]), n(br[0]), n(br[1]))
    out += [path(face, fill=P.PLUM, opacity=0.16),
            path(face, fill=ht(P.PLUM, 85)),
            path(face, fill="none", stroke=P.INK, w=1.8)]
    inner = "M%s %s L%s %s L%s %s Z" % (
        n(top[0]), n(top[1] + 16), n(bl[0] + 13), n(bl[1] - 12),
        n(br[0] - 13), n(br[1] - 12))
    out += [path(inner, fill=P.NAVY_DEEP),
            path(inner, fill="none", stroke=P.INK, w=1.2)]
    cy = (bl[1] + top[1]) / 2 + 6
    for i, dy in enumerate((0, 13, 26)):
        wd = 30 - i * 7
        out.append(line(top[0] - wd / 2, cy + dy, top[0] + wd / 2, cy + dy,
                        P.PAPER_PALE, 2.2, opacity="0.75"))
    return "".join(out)


def cat_bed(x, y):
    c = iso(x, y, 0)
    return "".join([
        ellipse(c[0], c[1], 40, 20, fill=ht(P.CORAL, 65)),
        ellipse(c[0], c[1], 40, 20, fill="none", stroke=P.INK, w=1.3),
        ellipse(c[0], c[1] - 3, 28, 13, fill=ht(P.PINK, 45)),
    ])


def register(x, y, z):
    out = [box(x, y, z, 0.7, 0.55, 0.42, P.PAPER_PALE, 35),
           box(x + .06, y - .04, z + .42, 0.58, 0.3, 0.3, P.CORAL, 70)]
    for i in range(3):
        for j in range(3):
            c = iso(x + 0.18 + j * 0.16, y + 0.12 + i * 0.14, z + 0.43)
            out.append(circle(c[0], c[1], 3.2, fill=ht(P.TEAL, 80)))
    return "".join(out)


def moon(cx, cy, r=34):
    return (circle(cx, cy, r, fill=ht(P.YELLOW, 55)) +
            circle(cx, cy, r, fill=P.YELLOW, opacity=0.14) +
            circle(cx, cy, r, fill="none", stroke=P.INK, w=1.2))


def stars(cx, cy, w, h, seed="stars", k=16):
    r = rng(seed)
    out = []
    for i in range(k):
        x = cx + r.uniform(-w / 2, w / 2)
        y = cy + r.uniform(-h / 2, h / 2)
        s = r.uniform(2.2, 4.4)
        out.append(path("M%s %s L%s %s M%s %s L%s %s" % (
            n(x - s), n(y), n(x + s), n(y), n(x), n(y - s), n(x), n(y + s)),
            stroke=P.YELLOW_PALE, w=1.4, stroke_linecap="round"))
    return "".join(out)


def ground_shadow(x, y, r=0.42):
    """A soft ellipse under a free-standing object. Without these, furniture
    floats; with them, it sits. Cheapest possible win."""
    c = iso(x, y, 0)
    return ellipse(c[0], c[1] + 2, r * 62, r * 30, fill=P.NAVY, opacity=0.16)


def clutter(x, y, z, w, d, seed="c", k=5, inks=None):
    """Little pots, tins and boxes scattered over a work surface. The reference
    art is 80% this: density of small things, not big set pieces."""
    r = rng(seed)
    inks = inks or [P.CORAL, P.TEAL, P.YELLOW, P.PINK, P.GREEN, P.ORANGE, P.PLUM]
    out = []
    items = []
    for _ in range(k):
        ix = x + r.uniform(0.08, max(0.09, w - 0.3))
        iy = y + r.uniform(0.08, max(0.09, d - 0.3))
        items.append((ix, iy, r.random(), r.uniform(0.14, 0.34), r.choice(inks)))
    for ix, iy, kind, h, ink in sorted(items, key=lambda t: t[0] + t[1]):
        if kind < 0.45:
            out.append(cyl(ix, iy, z, r.uniform(0.09, 0.16), h, ink, 72))
        else:
            sw = r.uniform(0.16, 0.3)
            out.append(box(ix, iy, z, sw, sw * 0.8, h, ink, 72))
    return "".join(out)


def rolling_pin(x, y, z, ink=None):
    a, b = iso(x, y, z), iso(x + 0.7, y + 0.7, z)
    ink = ink or P.PAPER_DEEP
    return (line(a[0] - 14, a[1] - 7, b[0] + 14, b[1] + 7, P.INK, 7.5) +
            line(a[0] - 14, a[1] - 7, b[0] + 14, b[1] + 7, ink, 6) +
            line(a[0] - 24, a[1] - 12, a[0] - 12, a[1] - 6, P.INK, 3.5))


def fridge(x, y, w=1.3, d=1.2, h=2.5):
    out = [box(x, y, 0, w, d, h, P.SEA, 55)]
    p = [(x, y + d, h * 0.62), (x + w, y + d, h * 0.62)]
    a, b = iso(*p[0]), iso(*p[1])
    out.append(line(a[0], a[1], b[0], b[1], P.INK, 1.4))
    hc = iso(x + w - 0.18, y + d + 0.01, h * 0.70)
    out.append(line(hc[0], hc[1], hc[0], hc[1] - 26, P.INK, 3.2))
    hc2 = iso(x + w - 0.18, y + d + 0.01, h * 0.52)
    out.append(line(hc2[0], hc2[1], hc2[0], hc2[1] - 22, P.INK, 3.2))
    return "".join(out)


def stepping_stone(x, y):
    c = iso(x, y, 0.015)
    return (ellipse(c[0], c[1], 24, 12, fill=P.PAPER_DEEP) +
            ellipse(c[0], c[1], 24, 12, fill=ht(P.PAPER_DEEP, 70)) +
            ellipse(c[0], c[1], 24, 12, fill="none", stroke=P.INK, w=1.1))


def pumpkin_patch(x, y, w, d, seed="pp", k=6):
    """Pumpkins are ribbed ellipses -- three overlapping lobes and a stalk."""
    r = rng(seed)
    out = []
    spots = sorted([(x + r.uniform(0, w), y + r.uniform(0, d)) for _ in range(k)],
                   key=lambda t: t[0] + t[1])
    for px, py in spots:
        c = iso(px, py, 0)
        sz = r.uniform(0.8, 1.2)
        out.append(ellipse(c[0], c[1] + 3, 24 * sz, 10 * sz, fill=P.NAVY,
                           opacity=0.16))
        for dx, rx in ((-9 * sz, 10 * sz), (9 * sz, 10 * sz), (0, 14 * sz)):
            out.append(ellipse(c[0] + dx, c[1] - 12 * sz, rx, 15 * sz,
                               fill=ht(P.ORANGE, 80)))
        out.append(ellipse(c[0], c[1] - 12 * sz, 22 * sz, 15 * sz,
                           fill="none", stroke=P.INK, w=1.3))
        out.append(line(c[0], c[1] - 26 * sz, c[0] + 3, c[1] - 34 * sz,
                        P.MOSS, 3.4))
    for _ in range(int(k * 2.4)):
        c = iso(x + r.uniform(-0.3, w + 0.3), y + r.uniform(-0.3, d + 0.3), 0)
        out.append(ellipse(c[0], c[1], 15, 8, fill=ht(P.MOSS, 65), opacity=0.85))
    return "".join(out)


def coop(x, y, w=1.7, d=1.5, h=1.1):
    """Chicken coop with a pitched roof, a ramp and a dark little doorway."""
    out = [ground_shadow(x + w / 2, y + d / 2, 0.85),
           box(x, y, 0, w, d, h, P.CORAL, 70)]
    ridge_a = iso(x, y + d / 2, h + 0.85)
    ridge_b = iso(x + w, y + d / 2, h + 0.85)
    for pts in ([(x, y, h), (x + w, y, h)], [(x, y + d, h), (x + w, y + d, h)]):
        a, b = iso(*pts[0], 0) if False else iso(pts[0][0], pts[0][1], pts[0][2]),                iso(pts[1][0], pts[1][1], pts[1][2])
        face = "M%s %s L%s %s L%s %s L%s %s Z" % (
            n(a[0]), n(a[1]), n(b[0]), n(b[1]),
            n(ridge_b[0]), n(ridge_b[1]), n(ridge_a[0]), n(ridge_a[1]))
        out.append(path(face, fill=ht(P.NAVY, 70)))
        out.append(path(face, fill="none", stroke=P.INK, w=1.3))
    dc = iso(x + w * 0.5, y + d + 0.01, h * 0.4)
    out.append(ellipse(dc[0], dc[1], 15, 19, fill=ht(P.NAVY_DEEP, 90)))
    out.append(ellipse(dc[0], dc[1], 15, 19, fill="none", stroke=P.INK, w=1.3))
    rc = iso(x + w * 0.5, y + d + 0.6, 0)
    out.append(path("M%s %s L%s %s L%s %s L%s %s Z" % (
        n(dc[0] - 13), n(dc[1] + 16), n(dc[0] + 13), n(dc[1] + 16),
        n(rc[0] + 13), n(rc[1]), n(rc[0] - 13), n(rc[1])),
        fill=ht(P.PAPER_DEEP, 65)))
    return "".join(out)


def well(x, y):
    out = [ground_shadow(x, y, 0.8), cyl(x, y, 0, 0.62, 0.75, P.PAPER_DEEP, 70)]
    c = iso(x, y, 0.75)
    for i in range(7):
        a = math.pi * i / 7.0
        out.append(line(c[0] + math.cos(a) * 38, c[1] + math.sin(a) * 19 + 2,
                        c[0] + math.cos(a) * 38, c[1] + math.sin(a) * 19 + 24,
                        P.INK, 1.0, opacity="0.5"))
    out.append(ellipse(c[0], c[1], 30, 15, fill=ht(P.NAVY_DEEP, 90)))
    la, lb = iso(x - 0.5, y + 0.5, 0.75), iso(x + 0.5, y - 0.5, 0.75)
    out.append(line(la[0], la[1], la[0], la[1] - 62, P.PLUM, 5))
    out.append(line(lb[0], lb[1], lb[0], lb[1] - 62, P.PLUM, 5))
    apex = ((la[0] + lb[0]) / 2, min(la[1], lb[1]) - 96)
    roof = "M%s %s L%s %s L%s %s Z" % (n(la[0] - 34), n(la[1] - 58),
                                       n(apex[0]), n(apex[1]),
                                       n(lb[0] + 34), n(lb[1] - 58))
    out.append(path(roof, fill=ht(P.CORAL, 78)))
    out.append(path(roof, fill="none", stroke=P.INK, w=1.5))
    out.append(line(la[0], la[1] - 58, lb[0], lb[1] - 58, P.INK, 2.5))
    bc = ((la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2 - 58)
    out.append(line(bc[0], bc[1], bc[0], bc[1] + 30, P.INK, 1.2))
    out.append(path("M%s %s L%s %s L%s %s L%s %s Z" % (
        n(bc[0] - 11), n(bc[1] + 30), n(bc[0] + 11), n(bc[1] + 30),
        n(bc[0] + 8), n(bc[1] + 48), n(bc[0] - 8), n(bc[1] + 48)),
        fill=ht(P.TEAL, 78)))
    return "".join(out)


def grass(w, d, seed="grass", k=420):
    """Short strokes over the whole lawn. Density is the whole effect."""
    r = rng(seed)
    out = []
    for _ in range(k):
        gx, gy = r.uniform(0.05, w - 0.05), r.uniform(0.05, d - 0.05)
        px, py = iso(gx, gy, 0)
        hh = r.uniform(5, 10)
        out.append(path("M%s %s q%s %s %s %s" % (
            n(px), n(py), n(r.uniform(-2, 2)), n(-hh * 0.6),
            n(r.uniform(-4, 4)), n(-hh)),
            stroke=P.MOSS, w=1.4, fill="none", stroke_linecap="round",
            opacity=0.75))
    return "".join(out)
