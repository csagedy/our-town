"""ALTERNATE ART DIRECTION -- front-elevation rooms.

A dollhouse seen head-on and sliced open: no projection, no depth sorting, no
grid maths. A room is a rectangle, the floor is a line near the bottom, and
everything stands on that line.

That simplicity is the argument for this direction. Placement becomes "what x,
and which floor?", drag targets are unambiguous, sprites sit naturally because
they were drawn as elevations in the first place, and the whole house can be
shown at once the way Toca Boca does it.

Everything here takes plain pixel coordinates inside a Room.
"""

import math

import palette as P
from draw import (arc, blob, circle, closed_spline, contact_shadow, ellipse, g,
                  highlight, leaf, line, n, open_spline, path, rect, rng,
                  sparkle, sprinkle_scatter, text)

LW = 2.2          # standard outline
LW_F = 1.4        # fine detail


def o(d, w=LW, col=None, **kw):
    return path(d, fill="none", stroke=col or P.INK, w=w,
                stroke_linejoin="round", stroke_linecap="round", **kw)


def solid(d, fill, outline=True, w=LW):
    s = path(d, fill=fill)
    return s + (o(d, w) if outline else "")


def rr(x, y, w_, h_, r_, fill, outline=True, lw=LW):
    out = rect(x, y, w_, h_, r_, fill=fill)
    if outline:
        out += rect(x, y, w_, h_, r_, fill="none", stroke=P.INK, w=lw,
                    stroke_linejoin="round")
    return out


def shadow_under(cx, y, w_, op=0.13):
    return ellipse(cx, y, w_ / 2, w_ * 0.075, fill=P.SHADOW_HEX, opacity=op)


# ===================================================================== room

class Room(object):
    """A rectangle with a floor band.

    Pure elevation has no "in front of", so a cat put down next to a cupboard
    reads as a sticker on the cupboard door. The fix -- and it is what Toca
    Boca actually does -- is a shallow floor band with two lines in it: big
    furniture stands against the back wall at `floor`, and characters and
    loose objects stand anywhere between `floor` and `front`, getting slightly
    larger as they come forward. That is enough depth cue to read correctly
    and it costs one number per object.
    """

    def __init__(self, x, y, w, h, key="kitchen", floor_h=None):
        self.x, self.y, self.w, self.h = x, y, w, h
        self.key = key
        self.floor_h = floor_h if floor_h is not None else h * 0.22
        self.floor = y + h - self.floor_h      # back line: furniture sits here
        self.front = y + h - 10                # front edge of the room
        self.wall_top = y
        self.ink = P.ROOM_WARM.get(key, P.ROOM_WARM["kitchen"])

    def u(self, t):
        """Fractional position across the room, 0..1."""
        return self.x + self.w * t

    def at(self, t):
        """Baseline for something standing at depth t (0 = back, 1 = front)."""
        return self.floor + (self.front - self.floor) * t

    def near(self, t):
        """Scale multiplier for depth t. Small on purpose -- this is a depth
        *cue*, not a perspective projection."""
        return 1.0 + 0.16 * t


# ------------------------------------------------------------------ shell

def shell(room, wallpaper="dots", boards=True):
    wall_ink, trim_ink, floor_ink, accent = room.ink
    out = []

    # the room box
    out.append(rr(room.x, room.y, room.w, room.h, 18, wall_ink, False))

    # wallpaper: a quiet repeating motif, never a loud one
    r = rng("wp" + room.key)
    if wallpaper == "dots":
        step = 46
        for gy in range(int(room.y) + 30, int(room.floor) - 8, step):
            for gx in range(int(room.x) + 28, int(room.x + room.w) - 16, step):
                off = (step // 2) if ((gy - int(room.y)) // step) % 2 else 0
                if gx + off > room.x + room.w - 18:
                    continue
                out.append(circle(gx + off, gy, 3.0, fill=trim_ink, opacity=0.55))
    elif wallpaper == "stripe":
        for gx in range(int(room.x) + 30, int(room.x + room.w) - 14, 44):
            out.append(rect(gx, room.y + 12, 15, room.floor - room.y - 12, 7,
                            fill=trim_ink, opacity=0.4))
    elif wallpaper == "tile":
        step = 58
        for gy in range(int(room.y) + 22, int(room.floor) - 4, step):
            out.append(line(room.x + 10, gy, room.x + room.w - 10, gy,
                            trim_ink, 1.6, opacity="0.65"))
        for gx in range(int(room.x) + 30, int(room.x + room.w) - 10, step):
            out.append(line(gx, room.y + 12, gx, room.floor, trim_ink, 1.6,
                            opacity="0.65"))
    elif wallpaper == "night":
        for _ in range(26):
            sx = r.uniform(room.x + 20, room.x + room.w - 20)
            sy = r.uniform(room.y + 20, room.floor - 40)
            out.append(sparkle(sx, sy, r.uniform(3, 6), P.GLOW_SOFT, 0.55))

    # floor
    out.append(rect(room.x, room.floor, room.w, room.floor_h, 0, fill=floor_ink))
    if boards:
        bw = 74
        rr2 = rng("boards" + room.key)
        gy = room.floor
        band = 0
        while gy < room.y + room.h - 2:
            hgt = min(room.floor_h / 2.2, room.y + room.h - gy)
            offx = (band % 2) * bw / 2
            gx = room.x - offx
            while gx < room.x + room.w:
                out.append(line(max(gx, room.x), gy + 2,
                                max(gx, room.x), gy + hgt - 2,
                                P.INK, 1.3, opacity="0.20"))
                gx += bw
            out.append(line(room.x, gy + hgt, room.x + room.w, gy + hgt,
                            P.INK, 1.3, opacity="0.18"))
            gy += hgt
            band += 1

    # baseboard, then the room outline over everything
    out.append(rect(room.x, room.floor - 13, room.w, 15, 3, fill=trim_ink))
    out.append(line(room.x, room.floor - 13, room.x + room.w, room.floor - 13,
                    P.INK, LW))
    out.append(line(room.x, room.floor + 2, room.x + room.w, room.floor + 2,
                    P.INK, LW))
    out.append(rect(room.x, room.y, room.w, room.h, 18, fill="none",
                    stroke=P.INK, w=3.0))
    return "".join(out)


# ------------------------------------------------------------ wall fittings

def window(room, cx, w_=170, h_=150, top=None, night=False):
    top = top if top is not None else room.y + 62
    x = cx - w_ / 2
    out = [rr(x - 10, top - 10, w_ + 20, h_ + 20, 10, P.PAPER_DEEP)]
    out.append(rr(x, top, w_, h_, 6, P.DUSK if night else P.SKY))
    if night:
        out.append(circle(cx + w_ * .26, top + h_ * .3, 20,
                          fill=P.GLOW_SOFT, opacity=0.95))
        r = rng("winstars")
        for _ in range(9):
            out.append(sparkle(r.uniform(x + 8, x + w_ - 8),
                               r.uniform(top + 8, top + h_ - 8),
                               r.uniform(2.5, 5), P.GLOW_SOFT, 0.85))
    else:
        out.append(circle(cx - w_ * .22, top + h_ * .30, 26, fill=P.WHITE,
                          opacity=0.55))
        out.append(circle(cx + w_ * .10, top + h_ * .22, 18, fill=P.WHITE,
                          opacity=0.45))
        out.append(rect(x, top + h_ * 0.62, w_, h_ * 0.38, 0, fill=P.SAGE,
                        opacity=0.65))
    out.append(line(cx, top, cx, top + h_, P.INK, LW))
    out.append(line(x, top + h_ / 2, x + w_, top + h_ / 2, P.INK, LW))
    out.append(rect(x, top, w_, h_, 6, fill="none", stroke=P.INK, w=LW + .6))
    out.append(rr(x - 18, top + h_ + 8, w_ + 36, 14, 5, P.PAPER_DEEP))
    return "".join(out)


def doorway(room, cx, w_=150, h_=250, ink=None):
    x, y = cx - w_ / 2, room.floor - h_
    ink = ink or P.CARAMEL
    d = ("M%s %s L%s %s Q%s %s %s %s L%s %s Z" % (
        n(x), n(room.floor), n(x), n(y + w_ / 2),
        n(cx), n(y - 14), n(x + w_), n(y + w_ / 2),
        n(x + w_), n(room.floor)))
    return "".join([
        solid(d, P.PAPER_DEEP),
        path(d, fill=P.INK, opacity=0.13),
        o(d, 3.2, ink),
    ])


def shelf(room, cx, y, w_=230, jars=5, seed="sh"):
    r = rng(seed)
    x = cx - w_ / 2
    out = []
    for i in range(jars):
        jw = w_ / jars * r.uniform(0.44, 0.66)
        jh = r.uniform(30, 54)
        jx = x + w_ * (i + .5) / jars - jw / 2
        col = r.choice([P.JAM, P.TEAL, P.BUTTER, P.ROSE, P.SAGE, P.PUMPKIN,
                        P.PLUM])
        out.append(rr(jx, y - jh, jw, jh, 5, col))
        out.append(rect(jx - 2, y - jh - 7, jw + 4, 8, 3, fill=P.CARAMEL))
        out.append(rect(jx - 2, y - jh - 7, jw + 4, 8, 3, fill="none",
                        stroke=P.INK, w=LW_F))
    out.append(rr(x - 8, y, w_ + 16, 11, 4, P.CARAMEL))
    for bx in (x + 14, x + w_ - 14):
        out.append(rect(bx - 4, y + 11, 8, 16, 3, fill=P.CARAMEL))
        out.append(rect(bx - 4, y + 11, 8, 16, 3, fill="none", stroke=P.INK,
                        w=LW_F))
    return "".join(out)


def picture(room, cx, cy, w_=80, h_=64, ink=None):
    ink = ink or P.JAM
    return (rr(cx - w_ / 2, cy - h_ / 2, w_, h_, 5, P.PAPER_PALE) +
            rr(cx - w_ / 2 + 8, cy - h_ / 2 + 8, w_ - 16, h_ - 16, 3, ink, False) +
            path("M%s %s q%s %s %s %s" % (n(cx - w_ / 2 + 10), n(cy + h_ / 2 - 12),
                                          n(w_ * .3), n(-h_ * .4), n(w_ - 20), n(0)),
                 fill=P.PAPER_PALE, opacity=0.5))


def clock(room, cx, cy, r_=30):
    return "".join([
        circle(cx, cy, r_, fill=P.PAPER_PALE),
        circle(cx, cy, r_, fill="none", stroke=P.INK, w=LW),
        line(cx, cy, cx, cy - r_ * .6, P.INK, 2.6),
        line(cx, cy, cx + r_ * .42, cy + r_ * .2, P.INK, 2.6),
        circle(cx, cy, 3, fill=P.INK),
    ])


def bunting(room, x0, x1, y, flags=9, sag=34):
    out = [path("M%s %s Q%s %s %s %s" % (n(x0), n(y), n((x0 + x1) / 2),
                                         n(y + sag), n(x1), n(y)),
                stroke=P.INK, w=1.8, fill="none")]
    cols = [P.JAM, P.TEAL, P.BUTTER, P.ROSE, P.SAGE]
    for i in range(1, flags):
        t = i / float(flags)
        mx, my = (x0 + x1) / 2, y + sag
        px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1
        py = (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * y
        d = "M%s %s L%s %s L%s %s Z" % (n(px - 12), n(py), n(px + 12), n(py),
                                        n(px), n(py + 28))
        out.append(solid(d, cols[i % len(cols)], True, LW_F))
    return "".join(out)


def pendant(room, cx, drop=140, ink=None, glow_r=190):
    """A hanging lamp and the warm pool it throws. The one light source, and
    the thing the whole direction is named after."""
    ink = ink or P.JAM
    y = room.y + drop
    out = [line(cx, room.y, cx, y, P.INK, 2.0)]
    shade = ("M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z" % (
        n(cx - 54), n(y + 40), n(cx - 46), n(y - 4), n(cx), n(y - 8),
        n(cx), n(y - 8), n(cx + 46), n(y - 4), n(cx + 54), n(y + 40)))
    out.append(solid(shade, ink))
    out.append(ellipse(cx, y + 40, 54, 11, fill=P.GLOW_SOFT))
    out.append(ellipse(cx, y + 40, 54, 11, fill="none", stroke=P.INK, w=LW))
    out.append(circle(cx, y + 46, 13, fill=P.GLOW))
    return "".join(out), glow_cone(cx, y + 44, glow_r, room.floor)


def glow_cone(cx, cy, r_, floor_y):
    """A soft cone of lamplight reaching the floor, plus the pool it makes."""
    out = ['<radialGradient id="lg%d" cx="50%%" cy="50%%">'
           '<stop offset="0%%" stop-color="%s" stop-opacity=".85"/>'
           '<stop offset="60%%" stop-color="%s" stop-opacity=".30"/>'
           '<stop offset="100%%" stop-color="%s" stop-opacity="0"/>'
           '</radialGradient>' % (int(cx), P.GLOW, P.GLOW, P.GLOW)]
    defs = "<defs>" + "".join(out) + "</defs>"
    body = "".join([
        path("M%s %s L%s %s L%s %s Z" % (
            n(cx - 26), n(cy), n(cx - r_ * 1.05), n(floor_y),
            n(cx + r_ * 1.05), n(floor_y)),
            fill=P.GLOW, opacity=0.20),
        circle(cx, cy, r_ * 0.9, fill="url(#lg%d)" % int(cx)),
        ellipse(cx, floor_y + 16, r_ * 0.95, 22, fill=P.GLOW, opacity=0.28),
    ])
    return defs + body


# -------------------------------------------------------------- furniture

def counter(room, cx, w_=300, h_=120, ink=None, top_ink=None, doors=2):
    ink = ink or P.TEAL
    x = cx - w_ / 2
    y = room.floor - h_
    out = [shadow_under(cx, room.floor + 8, w_ * 1.02),
           rr(x, y, w_, h_, 8, ink)]
    for i in range(doors):
        dw = (w_ - 26) / doors - 10
        dx = x + 13 + i * ((w_ - 26) / doors) + 5
        out.append(rr(dx, y + 26, dw, h_ - 40, 6, P.PAPER_DEEP, True, LW_F))
        out.append(circle(dx + dw - 14, y + 26 + (h_ - 40) / 2, 4.5, fill=P.INK))
    out.append(rr(x - 10, y - 18, w_ + 20, 20, 7, top_ink or P.PAPER_DEEP))
    return "".join(out)


def display_case(room, cx, w_=340, h_=210):
    """The glass case: an open front so what's inside stays readable."""
    x = cx - w_ / 2
    base_h = 92
    y = room.floor - h_
    out = [shadow_under(cx, room.floor + 8, w_ * 1.02),
           rr(x, room.floor - base_h, w_, base_h, 8, P.JAM)]
    out.append(rr(x - 8, y, w_ + 16, h_ - base_h + 6, 8, P.SKY, False))
    out.append(rect(x - 8, y, w_ + 16, h_ - base_h + 6, 8, fill=P.WHITE,
                    opacity=0.45))
    mid = y + (h_ - base_h) * 0.52
    out.append(rr(x - 4, mid, w_ + 8, 10, 4, P.PAPER_DEEP))
    out.append(rect(x - 8, y, w_ + 16, h_ - base_h + 6, 8, fill="none",
                    stroke=P.INK, w=LW + .6))
    out.append(path("M%s %s l%s %s" % (n(x + 16), n(y + 76), n(44), n(-56)),
                    stroke=P.WHITE, w=7, opacity=0.5))
    out.append(rr(x - 12, room.floor - base_h - 16, w_ + 24, 18, 7, P.PAPER_DEEP))
    return "".join(out), [(x + 26 + i * (w_ - 52) / 3.0, mid) for i in range(4)], \
        [(x + 26 + i * (w_ - 52) / 3.0, room.floor - base_h - 16) for i in range(4)]


def oven(room, cx, w_=180, h_=190):
    x, y = cx - w_ / 2, room.floor - h_
    dcy = y + h_ * 0.60
    dr = w_ * 0.30
    out = [shadow_under(cx, room.floor + 8, w_ * 1.05),
           rr(x, y, w_, h_, 10, P.DUSK),
           rr(x + 12, y + h_ * 0.30, w_ - 24, h_ * 0.62, 9, P.INK, False)]
    # the glowing window
    out += [circle(cx, dcy, dr + 6, fill=P.CARAMEL),
            circle(cx, dcy, dr, fill=P.EMBER),
            circle(cx, dcy, dr * 0.66, fill=P.GLOW),
            circle(cx, dcy, dr * 0.30, fill=P.GLOW_SOFT),
            circle(cx, dcy, dr + 6, fill="none", stroke=P.INK, w=LW),
            circle(cx, dcy, dr, fill="none", stroke=P.INK, w=LW_F)]
    out.append(rr(x + 12, y + h_ * 0.30, w_ - 24, h_ * 0.62, 9, "none", True, LW))
    out.append(rr(x + 6, y + h_ * 0.22, w_ - 12, 13, 6, P.PAPER_DEEP))
    for i in range(3):
        out.append(circle(x + w_ * (0.28 + i * 0.22), y + 28, 9, fill=P.JAM))
        out.append(circle(x + w_ * (0.28 + i * 0.22), y + 28, 9, fill="none",
                          stroke=P.INK, w=LW_F))
    out.append(rr(x, y, w_, h_, 10, "none", True, LW + .6))
    return "".join(out)


def table(room, cx, w_=230, h_=110, ink=None, base=None):
    ink = ink or P.CARAMEL
    b = room.floor if base is None else base
    x, y = cx - w_ / 2, b - h_
    out = [shadow_under(cx, b + 6, w_ * 0.95)]
    for lx in (x + 18, x + w_ - 18):
        out.append(rr(lx - 8, y + 16, 16, h_ - 16, 6, ink))
    out.append(rr(x, y, w_, 20, 8, ink))
    return "".join(out)


def chair(room, cx, h_=130, ink=None, flip=False, base=None):
    ink = ink or P.SAGE
    b = room.floor if base is None else base
    w_ = 66
    x, seat = cx - w_ / 2, b - h_ * 0.46
    bx = x + (w_ - 14 if flip else 0)
    out = [shadow_under(cx, b + 5, w_ * 1.1),
           rr(bx, b - h_, 14, h_ - h_ * 0.46 + 10, 6, ink)]
    for lx in (x + 6, x + w_ - 12):
        out.append(rr(lx, seat, 12, b - seat, 5, ink))
    out.append(rr(x - 4, seat - 14, w_ + 8, 17, 7, ink))
    return "".join(out)


def stool(room, cx, h_=86, ink=None):
    ink = ink or P.BUTTER
    return "".join([
        shadow_under(cx, room.floor + 5, 74),
        rr(cx - 9, room.floor - h_, 18, h_, 7, P.CARAMEL),
        ellipse(cx, room.floor - h_, 38, 11, fill=ink),
        ellipse(cx, room.floor - h_, 38, 11, fill="none", stroke=P.INK, w=LW),
    ])


def rug(room, cx, w_=420, ink=None):
    ink = ink or P.ROSE
    y = room.floor + room.floor_h * 0.42
    out = [ellipse(cx, y, w_ / 2, w_ * 0.085, fill=ink),
           ellipse(cx, y, w_ / 2, w_ * 0.085, fill="none", stroke=P.INK, w=LW),
           ellipse(cx, y, w_ / 2.6, w_ * 0.066, fill="none", stroke=P.INK,
                   w=LW_F, opacity=0.5),
           ellipse(cx, y, w_ / 4.2, w_ * 0.043, fill=P.PAPER_PALE, opacity=0.4)]
    return "".join(out)


def plant(room, cx, big=False):
    ph = 62 if big else 44
    pw = 56 if big else 40
    out = [shadow_under(cx, room.floor + 6, pw * 1.5),
           path("M%s %s L%s %s L%s %s L%s %s Z" % (
               n(cx - pw / 2), n(room.floor - ph), n(cx + pw / 2),
               n(room.floor - ph), n(cx + pw / 2 - 7), n(room.floor),
               n(cx - pw / 2 + 7), n(room.floor)), fill=P.PUMPKIN),
           path("M%s %s L%s %s L%s %s L%s %s Z" % (
               n(cx - pw / 2), n(room.floor - ph), n(cx + pw / 2),
               n(room.floor - ph), n(cx + pw / 2 - 7), n(room.floor),
               n(cx - pw / 2 + 7), n(room.floor)), fill="none", stroke=P.INK,
               w=LW),
           rr(cx - pw / 2 - 5, room.floor - ph - 12, pw + 10, 14, 5, P.CARAMEL)]
    r = rng("pl%d" % int(cx))
    base = room.floor - ph - 10
    k = 9 if big else 6
    for i in range(k):
        a = -math.pi / 2 + (i - k / 2.0) * 0.36 + r.uniform(-.08, .08)
        ln = (108 if big else 74) * r.uniform(0.7, 1.15)
        ex, ey = cx + math.cos(a) * ln, base + math.sin(a) * ln
        out.append(path("M%s %s Q%s %s %s %s" % (
            n(cx), n(base), n((cx + ex) / 2 - math.cos(a) * 16),
            n((base + ey) / 2), n(ex), n(ey)),
            stroke=P.GREEN, w=3.2, fill="none", stroke_linecap="round"))
        out.append(leaf(ex, ey, 26, 15, P.SAGE if i % 2 else P.GREEN,
                        math.degrees(a) + 90))
    return "".join(out)


def mixing_bowl(room, cx, on_y, scale=1.0):
    w_ = 150 * scale
    out = [ellipse(cx, on_y + 4, w_ * 0.42, 9, fill=P.SHADOW_HEX, opacity=0.14)]
    d = ("M%s %s A%s %s 0 0 0 %s %s Z" % (
        n(cx - w_ / 2), n(on_y - w_ * 0.30),
        n(w_ / 2), n(w_ * 0.46),
        n(cx + w_ / 2), n(on_y - w_ * 0.30)))
    out.append(solid(d, P.TEAL))
    out.append(ellipse(cx, on_y - w_ * 0.30, w_ / 2, w_ * 0.13, fill=P.PAPER_PALE))
    out.append(ellipse(cx, on_y - w_ * 0.30, w_ / 2, w_ * 0.13, fill="none",
                       stroke=P.INK, w=LW))
    out.append(ellipse(cx, on_y - w_ * 0.30, w_ * 0.36, w_ * 0.085,
                       fill=P.DOUGH))
    out.append(line(cx + w_ * 0.16, on_y - w_ * 0.34, cx + w_ * 0.36,
                    on_y - w_ * 0.62, P.CARAMEL, 8))
    out.append(ellipse(cx + w_ * 0.37, on_y - w_ * 0.63, 11, 8,
                       fill=P.CARAMEL, transform='rotate(-38 %s %s)'
                       % (n(cx + w_ * 0.37), n(on_y - w_ * 0.63))))
    return "".join(out)


def cooling_rack(room, cx, on_y, w_=180):
    """A wire rack on little feet. Drawn with visible legs and a shadow so it
    reads as a rack rather than a scratch on the counter."""
    x = cx - w_ / 2
    out = [ellipse(cx, on_y + 3, w_ * 0.46, 6, fill=P.SHADOW_HEX, opacity=0.12)]
    for lx in (x + 8, x + w_ - 8):
        out.append(rect(lx - 3, on_y - 12, 6, 12, 2, fill=P.CARAMEL))
    out.append(rr(x, on_y - 20, w_, 11, 5, P.PAPER_DEEP))
    for i in range(1, 8):
        gx = x + w_ * i / 8.0
        out.append(line(gx, on_y - 19, gx, on_y - 10, P.INK, 1.6,
                        opacity="0.55"))
    return "".join(out)


def stairs(room, x, w_=150, up=True):
    """Stairs off the top of the room -- the visual cue that this is a house
    with floors above, which is most of why the elevation reads as a dollhouse."""
    out = []
    steps = 5
    sh = (room.floor - room.y - 40) / steps
    for i in range(steps):
        sw = w_ * (1 - i * 0.06)
        sx = x if up else x - sw
        out.append(rr(sx, room.floor - (i + 1) * sh, sw, sh + 3, 4,
                      P.CARAMEL if i % 2 else P.CRUST))
    return "".join(out)


def sign(room, cx, cy, w_=230, h_=76, label="BAKERY"):
    return "".join([
        rr(cx - w_ / 2, cy - h_ / 2, w_, h_, 12, P.PAPER_PALE),
        rr(cx - w_ / 2 + 9, cy - h_ / 2 + 9, w_ - 18, h_ - 18, 8, "none", True,
           LW_F),
        text(cx, cy + 9, label, 27, P.JAM),
    ])


def chalk_board(room, cx, w_=150, h_=200):
    x, y = cx - w_ / 2, room.floor - h_
    return "".join([
        shadow_under(cx, room.floor + 6, w_ * 1.2),
        line(x + 16, y + h_ * .3, x - 6, room.floor, P.CARAMEL, 9),
        line(x + w_ - 16, y + h_ * .3, x + w_ + 6, room.floor, P.CARAMEL, 9),
        rr(x, y, w_, h_ * 0.72, 8, P.PLUM),
        rr(x + 12, y + 12, w_ - 24, h_ * 0.72 - 24, 5, P.INK, False),
        line(x + 28, y + 42, x + w_ - 28, y + 42, P.PAPER_PALE, 3.4,
             opacity="0.8"),
        line(x + 28, y + 66, x + w_ - 40, y + 66, P.PAPER_PALE, 3.4,
             opacity="0.8"),
        line(x + 28, y + 90, x + w_ - 32, y + 90, P.PAPER_PALE, 3.4,
             opacity="0.8"),
    ])


def bed(room, cx, w_=300):
    h_ = 110
    x, y = cx - w_ / 2, room.floor - h_
    return "".join([
        shadow_under(cx, room.floor + 6, w_),
        rr(x, y + 30, w_, h_ - 30, 8, P.PLUM),
        rr(x - 8, y, 26, h_, 8, P.PLUM),
        rr(x + w_ - 18, y + 26, 26, h_ - 26, 8, P.PLUM),
        rr(x + 16, y + 34, w_ - 40, 34, 10, P.TEAL),
        rr(x + 24, y + 22, 84, 30, 12, P.PAPER_PALE),
    ])


def bookshelf(room, cx, w_=160, h_=240, seed="bs"):
    r = rng(seed)
    x, y = cx - w_ / 2, room.floor - h_
    out = [shadow_under(cx, room.floor + 6, w_ * 1.1),
           rr(x, y, w_, h_, 7, P.CARAMEL)]
    rows = 4
    for i in range(rows):
        sy = y + 12 + i * (h_ - 20) / rows
        bh = (h_ - 20) / rows - 12
        bx = x + 12
        while bx < x + w_ - 22:
            bw = r.uniform(11, 20)
            out.append(rect(bx, sy + bh - r.uniform(bh * .6, bh), bw,
                            r.uniform(bh * .6, bh), 2,
                            fill=r.choice([P.JAM, P.TEAL, P.BUTTER, P.SAGE,
                                           P.PLUM, P.ROSE])))
            bx += bw + 2.5
        out.append(rr(x + 6, sy + bh, w_ - 12, 8, 3, P.CRUST, True, LW_F))
    out.append(rr(x, y, w_, h_, 7, "none", True, LW))
    return "".join(out)


def svg_open(w, h, bg=None):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
            'width="%d" height="%d">'
            '<rect width="%d" height="%d" fill="%s"/>' % (
                w, h, w, h, w, h, bg or P.PAPER))


def svg_close():
    return "</svg>"


def apron_rail(room, cx, y, w_=210, n_=3):
    """A rail of aprons and cloths. Big blank walls are the main weakness of
    elevation rooms; a rail fixes one for about twenty lines."""
    x = cx - w_ / 2
    out = [rr(x, y, w_, 9, 4, P.CARAMEL)]
    cols = [P.ROSE, P.TEAL, P.BUTTER, P.SAGE, P.PLUM]
    for i in range(n_):
        ax = x + w_ * (i + .5) / n_
        ah = 66 + (i % 2) * 14
        out.append(line(ax - 13, y + 8, ax - 7, y + 26, P.INK, 2.0))
        out.append(line(ax + 13, y + 8, ax + 7, y + 26, P.INK, 2.0))
        d = ("M%s %s L%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z" % (
            n(ax - 7), n(y + 24), n(ax + 7), n(y + 24),
            n(ax + 24), n(y + 34), n(ax + 22), n(y + ah),
            n(ax - 22), n(y + ah), n(ax - 24), n(y + 34),
            n(ax - 7), n(y + 24)))
        out.append(solid(d, cols[i % len(cols)]))
        out.append(line(ax - 16, y + ah - 22, ax + 16, y + ah - 22, P.INK,
                        1.5, opacity="0.35"))
    return "".join(out)
