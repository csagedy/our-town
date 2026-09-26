"""Isometric projection + risograph halftone screens.

Rooms are drawn as 2:1 isometric cutaway plates: a floor rhombus and two back
walls, floating on bare paper. This module gives room code three things --
a projection, a cuboid, and a set of halftone pattern fills.

Why halftone lives here and not in CSS: room art is emitted as a standalone
.svg loaded via <img>, so the browser rasterises it exactly once and then only
ever composites a bitmap. That means the room can be as dot-dense and detailed
as we like without costing anything per frame. Draggable sprites, which are
live DOM, deliberately use flat ink instead.
"""

import math

import palette as P
from draw import (attrs, circle, closed_spline, ellipse, g, line, n,
                  open_spline, path, rect, rng, text)

TILE = 62.0      # half-width of one floor tile on screen
ZUNIT = 36.0     # screen height of one unit of elevation

VIEW_W = 1200
VIEW_H = 860
ORIGIN = (600.0, 210.0)


# ------------------------------------------------------------- projection

def iso(x, y, z=0.0):
    """Grid (x right-and-down-right, y left-and-down-left, z up) -> screen."""
    return (ORIGIN[0] + (x - y) * TILE,
            ORIGIN[1] + (x + y) * TILE * 0.5 - z * ZUNIT)


def poly(pts3, fill=None, stroke=None, w=None, **kw):
    """A polygon given in grid space."""
    d = " ".join("%s,%s" % (n(a), n(b)) for a, b in (iso(*p) for p in pts3))
    return "<polygon %s/>" % attrs(points=d, fill=fill, stroke=stroke,
                                   stroke_width=w, stroke_linejoin="round", **kw)


def depth(x, y, z=0.0):
    """Painter's-algorithm key. Bigger = nearer the viewer."""
    return x + y + z * 0.01


# --------------------------------------------------------------- halftone
# One <pattern> per (ink, density). Each ink gets its own screen angle, which
# is what stops overlapping screens from moiring -- exactly as in real riso.

_DENSITIES = (25, 40, 55, 70, 85, 100)


def _pat_id(ink, dens):
    return "ht%s-%d" % (ink.lstrip("#").lower(), dens)


def halftone_defs(inks=None):
    """Emit every pattern we might need. Cheap: they're only rasterised if used."""
    inks = inks or [P.NAVY, P.NAVY_DEEP, P.TEAL, P.TEAL_DEEP, P.CORAL, P.YELLOW,
                    P.PINK, P.GREEN, P.ORANGE, P.PLUM, P.SEA, P.MOSS, P.BERRY,
                    P.OLIVE, P.PAPER_DEEP]
    pitch = P.DOT_PITCH * 1.9
    out = []
    for ink in inks:
        angle = P.SCREEN_ANGLE.get(ink, 30)
        for dens in _DENSITIES:
            r = P.DOT_MAX * 1.9 * math.sqrt(dens / 100.0)
            out.append(
                '<pattern id="%s" width="%s" height="%s" '
                'patternUnits="userSpaceOnUse" patternTransform="rotate(%s)">'
                '<circle cx="%s" cy="%s" r="%s" fill="%s"/></pattern>' % (
                    _pat_id(ink, dens), n(pitch), n(pitch), n(angle),
                    n(pitch / 2), n(pitch / 2), n(r), ink))
    return "".join(out)


def ht(ink, dens=70):
    """Fill value: this ink, screened at this density."""
    dens = min(_DENSITIES, key=lambda d: abs(d - dens))
    return "url(#%s)" % _pat_id(ink, dens)


def screened(shape_fn, ink, dens=70, under=None, under_op=0.16):
    """Draw a shape twice: a faint flat undertone for body, then the dot screen
    on top. This is what keeps large areas from looking like bare paper."""
    out = []
    if under is not False:
        out.append(shape_fn(under or ink, under_op))
    out.append(shape_fn(ht(ink, dens), None))
    return "".join(out)


# ------------------------------------------------------------------ solids

def box(x, y, z, w, d, h, ink, dens=70, outline=True, top_ink=None):
    """An isometric cuboid -- the workhorse of every room.

    Top face is the lightest, the right face mid, the left face darkest. That
    single convention is most of what makes a flat drawing read as 3D.
    """
    ti = top_ink or ink
    x2, y2, z2 = x + w, y + d, z + h
    faces = [
        # left face (the y+d side)
        ([(x, y2, z2), (x2, y2, z2), (x2, y2, z), (x, y2, z)], ink, dens + 35),
        # right face (the x+w side)
        ([(x2, y, z2), (x2, y2, z2), (x2, y2, z), (x2, y, z)], ink, dens + 6),
        # top
        ([(x, y, z2), (x2, y, z2), (x2, y2, z2), (x, y2, z2)], ti, dens - 30),
    ]
    out = []
    for pts, fi, dd in faces:
        dd = max(25, min(100, dd))
        out.append(poly(pts, fill=fi, opacity=0.14))
        out.append(poly(pts, fill=ht(fi, dd)))
        if outline:
            out.append(poly(pts, fill="none", stroke=P.INK, w=1.1))
    return "".join(out)


def slab(x, y, z, w, d, ink, dens=60, outline=True):
    """A flat horizontal plate at height z -- rugs, tabletops, plates."""
    pts = [(x, y, z), (x + w, y, z), (x + w, y + d, z), (x, y + d, z)]
    out = [poly(pts, fill=ink, opacity=0.12), poly(pts, fill=ht(ink, dens))]
    if outline:
        out.append(poly(pts, fill="none", stroke=P.INK, w=1.0))
    return "".join(out)


def post(x, y, z, h, ink=None, w=1.4):
    """A thin vertical -- table legs, lamp stems, fence posts."""
    a = iso(x, y, z)
    b = iso(x, y, z + h)
    return line(a[0], a[1], b[0], b[1], ink or P.INK, w)


def cyl(x, y, z, r, h, ink, dens=70):
    """A round column: an ellipse top, a rectangle body. Good enough at this
    scale and far cheaper than a real swept solid."""
    top = iso(x, y, z + h)
    bot = iso(x, y, z)
    rx, ry = r * TILE, r * TILE * 0.5
    body = ("M%s %s L%s %s A%s %s 0 0 0 %s %s L%s %s Z" % (
        n(top[0] - rx), n(top[1]), n(bot[0] - rx), n(bot[1]),
        n(rx), n(ry), n(bot[0] + rx), n(bot[1]),
        n(top[0] + rx), n(top[1])))
    return "".join([
        path(body, fill=ink, opacity=0.14), path(body, fill=ht(ink, dens + 18)),
        path(body, fill="none", stroke=P.INK, w=1.0),
        ellipse(top[0], top[1], rx, ry, fill=ink, opacity=0.14),
        ellipse(top[0], top[1], rx, ry, fill=ht(ink, dens - 15)),
        ellipse(top[0], top[1], rx, ry, fill="none", stroke=P.INK, w=1.0),
    ])


# ------------------------------------------------------------------- light

def glow(x, y, z, r=90, ink=None):
    """The starburst. The single motif the whole look is named for -- every
    room gets at least one, and it is always the warmest thing in the frame."""
    cx, cy = iso(x, y, z)
    ink = ink or P.ORANGE
    rays = []
    for i in range(16):
        a = i * math.tau / 16 + 0.1
        ln = r * (1.35 if i % 4 == 0 else (0.95 if i % 2 == 0 else 0.6))
        rays.append('<line %s/>' % attrs(
            x1=n(cx + math.cos(a) * r * 0.10),
            y1=n(cy + math.sin(a) * r * 0.08),
            x2=n(cx + math.cos(a) * ln), y2=n(cy + math.sin(a) * ln * 0.8),
            stroke=ink, stroke_width=2.6, stroke_linecap="round",
            opacity=0.85))
    return "".join([
        circle(cx, cy, r * 0.95, fill=ht(P.YELLOW, 25), opacity=0.55),
        circle(cx, cy, r * 0.55, fill=ht(P.YELLOW, 55), opacity=0.8),
        circle(cx, cy, r * 0.30, fill=ht(P.ORANGE, 70), opacity=0.9),
        "".join(rays),
        circle(cx, cy, r * 0.17, fill=P.YELLOW_PALE),
        circle(cx, cy, r * 0.09, fill=P.PAPER_PALE),
    ])


def lamp_pool(x, y, rx=2.6, ry=2.0, ink=None):
    """A warm pool of light thrown onto the floor under a lamp or window."""
    c = iso(x, y, 0)
    return ellipse(c[0], c[1], rx * TILE, ry * TILE * 0.5,
                   fill=ht(ink or P.YELLOW, 40), opacity=0.65)


# -------------------------------------------------------------- room shell

def floor(w, d, ink, dens=55, tiles=True):
    """The floor rhombus, optionally with a tile grid scribed into it."""
    out = [poly([(0, 0, 0), (w, 0, 0), (w, d, 0), (0, d, 0)],
                fill=ink, opacity=0.13),
           poly([(0, 0, 0), (w, 0, 0), (w, d, 0), (0, d, 0)],
                fill=ht(ink, dens))]
    if tiles:
        for i in range(1, int(w)):
            a, b = iso(i, 0, 0), iso(i, d, 0)
            out.append(line(a[0], a[1], b[0], b[1], P.INK, 0.7, opacity=0.35))
        for j in range(1, int(d)):
            a, b = iso(0, j, 0), iso(w, j, 0)
            out.append(line(a[0], a[1], b[0], b[1], P.INK, 0.7, opacity=0.35))
    out.append(poly([(0, 0, 0), (w, 0, 0), (w, d, 0), (0, d, 0)],
                    fill="none", stroke=P.INK, w=1.6))
    return "".join(out)


def walls(w, d, h, left_ink, right_ink, dens=45):
    """The two back walls of the cutaway. Left wall is the x=0 plane, right
    wall is the y=0 plane."""
    L = [(0, 0, 0), (0, d, 0), (0, d, h), (0, 0, h)]
    R = [(0, 0, 0), (w, 0, 0), (w, 0, h), (0, 0, h)]
    out = []
    for pts, ink, dd in ((L, left_ink, dens + 14), (R, right_ink, dens)):
        out.append(poly(pts, fill=ink, opacity=0.13))
        out.append(poly(pts, fill=ht(ink, dd)))
        out.append(poly(pts, fill="none", stroke=P.INK, w=1.6))
    return "".join(out)


def skirting(w, d, h=0.18):
    """The thin lip along the bottom of each wall. Small, but it's the detail
    that makes the room look built rather than diagrammed."""
    out = []
    out.append(poly([(0, 0, 0), (0, d, 0), (0, d, h), (0, 0, h)],
                    fill=ht(P.NAVY, 55)))
    out.append(poly([(0, 0, 0), (w, 0, 0), (w, 0, h), (0, 0, h)],
                    fill=ht(P.NAVY, 55)))
    return "".join(out)


def edge_band(w, d, t=0.22):
    """The dark band around the outside of the floor plate, which is what makes
    the room read as a solid slab floating on the paper."""
    a = iso(0, 0, 0); b = iso(w, 0, 0); c = iso(w, d, 0); e = iso(0, d, 0)
    dz = t * ZUNIT
    band = ("M%s %s L%s %s L%s %s L%s %s L%s %s L%s %s Z" % (
        n(b[0]), n(b[1]), n(c[0]), n(c[1]), n(e[0]), n(e[1]),
        n(e[0]), n(e[1] + dz), n(c[0]), n(c[1] + dz), n(b[0]), n(b[1] + dz)))
    return (path(band, fill=ht(P.NAVY, 70)) +
            path(band, fill="none", stroke=P.INK, w=1.4))


def svg_open(w=VIEW_W, h=VIEW_H):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
            'width="%d" height="%d" shape-rendering="auto">' % (w, h, w, h))


def svg_close():
    return "</svg>"
