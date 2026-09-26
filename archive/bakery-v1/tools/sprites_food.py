"""Ingredients, doughs, baked goods and toppings.

Every function returns the inner markup of a 100x100 <symbol>. Objects sit on
the baseline around y=86 so they line up when placed on a shelf or a table.
"""

import math

import palette as P
from draw import (arc, berry, blob, circle, closed_spline, contact_shadow,
                  drip_top, ellipse, g, heart, highlight, leaf, line, n,
                  open_spline, path, rect, rng, shade, sparkle,
                  sprinkle_scatter, steam, text)

OUT = P.INK_SOFT          # outline colour for food
LW = 1.6                  # outline weight


def _o(d, **kw):
    """Outline-only overlay path."""
    return path(d, fill="none", stroke=OUT, w=LW, stroke_linejoin="round", **kw)


# ============================================================== ingredients

def flour():
    body = "M30 84 L26 40 Q25 33 32 31 L68 31 Q75 33 74 40 L70 84 Z"
    return "".join([
        contact_shadow(50, 86, 26),
        path(body, fill=P.CREAM),
        path(body, fill="none", stroke=OUT, w=LW),
        path("M32 31 Q40 24 50 27 Q60 24 68 31 Q60 36 50 33 Q40 36 32 31 Z",
             fill=P.PAPER_DEEP),
        path("M32 31 Q40 24 50 27 Q60 24 68 31", fill="none", stroke=OUT, w=LW),
        ellipse(50, 58, 15, 12, fill=P.PAPER_WARM, opacity=0.9),
        text(50, 62, "flour", 11, P.CARAMEL),
        sprinkle_scatter(50, 88, 20, 3, "flourdust", 7, [P.WHITE, P.PAPER_WARM]),
    ])


def sugar():
    jar = "M32 82 L30 44 Q30 40 34 40 L66 40 Q70 40 70 44 L68 82 Q68 86 63 86 L37 86 Q32 86 32 82 Z"
    return "".join([
        contact_shadow(50, 88, 24),
        path(jar, fill=P.SKY, opacity=0.30),
        path("M34 60 L66 60 L67 82 Q67 85 62 85 L38 85 Q33 85 33 82 Z",
             fill=P.WHITE),
        sprinkle_scatter(50, 72, 13, 8, "sugargrain", 12, [P.PAPER_DEEP, P.CREAM]),
        path(jar, fill="none", stroke=OUT, w=LW),
        rect(28, 30, 44, 12, 5, fill=P.JAM),
        rect(28, 30, 44, 12, 5, fill="none", stroke=OUT, w=LW),
        highlight(39, 56, 3.5, 16, 0, 0.5),
    ])


def butter():
    """A block on a dish with one pat cut off and leaning against it."""
    return "".join([
        contact_shadow(50, 84, 30),
        ellipse(50, 80, 32, 9, fill=P.WHITE),
        ellipse(50, 80, 32, 9, fill="none", stroke=OUT, w=LW),
        path("M24 74 L32 58 L76 58 L68 74 Z", fill=P.CRUST),
        path("M32 58 L40 44 L84 44 L76 58 Z", fill=P.BUTTER),
        path("M76 58 L84 44 L84 60 L76 74 Z", fill=P.CARAMEL),
        path("M24 74 L32 58 L40 44 L84 44 L84 60 L76 74 Z",
             fill="none", stroke=OUT, w=LW, stroke_linejoin="round"),
        line(32, 58, 76, 58, OUT, LW),
        line(76, 58, 84, 44, OUT, LW),
        g(path("M0 12 L5 2 L24 2 L19 12 Z", fill=P.BUTTER) +
          path("M19 12 L24 2 L24 8 L19 18 Z", fill=P.CARAMEL) +
          path("M0 12 L5 2 L24 2 L24 8 L19 18 Z", fill="none", stroke=OUT,
               w=LW, stroke_linejoin="round"),
          transform="translate(14 60) rotate(-8)"),
        ellipse(58, 50, 12, 3, fill=P.WHITE, opacity=0.35,
                transform="rotate(-18 58 50)"),
    ])


def egg():
    e = "M50 30 C64 30 72 46 72 60 C72 74 62 82 50 82 C38 82 28 74 28 60 C28 46 36 30 50 30 Z"
    return "".join([
        contact_shadow(50, 84, 22),
        path(e, fill=P.PAPER_WARM),
        path(e, fill="none", stroke=OUT, w=LW),
        highlight(42, 48, 7, 11, -20, 0.55),
        # a small second egg behind
        g(path(e, fill=P.CREAM) + path(e, fill="none", stroke=OUT, w=LW),
          transform="translate(20 54) scale(0.42) rotate(-18 50 56)",
          opacity="0.95"),
    ])


def milk():
    b = "M40 86 L40 48 Q40 42 45 38 L45 26 L55 26 L55 38 Q60 42 60 48 L60 86 Z"
    return "".join([
        contact_shadow(50, 88, 18),
        path("M41 86 L41 50 Q41 45 45 41 L45 27 L55 27 L55 41 Q59 45 59 50 L59 86 Z",
             fill=P.WHITE),
        path(b, fill=P.SKY, opacity=0.22),
        path(b, fill="none", stroke=OUT, w=LW, stroke_linejoin="round"),
        rect(42, 20, 16, 8, 3, fill=P.SKY),
        rect(42, 20, 16, 8, 3, fill="none", stroke=OUT, w=LW),
        highlight(45, 62, 2.6, 14, 0, 0.6),
    ])


def chocolate():
    sq = []
    for r_ in range(3):
        for c in range(3):
            if r_ == 0 and c == 2:
                continue
            sq.append(rect(30 + c * 14, 34 + r_ * 14, 12.5, 12.5, 2,
                           fill=P.COCOA if (r_ + c) % 2 else P.COCOA_DARK))
    return "".join([
        contact_shadow(50, 82, 26),
        rect(28, 32, 44, 44, 4, fill=P.COCOA_DARK),
        "".join(sq),
        rect(28, 32, 44, 44, 4, fill="none", stroke=OUT, w=LW),
        # broken-off piece
        g(rect(0, 0, 13, 13, 2, fill=P.COCOA) +
          rect(0, 0, 13, 13, 2, fill="none", stroke=OUT, w=LW),
          transform="translate(62 20) rotate(18)"),
        highlight(40, 40, 8, 3, -35, 0.22),
    ])


def strawberry():
    body = "M50 34 C64 34 74 46 74 58 C74 72 62 86 50 86 C38 86 26 72 26 58 C26 46 36 34 50 34 Z"
    seeds = "".join(
        ellipse(50 + math.cos(i * 1.9) * (17 - i * .6),
                48 + (i % 5) * 7.5, 1.5, 2.2, fill=P.LEMON,
                transform="rotate(%s)" % n(i * 20))
        for i in range(11))
    return "".join([
        contact_shadow(50, 88, 22),
        path(body, fill=P.JAM),
        path(body, fill="none", stroke=OUT, w=LW),
        seeds,
        path("M50 36 L50 22", stroke=P.GREEN_DEEP, w=2.4, stroke_linecap="round"),
        leaf(38, 32, 18, 9, P.GREEN, -18),
        leaf(62, 32, 18, 9, P.GREEN, 18),
        leaf(50, 28, 16, 9, P.SAGE, 0),
        highlight(40, 48, 5, 8, -25, 0.30),
    ])


def blueberry():
    return "".join([
        contact_shadow(50, 84, 24),
        berry(38, 64, 15, P.BERRY, "bb1", False),
        berry(64, 68, 13, "#6E4A6B", "bb2", False),
        berry(52, 46, 16, P.PLUM, "bb3", False),
        "".join(line(52 + math.cos(a) * 4, 42 + math.sin(a) * 3,
                     52 + math.cos(a) * 7, 40 + math.sin(a) * 5,
                     P.BERRY, 1.4) for a in (0.4, 1.4, 2.4, 3.4, 4.4)),
    ])


def apple():
    body = blob(50, 58, 25, 24, "apple", 11, 1.4)
    return "".join([
        contact_shadow(50, 84, 23),
        path(body, fill=P.CHERRY),
        path("M50 34 C58 34 70 42 70 58 C70 72 60 82 50 82 C58 74 60 64 58 56 C56 46 52 38 50 34 Z",
             fill=P.SHADOW_HEX, opacity=0.10),
        path(body, fill="none", stroke=OUT, w=LW),
        path("M50 38 C50 30 52 26 56 22", stroke=P.COCOA, w=2.6,
             stroke_linecap="round"),
        leaf(63, 26, 20, 11, P.GREEN, 24),
        highlight(40, 46, 6, 10, -28, 0.42),
    ])


def lemon():
    body = "M24 58 C24 46 36 38 50 38 C64 38 76 46 76 58 C76 70 64 78 50 78 C36 78 24 70 24 58 Z"
    return "".join([
        contact_shadow(50, 80, 24),
        path(body, fill=P.LEMON),
        path("M22 58 Q19 56 21 52 Q24 54 24 58 Z", fill=P.BUTTER),
        path("M78 58 Q81 60 79 64 Q76 62 76 58 Z", fill=P.BUTTER),
        path(body, fill="none", stroke=OUT, w=LW),
        leaf(66, 36, 18, 10, P.GREEN, -28),
        highlight(40, 48, 8, 4, -18, 0.45),
        sprinkle_scatter(50, 58, 18, 10, "lemonpore", 6, [P.CRUST]),
    ])


def honey():
    jar = "M30 84 Q28 60 32 46 L68 46 Q72 60 70 84 Q70 87 66 87 L34 87 Q30 87 30 84 Z"
    return "".join([
        contact_shadow(50, 88, 24),
        path(jar, fill=P.BUTTER),
        path("M31 66 Q50 62 69 66 Q71 78 70 84 Q70 87 66 87 L34 87 Q30 87 30 84 Q29 76 31 66 Z",
             fill=P.CRUST, opacity=0.55),
        path(jar, fill="none", stroke=OUT, w=LW),
        rect(28, 38, 44, 10, 4, fill=P.CARAMEL),
        rect(28, 38, 44, 10, 4, fill="none", stroke=OUT, w=LW),
        # dipper
        g(rect(-1.6, 0, 3.2, 26, 1.6, fill=P.CRUST) +
          "".join(ellipse(0, 26 + i * 4, 6 - i * 0.6, 2.6, fill=P.CRUST)
                  for i in range(4)) +
          rect(-1.6, 0, 3.2, 40, 1.6, fill="none", stroke=OUT, w=1.1),
          transform="translate(74 22) rotate(16)"),
        highlight(38, 58, 3, 9, 0, 0.35),
    ])


def cinnamon():
    def stick(x, y, rot):
        return g(rect(0, 0, 9, 40, 4, fill=P.CARAMEL) +
                 rect(2.4, 0, 4.2, 40, 2, fill=P.COCOA, opacity=0.5) +
                 rect(0, 0, 9, 40, 4, fill="none", stroke=OUT, w=LW) +
                 ellipse(4.5, 0.5, 4.5, 2.2, fill=P.CRUST) +
                 ellipse(4.5, 0.5, 4.5, 2.2, fill="none", stroke=OUT, w=1.1),
                 transform="translate(%s %s) rotate(%s)" % (n(x), n(y), n(rot)))
    star = "".join(
        ellipse(50 + math.cos(i * math.tau / 8 - 1.57) * 9,
                76 + math.sin(i * math.tau / 8 - 1.57) * 9, 4.6, 3.2,
                fill=P.COCOA,
                transform="rotate(%s 50 76)" % n(i * 45)) for i in range(8))
    return "".join([
        contact_shadow(50, 86, 26),
        stick(30, 34, -8), stick(44, 30, 6),
        g(star + circle(50, 76, 3.4, fill=P.COCOA_DARK),
          transform="translate(14 0) scale(0.9)"),
    ])


def sprinkles_jar():
    jar = "M34 84 L32 40 Q32 36 36 36 L64 36 Q68 36 68 40 L66 84 Q66 87 62 87 L38 87 Q34 87 34 84 Z"
    return "".join([
        contact_shadow(50, 88, 22),
        path(jar, fill=P.WHITE, opacity=0.85),
        path("M34 56 L66 56 L66 84 Q66 87 62 87 L38 87 Q34 87 34 84 Z",
             fill=P.PAPER_WARM),
        sprinkle_scatter(50, 72, 13, 12, "jarsprink", 18),
        path(jar, fill="none", stroke=OUT, w=LW),
        rect(31, 26, 38, 11, 4, fill=P.ROSE),
        rect(31, 26, 38, 11, 4, fill="none", stroke=OUT, w=LW),
        sprinkle_scatter(78, 82, 8, 5, "spill", 5),
    ])


def vanilla():
    b = "M42 86 L42 46 Q42 40 46 36 L46 28 L54 28 L54 36 Q58 40 58 46 L58 86 Z"
    return "".join([
        contact_shadow(50, 88, 16),
        path(b, fill=P.COCOA, opacity=0.75),
        path(b, fill="none", stroke=OUT, w=LW, stroke_linejoin="round"),
        rect(43, 22, 14, 7, 3, fill=P.CRUST),
        rect(43, 22, 14, 7, 3, fill="none", stroke=OUT, w=LW),
        rect(38, 56, 24, 16, 2, fill=P.PAPER_WARM),
        text(50, 67, "vanilla", 7, P.CARAMEL),
        g(path("M0 0 C6 6 6 22 2 30", stroke=P.COCOA_DARK, w=3.4,
               fill="none", stroke_linecap="round"),
          transform="translate(70 52)"),
    ])


def pumpkin():
    out = [contact_shadow(50, 84, 28)]
    for i, (dx, rx, col) in enumerate([(-15, 11, P.CRUST), (15, 11, P.CRUST),
                                       (-7, 13, P.PUMPKIN), (7, 13, P.PUMPKIN),
                                       (0, 15, "#EE9E5E")]):
        out.append(ellipse(50 + dx, 60, rx, 22, fill=col))
    out.append(path("M23 60 C23 44 34 38 50 38 C66 38 77 44 77 60 C77 76 66 82 50 82 C34 82 23 76 23 60 Z",
                    fill="none", stroke=OUT, w=LW))
    out.append(path("M50 38 C50 30 47 26 43 22 C49 23 53 27 54 32", fill=P.GREEN))
    out.append(path("M50 38 L50 30", stroke=P.GREEN_DEEP, w=4, stroke_linecap="round"))
    out.append(highlight(38, 50, 5, 9, -25, 0.25))
    return "".join(out)


def cheese():
    return "".join([
        contact_shadow(50, 82, 26),
        path("M22 76 L22 52 L78 40 L78 64 Z", fill=P.CRUST),
        path("M22 52 L78 40 L64 34 L22 44 Z", fill=P.BUTTER),
        path("M22 76 L22 44 L64 34 L78 40 L78 64 Z", fill="none",
             stroke=OUT, w=LW, stroke_linejoin="round"),
        line(22, 52, 78, 40, OUT, LW),
        circle(36, 62, 4, fill=P.PAPER_DEEP),
        circle(54, 56, 5, fill=P.PAPER_DEEP),
        circle(66, 54, 3, fill=P.PAPER_DEEP),
    ])


# ================================================================== doughs

def _parchment(inner):
    """Doughs sit on a parchment square so they read as 'ready for the oven'."""
    return "".join([
        contact_shadow(50, 84, 30),
        path("M18 80 L20 56 L80 56 L82 80 Q82 83 78 83 L22 83 Q18 83 18 80 Z",
             fill=P.PAPER_WARM),
        path("M18 80 L20 56 L80 56 L82 80 Q82 83 78 83 L22 83 Q18 83 18 80 Z",
             fill="none", stroke=OUT, w=1.2, opacity=0.6),
        inner,
    ])


def dough_bread():
    b = blob(50, 52, 24, 20, "dbread", 10, 1.6)
    return _parchment("".join([
        path(b, fill=P.DOUGH),
        path(b, fill="none", stroke=OUT, w=LW),
        highlight(41, 43, 8, 5, -25, 0.5),
        sprinkle_scatter(50, 70, 22, 4, "flourdust2", 6, [P.WHITE]),
    ]))


def dough_cookie():
    out = []
    for i, (x, y, r_) in enumerate([(36, 56, 12), (60, 52, 13), (48, 40, 10)]):
        out.append(path(blob(x, y, r_, r_ * 0.85, "dc%d" % i, 9, 1.4),
                        fill=P.DOUGH_DEEP))
        out.append(path(blob(x, y, r_, r_ * 0.85, "dc%d" % i, 9, 1.4),
                        fill="none", stroke=OUT, w=1.3))
    out.append(sprinkle_scatter(50, 50, 20, 12, "chips", 9,
                                [P.COCOA_DARK, P.COCOA]))
    return _parchment("".join(out))


def dough_cake():
    tin = "M26 40 L30 74 Q30 78 36 78 L64 78 Q70 78 70 74 L74 40 Z"
    return "".join([
        contact_shadow(50, 80, 28),
        path(tin, fill=P.PAPER_DEEP),
        path("M28 48 Q50 54 72 48 L69 74 Q69 78 64 78 L36 78 Q31 78 31 74 Z",
             fill=P.BUTTER),
        ellipse(50, 47, 22, 6, fill="#F6D492"),
        path(tin, fill="none", stroke=OUT, w=LW),
        ellipse(50, 41, 24, 6.5, fill="none", stroke=OUT, w=LW),
        highlight(40, 60, 4, 8, -10, 0.30),
    ])


def dough_pastry():
    out = []
    for i in range(4):
        out.append(rect(24, 44 + i * 9, 52, 9, 2,
                        fill=P.DOUGH if i % 2 else P.DOUGH_DEEP))
    out.append(rect(24, 44, 52, 36, 3, fill="none", stroke=OUT, w=LW))
    for i in range(1, 4):
        out.append(line(24, 44 + i * 9, 76, 44 + i * 9, OUT, 1.0))
    return _parchment("".join(out))


def dough_pie():
    d = blob(50, 58, 28, 22, "dpie", 12, 1.2)
    return _parchment("".join([
        path(d, fill=P.DOUGH),
        path(d, fill="none", stroke=OUT, w=LW),
        "".join(line(50, 58, 50 + math.cos(a) * 24, 58 + math.sin(a) * 18,
                     P.DOUGH_DEEP, 1.2, opacity=0.7)
                for a in [i * 0.9 for i in range(7)]),
        highlight(40, 48, 9, 5, -20, 0.45),
    ]))


def dough_mystery():
    d = blob(50, 54, 24, 20, "dmyst", 13, 3.2)
    return _parchment("".join([
        path(d, fill=P.PLUM),
        path(d, fill="none", stroke=OUT, w=LW),
        sparkle(30, 38, 7, P.GLOW), sparkle(72, 44, 5, P.ROSE),
        sparkle(62, 30, 4, P.SKY),
        circle(43, 52, 3.4, fill=P.WHITE, opacity=0.8),
        circle(58, 55, 3.4, fill=P.WHITE, opacity=0.8),
        circle(43.8, 52.6, 1.6, fill=P.INK), circle(58.8, 55.6, 1.6, fill=P.INK),
        path("M45 63 Q50 68 56 63", stroke=P.INK, w=1.6, fill="none",
             stroke_linecap="round"),
    ]))


# ============================================================= baked goods

def bake_bread():
    b = "M20 74 C18 56 28 40 50 40 C72 40 82 56 80 74 Q80 78 74 78 L26 78 Q20 78 20 74 Z"
    return "".join([
        contact_shadow(50, 80, 32),
        path(b, fill=P.CRUST),
        path("M20 74 Q50 68 80 74 Q80 78 74 78 L26 78 Q20 78 20 74 Z",
             fill=P.DOUGH),
        path(b, fill="none", stroke=OUT, w=LW),
        "".join(path(arc(50, 76, 0, 0, 0) if False else
                     "M%s %s Q%s %s %s %s" % (n(30 + i * 13), n(46 + abs(i - 1) * 3),
                                              n(34 + i * 13), n(56),
                                              n(30 + i * 13 + 8), n(64)),
                     stroke=P.CARAMEL, w=2.2, fill="none", stroke_linecap="round")
                for i in range(3)),
        highlight(36, 50, 10, 5, -22, 0.28),
    ])


def bake_baguette():
    """A long stick laid on the diagonal, with the classic angled slashes.
    Drawn long and thin so it never gets confused with the round loaf."""
    body = ("M14 78 C10 70 14 62 24 56 L72 24 C82 18 90 20 92 28 "
            "C94 36 90 44 80 50 L32 82 C22 88 16 86 14 78 Z")
    out = [contact_shadow(52, 84, 34, 8),
           path(body, fill=P.CRUST),
           path(body, fill="none", stroke=OUT, w=LW, stroke_linejoin="round")]
    for i in range(4):
        cx = 30 + i * 15
        cy = 68 - i * 10.5
        out.append(path("M%s %s L%s %s" % (n(cx - 5), n(cy - 6), n(cx + 4), n(cy + 3)),
                        stroke=P.DOUGH, w=4.5, stroke_linecap="round"))
        out.append(path("M%s %s L%s %s" % (n(cx - 5), n(cy - 6), n(cx + 4), n(cy + 3)),
                        stroke=P.CARAMEL, w=1.4, stroke_linecap="round"))
    out.append(path("M20 68 L76 32", stroke=P.WHITE, w=3, opacity=0.22,
                    stroke_linecap="round"))
    return "".join(out)


def bake_croissant():
    """Five fat segments on a crescent, biggest in the middle, with two thin
    horns. Drawing it as segments rather than one outline is what makes it
    read as a croissant instead of a blob."""
    out = [contact_shadow(50, 78, 30)]
    segs = [(26, 62, 8.5, 9), (34, 52, 11, 12.5), (50, 47, 13, 14.5),
            (66, 52, 11, 12.5), (74, 62, 8.5, 9)]
    for i, (cx, cy, rx, ry) in enumerate(segs):
        d = blob(cx, cy, rx, ry, "cr%d" % i, 9, 0.9)
        out.append(path(d, fill=P.CRUST))
    for i, (cx, cy, rx, ry) in enumerate(segs):
        out.append(path(blob(cx, cy, rx, ry, "cr%d" % i, 9, 0.9),
                        fill="none", stroke=OUT, w=LW))
    # the two tapered horns
    for sx, ex, ey in ((26, 14, 74), (74, 86, 74)):
        out.append(path("M%s %s Q%s %s %s %s" % (n(sx), n(62), n(sx), n(72),
                                                 n(ex), n(ey)),
                        stroke=P.CRUST, w=7, fill="none", stroke_linecap="round"))
        out.append(path("M%s %s Q%s %s %s %s" % (n(sx), n(62), n(sx), n(72),
                                                 n(ex), n(ey)),
                        stroke=OUT, w=1.5, fill="none", stroke_linecap="round",
                        opacity=0.0))
    for i, (cx, cy, rx, ry) in enumerate(segs):
        out.append(ellipse(cx - rx * .28, cy - ry * .38, rx * .32, ry * .22,
                           fill=P.WHITE, opacity=0.34,
                           transform="rotate(-20 %s %s)" % (n(cx), n(cy))))
    return "".join(out)


def bake_cookie():
    d = blob(50, 56, 26, 24, "cookie", 12, 1.6)
    return "".join([
        contact_shadow(50, 82, 28),
        path(d, fill=P.CRUST),
        path(d, fill="none", stroke=OUT, w=LW),
        "".join(path(blob(x, y, 4.5, 3.8, "ch%d" % i, 7, .8), fill=P.COCOA_DARK)
                for i, (x, y) in enumerate([(40, 46), (58, 44), (46, 60),
                                            (62, 60), (36, 64), (52, 70)])),
        highlight(40, 44, 9, 4, -25, 0.25),
    ])


def bake_cupcake():
    wrap = "M30 58 L36 82 Q36 86 42 86 L58 86 Q64 86 64 82 L70 58 Z"
    return "".join([
        contact_shadow(50, 88, 24),
        path(wrap, fill=P.ROSE),
        "".join(line(34 + i * 6.5, 60, 36 + i * 6, 84, P.ROSE_DEEP, 1.6,
                     opacity=0.7) for i in range(6)),
        path(wrap, fill="none", stroke=OUT, w=LW),
        path("M28 58 C26 40 34 28 50 28 C66 28 74 40 72 58 Z", fill=P.WHITE),
        path("M28 58 C26 40 34 28 50 28 C66 28 74 40 72 58", fill="none",
             stroke=OUT, w=LW),
        circle(50, 24, 5, fill=P.CHERRY),
        circle(48.5, 22.5, 1.6, fill=P.WHITE, opacity=0.7),
        sprinkle_scatter(50, 44, 18, 12, "cupsprink", 10),
        highlight(38, 40, 6, 9, -20, 0.4),
    ])


def bake_cake():
    return "".join([
        contact_shadow(50, 86, 32),
        rect(22, 46, 56, 34, 4, fill=P.BUTTER),
        rect(22, 58, 56, 7, 1, fill=P.JAM),
        rect(22, 46, 56, 34, 4, fill="none", stroke=OUT, w=LW),
        drip_top(50, 48, 56, "cakedrip", P.ROSE, 8, 6),
        ellipse(50, 44, 28, 7, fill=P.ROSE),
        ellipse(50, 44, 28, 7, fill="none", stroke=OUT, w=LW),
        "".join(circle(34 + i * 11, 40, 3.2, fill=P.CHERRY) for i in range(3)),
        sprinkle_scatter(50, 44, 22, 4, "cakesprink", 8),
        highlight(32, 60, 4, 10, 0, 0.22),
    ])


def bake_pie():
    return "".join([
        contact_shadow(50, 84, 32),
        path("M18 62 L22 78 Q22 82 30 82 L70 82 Q78 82 78 78 L82 62 Z",
             fill=P.CRUST),
        ellipse(50, 60, 32, 10, fill=P.DOUGH_DEEP),
        ellipse(50, 58, 27, 8, fill=P.JAM),
        "".join(g(rect(-2, -9, 4, 18, 2, fill=P.DOUGH),
                  transform="translate(%s 58) rotate(%s)" % (n(36 + i * 7), n(i * 30 - 40)))
                for i in range(5)),
        ellipse(50, 60, 32, 10, fill="none", stroke=OUT, w=LW),
        path("M18 62 L22 78 Q22 82 30 82 L70 82 Q78 82 78 78 L82 62",
             fill="none", stroke=OUT, w=LW),
        steam(50, 50, 16, "piesteam", P.WHITE, 0.45),
    ])


def bake_donut():
    return "".join([
        contact_shadow(50, 84, 28),
        circle(50, 56, 28, fill=P.CRUST),
        circle(50, 56, 28, fill="none", stroke=OUT, w=LW),
        path("M22 56 A28 28 0 0 1 78 56 A28 28 0 0 1 70 76 "
             "Q66 66 58 72 Q52 62 44 70 Q36 62 30 70 Q24 64 22 56 Z",
             fill=P.ROSE),
        circle(50, 56, 9, fill=P.PAPER_WARM),
        circle(50, 56, 9, fill="none", stroke=OUT, w=LW),
        sprinkle_scatter(50, 46, 20, 9, "donutsprink", 12),
        highlight(36, 44, 7, 4, -35, 0.3),
    ])


def bake_macaron():
    def shell(y, flip):
        d = ("M24 %s C24 %s 34 %s 50 %s C66 %s 76 %s 76 %s Z" %
             (n(y), n(y - 16 * flip), n(y - 22 * flip), n(y - 22 * flip),
              n(y - 22 * flip), n(y - 16 * flip), n(y)))
        return path(d, fill=P.ROSE) + path(d, fill="none", stroke=OUT, w=LW)
    return "".join([
        contact_shadow(50, 84, 28),
        shell(54, 1),
        rect(24, 54, 52, 12, 3, fill=P.CARAMEL),
        rect(24, 54, 52, 12, 3, fill="none", stroke=OUT, w=LW),
        shell(66, -1),
        sprinkle_scatter(50, 48, 18, 4, "macfoot", 6, [P.ROSE_DEEP]),
        highlight(38, 42, 9, 4, -18, 0.4),
    ])


def bake_muffin():
    top = blob(50, 44, 28, 18, "muffintop", 11, 2.0)
    return "".join([
        contact_shadow(50, 88, 24),
        path("M32 54 L38 84 Q38 87 44 87 L56 87 Q62 87 62 84 L68 54 Z",
             fill=P.PAPER_DEEP),
        "".join(line(35 + i * 6, 56, 38 + i * 5.5, 85, P.CARAMEL, 1.4,
                     opacity=0.5) for i in range(6)),
        path("M32 54 L38 84 Q38 87 44 87 L56 87 Q62 87 62 84 L68 54 Z",
             fill="none", stroke=OUT, w=LW),
        path(top, fill=P.CARAMEL),
        path(top, fill="none", stroke=OUT, w=LW),
        "".join(circle(x, y, 3, fill=P.BERRY)
                for x, y in [(40, 42), (56, 38), (62, 48), (46, 50)]),
        highlight(38, 36, 9, 5, -20, 0.28),
    ])


def bake_cinnamon_roll():
    spiral = []
    pts = []
    for i in range(46):
        t = i / 45.0
        a = t * math.tau * 2.4
        r_ = 5 + t * 23
        pts.append((50 + math.cos(a) * r_, 58 + math.sin(a) * r_ * 0.92))
    spiral.append(path(open_spline(pts), stroke=P.COCOA, w=5.5, fill="none",
                       stroke_linecap="round", opacity=0.85))
    return "".join([
        contact_shadow(50, 84, 30),
        circle(50, 58, 29, fill=P.CRUST),
        circle(50, 58, 29, fill="none", stroke=OUT, w=LW),
        "".join(spiral),
        path(open_spline([(p[0], p[1]) for p in pts]), stroke=P.DOUGH, w=2.0,
             fill="none", opacity=0.55),
        drip_top(50, 40, 44, "rolldrip", P.WHITE, 7, 5),
        highlight(38, 44, 8, 4, -30, 0.3),
    ])


def bake_pretzel():
    """Two crossed loops over a lower bow. Drawn as one continuous stroked
    path, fat ink first then a lighter core on top, so the crossings read."""
    d = ("M30 76 C10 62 18 34 42 34 C58 34 62 50 50 58 "
         "C38 50 42 34 58 34 C82 34 90 62 70 76")
    return "".join([
        contact_shadow(50, 82, 30),
        path(d, stroke=P.CARAMEL, w=13, fill="none", stroke_linecap="round",
             stroke_linejoin="round"),
        path(d, stroke=P.CRUST, w=8, fill="none", stroke_linecap="round",
             stroke_linejoin="round"),
        path("M30 76 Q50 88 70 76", stroke=P.CARAMEL, w=13, fill="none",
             stroke_linecap="round"),
        path("M30 76 Q50 88 70 76", stroke=P.CRUST, w=8, fill="none",
             stroke_linecap="round"),
        sprinkle_scatter(50, 52, 24, 20, "salt", 14, [P.WHITE]),
    ])


def bake_tart():
    return "".join([
        contact_shadow(50, 84, 30),
        path("M20 56 L24 78 Q24 82 32 82 L68 82 Q76 82 76 78 L80 56 Z",
             fill=P.DOUGH_DEEP),
        "".join(line(24 + i * 8, 58, 26 + i * 7.6, 80, P.CARAMEL, 1.5,
                     opacity=0.55) for i in range(8)),
        ellipse(50, 56, 30, 9, fill=P.LEMON),
        ellipse(50, 56, 30, 9, fill="none", stroke=OUT, w=LW),
        path("M20 56 L24 78 Q24 82 32 82 L68 82 Q76 82 76 78 L80 56",
             fill="none", stroke=OUT, w=LW),
        "".join(berry(x, y, 5, c, "tb%d" % i, False) for i, (x, y, c) in
                enumerate([(38, 53, P.JAM), (50, 50, P.BERRY),
                           (62, 53, P.JAM), (44, 58, P.BERRY),
                           (57, 58, P.CHERRY)])),
        leaf(50, 44, 12, 7, P.SAGE, -20),
    ])


def bake_scone():
    d = "M22 78 L34 42 L66 42 L78 78 Z"
    return "".join([
        contact_shadow(50, 80, 30),
        path("M24 76 L35 44 L65 44 L76 76 Q76 79 70 79 L30 79 Q24 79 24 76 Z",
             fill=P.CRUST),
        path("M35 44 L65 44 L68 54 L32 54 Z", fill=P.DOUGH_DEEP),
        path("M24 76 L35 44 L65 44 L76 76 Q76 79 70 79 L30 79 Q24 79 24 76 Z",
             fill="none", stroke=OUT, w=LW, stroke_linejoin="round"),
        line(32, 54, 68, 54, OUT, 1.1, opacity="0.5"),
        "".join(circle(x, y, 2.6, fill=P.BERRY)
                for x, y in [(42, 62), (56, 60), (50, 70), (62, 70)]),
        highlight(42, 50, 8, 3, -8, 0.3),
    ])


def bake_brownie():
    return "".join([
        contact_shadow(50, 82, 28),
        path("M24 78 L24 50 L76 50 L76 78 Q76 81 70 81 L30 81 Q24 81 24 78 Z",
             fill=P.COCOA_DARK),
        path("M24 50 L34 42 L86 42 L76 50 Z", fill=P.COCOA),
        path("M76 50 L86 42 L86 70 L76 78 Z", fill="#6A4330"),
        path("M24 78 L24 50 L34 42 L86 42 L86 70 L76 78 Z", fill="none",
             stroke=OUT, w=LW, stroke_linejoin="round"),
        sprinkle_scatter(58, 46, 22, 3, "nuts", 7, [P.CARAMEL, P.CRUST]),
        highlight(40, 60, 9, 4, -6, 0.14),
    ])


def bake_mystery():
    d = blob(50, 54, 26, 22, "mystbake", 14, 3.6)
    return "".join([
        contact_shadow(50, 82, 30),
        path(d, fill=P.TEAL),
        path(d, fill="none", stroke=OUT, w=LW),
        drip_top(50, 40, 44, "mystdrip", P.ROSE, 8, 6),
        sparkle(26, 34, 8, P.GLOW), sparkle(76, 40, 6, P.LEMON),
        sparkle(66, 24, 5, P.ROSE),
        circle(42, 56, 4, fill=P.WHITE), circle(60, 58, 4, fill=P.WHITE),
        circle(43, 57, 2, fill=P.INK), circle(61, 59, 2, fill=P.INK),
        path("M44 66 Q51 72 58 66", stroke=P.INK, w=1.8, fill="none",
             stroke_linecap="round"),
    ])


# ================================================================ toppings
# Toppings are drawn to overlay a baked good, so they float near the top.

def top_frosting_pink():
    return drip_top(50, 38, 52, "tfp", P.ROSE, 10, 6) + \
        ellipse(50, 36, 26, 6, fill=P.ROSE)


def top_frosting_white():
    return drip_top(50, 38, 52, "tfw", P.WHITE, 10, 6) + \
        ellipse(50, 36, 26, 6, fill=P.WHITE)


def top_frosting_choc():
    return drip_top(50, 38, 52, "tfc", P.COCOA, 10, 6) + \
        ellipse(50, 36, 26, 6, fill=P.COCOA)


def top_sprinkles():
    return sprinkle_scatter(50, 44, 24, 10, "topsprink", 22)


def top_cherry():
    return (path("M50 26 C56 20 62 20 66 24", stroke=P.GREEN_DEEP, w=2,
                 fill="none", stroke_linecap="round") +
            circle(48, 32, 8, fill=P.CHERRY) +
            circle(48, 32, 8, fill="none", stroke=OUT, w=LW) +
            circle(45, 29, 2.4, fill=P.WHITE, opacity=0.65))


def top_candle():
    return (rect(47, 14, 6, 22, 3, fill=P.SKY) +
            rect(47, 14, 6, 22, 3, fill="none", stroke=OUT, w=1.2) +
            path("M50 6 C54 10 54 14 50 15 C46 14 46 10 50 6 Z", fill=P.GLOW) +
            circle(50, 12, 5, fill=P.EMBER, opacity=0.35))


def top_heart():
    return heart(50, 34, 12, P.ROSE_DEEP)


# ---------------------------------------------------- toppings, standalone
# The `top-*` sprites above are overlays: a drip with nothing under it, which
# on the floor reads as a smear. So each topping also gets a container sprite
# that is what you actually see and pick up in the world.

def _tub(color, lid):
    return "".join([
        contact_shadow(50, 86, 26),
        path("M28 48 L32 80 Q32 84 38 84 L62 84 Q68 84 68 80 L72 48 Z",
             fill=P.PAPER_PALE),
        path("M30 60 Q50 56 70 60 L68 80 Q68 84 62 84 L38 84 Q32 84 32 80 Z",
             fill=color),
        path("M28 48 L32 80 Q32 84 38 84 L62 84 Q68 84 68 80 L72 48 Z",
             fill="none", stroke=OUT, w=LW),
        ellipse(50, 48, 22, 7, fill=color),
        ellipse(50, 48, 22, 7, fill="none", stroke=OUT, w=LW),
        # a swirl of it sitting proud of the rim
        path("M34 46 Q42 34 50 40 Q58 30 64 42 Q58 50 50 46 Q42 52 34 46 Z",
             fill=color),
        path("M34 46 Q42 34 50 40 Q58 30 64 42 Q58 50 50 46 Q42 52 34 46 Z",
             fill="none", stroke=OUT, w=1.3),
        rect(26, 40, 48, 9, 4, fill=lid),
        rect(26, 40, 48, 9, 4, fill="none", stroke=OUT, w=LW),
        highlight(38, 66, 3.5, 9, 0, 0.35),
    ])


def jar_pink():
    return _tub(P.ROSE, P.BERRY)


def jar_white():
    return _tub(P.PAPER_PALE, P.SKY)


def jar_choc():
    return _tub(P.COCOA, P.COCOA_DARK)


def jar_cherry():
    """A little bowl of cherries."""
    out = [contact_shadow(50, 84, 26),
           path("M24 54 Q26 76 50 78 Q74 76 76 54 Z", fill=P.SKY),
           path("M24 54 Q26 76 50 78 Q74 76 76 54 Z", fill="none",
                stroke=OUT, w=LW)]
    for cx, cy in ((38, 44), (62, 44), (50, 36), (50, 52)):
        out.append(path("M%s %s C%s %s %s %s %s %s" % (
            n(cx), n(cy - 9), n(cx + 4), n(cy - 18), n(cx + 10), n(cy - 20),
            n(cx + 13), n(cy - 22)), stroke=P.GREEN_DEEP, w=1.8, fill="none",
            stroke_linecap="round"))
    for cx, cy in ((38, 44), (62, 44), (50, 36), (50, 52)):
        out.append(circle(cx, cy, 10, fill=P.CHERRY))
        out.append(circle(cx, cy, 10, fill="none", stroke=OUT, w=1.4))
        out.append(circle(cx - 3.5, cy - 3.5, 2.6, fill=P.WHITE, opacity=0.6))
    out.append(ellipse(50, 56, 26, 6, fill=P.SKY))
    out.append(path("M24 54 Q50 62 76 54", fill="none", stroke=OUT, w=1.2))
    return "".join(out)


def jar_candle():
    """A bundle of candles, standing up."""
    out = [contact_shadow(50, 86, 22)]
    for i, (x, col, h) in enumerate([(34, P.SKY, 30), (50, P.CORAL, 40),
                                     (66, P.GREEN, 26)]):
        top = 84 - h
        out.append(rect(x - 5, top, 10, h, 4, fill=col))
        out.append("".join(rect(x - 5, top + 6 + j * 9, 10, 4, 2,
                                fill=P.PAPER_PALE, opacity=0.65)
                           for j in range(int(h / 9))))
        out.append(rect(x - 5, top, 10, h, 4, fill="none", stroke=OUT, w=LW))
        out.append(line(x, top, x, top - 5, OUT, 1.4))
        out.append(path("M%s %s C%s %s %s %s %s %s C%s %s %s %s %s %s Z" % (
            n(x), n(top - 16), n(x + 6), n(top - 11), n(x + 5), n(top - 5),
            n(x), n(top - 5), n(x - 5), n(top - 5), n(x - 6), n(top - 11),
            n(x), n(top - 16)), fill=P.GLOW))
        out.append(circle(x, top - 9, 3, fill=P.EMBER, opacity=0.5))
    return "".join(out)


def jar_heart():
    return "".join([
        contact_shadow(50, 84, 24),
        heart(50, 52, 26, P.ROSE_DEEP),
        heart(50, 52, 26, P.ROSE_DEEP),
        path("M50 78 C26 60 30 34 42 34 C48 34 50 42 50 42 C50 42 52 34 58 34 "
             "C70 34 74 60 50 78 Z", fill="none", stroke=OUT, w=LW),
        ellipse(40, 46, 6, 4, fill=P.WHITE, opacity=0.45,
                transform="rotate(-30 40 46)"),
        sparkle(72, 32, 7, P.GLOW), sparkle(26, 36, 5, P.LEMON),
    ])


FOOD = {
    # ingredients
    "flour": flour, "sugar": sugar, "butter": butter, "egg": egg,
    "milk": milk, "chocolate": chocolate, "strawberry": strawberry,
    "blueberry": blueberry, "apple": apple, "lemon": lemon, "honey": honey,
    "cinnamon": cinnamon, "sprinkles": sprinkles_jar, "vanilla": vanilla,
    "pumpkin": pumpkin, "cheese": cheese,
    # doughs
    "dough-bread": dough_bread, "dough-cookie": dough_cookie,
    "dough-cake": dough_cake, "dough-pastry": dough_pastry,
    "dough-pie": dough_pie, "dough-mystery": dough_mystery,
    # bakes
    "bread": bake_bread, "baguette": bake_baguette, "croissant": bake_croissant,
    "cookie": bake_cookie, "cupcake": bake_cupcake, "cake": bake_cake,
    "pie": bake_pie, "donut": bake_donut, "macaron": bake_macaron,
    "muffin": bake_muffin, "cinnamon-roll": bake_cinnamon_roll,
    "pretzel": bake_pretzel, "tart": bake_tart, "scone": bake_scone,
    "brownie": bake_brownie, "mystery-bake": bake_mystery,
    # toppings
    "top-pink": top_frosting_pink, "top-white": top_frosting_white,
    "top-choc": top_frosting_choc, "top-sprinkles": top_sprinkles,
    "top-cherry": top_cherry, "top-candle": top_candle, "top-heart": top_heart,
    # the pick-up-able form of each topping
    "jar-pink": jar_pink, "jar-white": jar_white, "jar-choc": jar_choc,
    "jar-sprinkles": sprinkles_jar, "jar-cherry": jar_cherry,
    "jar-candle": jar_candle, "jar-heart": jar_heart,
}
