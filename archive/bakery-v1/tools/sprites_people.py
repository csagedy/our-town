"""The cast, and a few small props.

One parametric figure generates everybody: change the skin tint, the hair
shape, the clothes ink and the height and you have a different person. Faces
are separate symbols layered on top at a fixed spot, so any character can wear
any expression -- which is what makes tapping one feel alive.
"""

import math

import palette as P
from draw import (arc, blob, circle, closed_spline, contact_shadow, ellipse, g,
                  heart, highlight, leaf, line, n, open_spline, path, rect,
                  rng, sparkle, sprinkle_scatter, text)

OUT = P.INK
LW = 1.7

HEAD = (50, 30, 15.5)   # face anchor: every expression is drawn around this


# ------------------------------------------------------------------- hair

def _hair(style, col):
    cx, cy, r = HEAD
    if style == "bob":
        return (path("M%s %s A%s %s 0 0 1 %s %s L%s %s Q%s %s %s %s Z" % (
            n(cx - r - 2), n(cy + 4), n(r + 2), n(r + 2), n(cx + r + 2), n(cy + 4),
            n(cx + r + 3), n(cy + 16), n(cx), n(cy + 11),
            n(cx - r - 3), n(cy + 16)), fill=col))
    if style == "bun":
        return (circle(cx, cy - r - 4, 7.5, fill=col) +
                path("M%s %s A%s %s 0 0 1 %s %s Z" % (
                    n(cx - r - 1), n(cy + 1), n(r + 1), n(r + 1),
                    n(cx + r + 1), n(cy + 1)), fill=col))
    if style == "pigtails":
        return (circle(cx - r - 4, cy + 4, 7, fill=col) +
                circle(cx + r + 4, cy + 4, 7, fill=col) +
                path("M%s %s A%s %s 0 0 1 %s %s Z" % (
                    n(cx - r - 1), n(cy + 2), n(r + 1), n(r + 1),
                    n(cx + r + 1), n(cy + 2)), fill=col))
    if style == "curls":
        out = [path("M%s %s A%s %s 0 0 1 %s %s Z" % (
            n(cx - r - 2), n(cy + 3), n(r + 2), n(r + 2),
            n(cx + r + 2), n(cy + 3)), fill=col)]
        for i in range(7):
            a = math.pi + i * math.pi / 6
            out.append(circle(cx + math.cos(a) * (r + 1),
                              cy + math.sin(a) * (r + 1) + 2, 6, fill=col))
        return "".join(out)
    if style == "short":
        return path("M%s %s A%s %s 0 0 1 %s %s L%s %s Q%s %s %s %s Z" % (
            n(cx - r - 1), n(cy + 2), n(r + 1), n(r + 1), n(cx + r + 1), n(cy + 2),
            n(cx + r + 1), n(cy - 2), n(cx), n(cy + 3),
            n(cx - r - 1), n(cy - 2)), fill=col)
    if style == "long":
        return (path("M%s %s A%s %s 0 0 1 %s %s L%s %s Q%s %s %s %s Z" % (
            n(cx - r - 2), n(cy + 2), n(r + 2), n(r + 2), n(cx + r + 2), n(cy + 2),
            n(cx + r + 4), n(cy + 32), n(cx), n(cy + 24),
            n(cx - r - 4), n(cy + 32)), fill=col))
    return ""


def _hat(kind):
    cx, cy, r = HEAD
    if kind == "chef":
        return (path("M%s %s Q%s %s %s %s Q%s %s %s %s Q%s %s %s %s Z" % (
            n(cx - 15), n(cy - 12), n(cx - 22), n(cy - 26), n(cx - 8), n(cy - 26),
            n(cx), n(cy - 36), n(cx + 8), n(cy - 26),
            n(cx + 22), n(cy - 26), n(cx + 15), n(cy - 12)),
            fill=P.PAPER_PALE) +
            path("M%s %s Q%s %s %s %s Q%s %s %s %s Q%s %s %s %s Z" % (
                n(cx - 15), n(cy - 12), n(cx - 22), n(cy - 26), n(cx - 8), n(cy - 26),
                n(cx), n(cy - 36), n(cx + 8), n(cy - 26),
                n(cx + 22), n(cy - 26), n(cx + 15), n(cy - 12)),
                fill="none", stroke=OUT, w=LW) +
            rect(cx - 16, cy - 14, 32, 7, 3, fill=P.PAPER_PALE) +
            rect(cx - 16, cy - 14, 32, 7, 3, fill="none", stroke=OUT, w=LW))
    if kind == "kerchief":
        return (path("M%s %s A%s %s 0 0 1 %s %s Z" % (
            n(cx - r - 1), n(cy - 1), n(r + 1), n(r + 1), n(cx + r + 1), n(cy - 1)),
            fill=P.CORAL) +
            path("M%s %s l%s %s l%s %s Z" % (n(cx + r - 2), n(cy - 4),
                                             n(9), n(-5), n(-2), n(9)),
                 fill=P.CORAL))
    if kind == "beanie":
        return (path("M%s %s A%s %s 0 0 1 %s %s Z" % (
            n(cx - r - 1), n(cy - 2), n(r + 1), n(r + 1), n(cx + r + 1), n(cy - 2)),
            fill=P.TEAL) +
            rect(cx - r - 2, cy - 5, (r + 2) * 2, 6, 3, fill=P.TEAL_DEEP) +
            circle(cx, cy - r - 4, 5, fill=P.YELLOW))
    return ""


# ---------------------------------------------------------------- the figure

def person(skin="a", hair="bob", hair_col="navy", shirt=None, apron=None,
           hat=None, tall=1.0, seed="p"):
    """A standing figure, feet on y=93, face anchored at HEAD."""
    sk, sk_dark = P.SKINS[skin]
    hc = P.HAIRS[hair_col]
    shirt = shirt or P.CORAL
    r = rng(seed)

    top = 46.0                      # shoulders
    foot = 93.0
    hip = top + (foot - top) * 0.58 * tall
    body = ("M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z" % (
        n(34), n(hip), n(33), n(top + 2), n(42), n(top),
        n(58), n(top), n(67), n(top + 2), n(66), n(hip)))

    out = [contact_shadow(50, 94, 20, 5.5, 0.18)]
    # legs
    for lx in (43.5, 56.5):
        out.append(rect(lx - 4, hip - 4, 8, foot - hip + 4, 4, fill=P.NAVY))
        out.append(rect(lx - 4.6, foot - 6, 9.2, 7, 3.5, fill=P.NAVY_DEEP))
    # body
    out.append(path(body, fill=shirt))
    out.append(path(body, fill="none", stroke=OUT, w=LW))
    if apron:
        out.append(path("M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z" % (
            n(41), n(top + 8), n(41), n(top + 2), n(50), n(top + 2),
            n(59), n(top + 8), n(63), n(hip), n(37), n(hip)), fill=apron))
        out.append(path("M%s %s L%s %s M%s %s L%s %s" % (
            n(43), n(top + 6), n(50), n(top + 1), n(57), n(top + 6),
            n(50), n(top + 1)), stroke=OUT, w=1.2, fill="none"))
    # arms
    for sx, ex in ((34, 26), (66, 74)):
        out.append(path("M%s %s Q%s %s %s %s" % (
            n(sx), n(top + 6), n(sx + (ex - sx) * 0.7), n(top + 14),
            n(ex), n(top + 22)),
            stroke=shirt, w=7.5, fill="none", stroke_linecap="round"))
        out.append(path("M%s %s Q%s %s %s %s" % (
            n(sx), n(top + 6), n(sx + (ex - sx) * 0.7), n(top + 14),
            n(ex), n(top + 22)),
            stroke=OUT, w=9.2, fill="none", stroke_linecap="round",
            opacity=0.0))
        out.append(circle(ex, top + 23, 5, fill=sk))
        out.append(circle(ex, top + 23, 5, fill="none", stroke=OUT, w=1.3))
    # neck + head
    out.append(rect(46, top - 8, 8, 10, 3, fill=sk_dark))
    cx, cy, rr = HEAD
    out.append(circle(cx, cy, rr, fill=sk))
    out.append(circle(cx, cy, rr, fill="none", stroke=OUT, w=LW))
    out.append(_hair(hair, hc))
    if hat:
        out.append(_hat(hat))
    return "".join(out)


# ------------------------------------------------------------- expressions
# Drawn around HEAD so they sit on any character.

def _eyes(kind="dot"):
    cx, cy, r = HEAD
    lx, rx, ey = cx - 5.5, cx + 5.5, cy + 1
    if kind == "dot":
        return (circle(lx, ey, 2.0, fill=OUT) + circle(rx, ey, 2.0, fill=OUT))
    if kind == "happy":
        return (path("M%s %s Q%s %s %s %s" % (n(lx - 3), n(ey + 1), n(lx), n(ey - 4),
                                              n(lx + 3), n(ey + 1)),
                     stroke=OUT, w=1.8, fill="none", stroke_linecap="round") +
                path("M%s %s Q%s %s %s %s" % (n(rx - 3), n(ey + 1), n(rx), n(ey - 4),
                                              n(rx + 3), n(ey + 1)),
                     stroke=OUT, w=1.8, fill="none", stroke_linecap="round"))
    if kind == "wide":
        return (circle(lx, ey, 3.2, fill=P.PAPER_PALE) +
                circle(rx, ey, 3.2, fill=P.PAPER_PALE) +
                circle(lx, ey, 3.2, fill="none", stroke=OUT, w=1.2) +
                circle(rx, ey, 3.2, fill="none", stroke=OUT, w=1.2) +
                circle(lx, ey + 0.6, 1.5, fill=OUT) +
                circle(rx, ey + 0.6, 1.5, fill=OUT))
    if kind == "closed":
        return (path("M%s %s Q%s %s %s %s" % (n(lx - 3), n(ey - 1), n(lx), n(ey + 3),
                                              n(lx + 3), n(ey - 1)),
                     stroke=OUT, w=1.8, fill="none", stroke_linecap="round") +
                path("M%s %s Q%s %s %s %s" % (n(rx - 3), n(ey - 1), n(rx), n(ey + 3),
                                              n(rx + 3), n(ey - 1)),
                     stroke=OUT, w=1.8, fill="none", stroke_linecap="round"))
    if kind == "heart":
        return heart(lx, ey, 4, P.CORAL) + heart(rx, ey, 4, P.CORAL)
    return ""


def _mouth(kind="smile"):
    cx, cy, r = HEAD
    my = cy + 8
    if kind == "smile":
        return path("M%s %s Q%s %s %s %s" % (n(cx - 5), n(my - 1), n(cx), n(my + 4),
                                             n(cx + 5), n(my - 1)),
                    stroke=OUT, w=1.8, fill="none", stroke_linecap="round")
    if kind == "grin":
        return (path("M%s %s Q%s %s %s %s Z" % (n(cx - 7), n(my - 2), n(cx), n(my + 7),
                                                n(cx + 7), n(my - 2)), fill=OUT) +
                path("M%s %s Q%s %s %s %s" % (n(cx - 5), n(my + 2), n(cx), n(my + 5),
                                              n(cx + 5), n(my + 2)),
                     stroke=P.CORAL, w=2.2, fill="none"))
    if kind == "o":
        return ellipse(cx, my + 1, 3.2, 4, fill=OUT)
    if kind == "soft":
        return path("M%s %s Q%s %s %s %s" % (n(cx - 3.5), n(my), n(cx), n(my + 2.5),
                                             n(cx + 3.5), n(my)),
                    stroke=OUT, w=1.7, fill="none", stroke_linecap="round")
    return ""


def _cheeks():
    cx, cy, r = HEAD
    return (ellipse(cx - 10, cy + 5, 3.4, 2.2, fill=P.CORAL, opacity=0.45) +
            ellipse(cx + 10, cy + 5, 3.4, 2.2, fill=P.CORAL, opacity=0.45))


FACES = {
    "face-happy":  lambda: _cheeks() + _eyes("happy") + _mouth("smile"),
    "face-calm":   lambda: _cheeks() + _eyes("dot") + _mouth("soft"),
    "face-excited": lambda: _cheeks() + _eyes("wide") + _mouth("grin"),
    "face-surprised": lambda: _cheeks() + _eyes("wide") + _mouth("o"),
    "face-sleepy": lambda: _cheeks() + _eyes("closed") + _mouth("soft"),
    "face-love":   lambda: _cheeks() + _eyes("heart") + _mouth("smile"),
}


# -------------------------------------------------------------------- cast

CAST = {
    "poppy":  dict(skin="b", hair="pigtails", hair_col="navy", shirt=P.TEAL,
                   apron=P.PINK, hat="chef", tall=0.86, seed="poppy"),
    "gran":   dict(skin="a", hair="bun", hair_col="pale", shirt=P.PLUM,
                   apron=P.YELLOW_PALE, tall=1.0, seed="gran"),
    "dad":    dict(skin="d", hair="short", hair_col="navy", shirt=P.GREEN,
                   apron=P.PAPER_DEEP, tall=1.06, seed="dad"),
    "iris":   dict(skin="e", hair="curls", hair_col="coral", shirt=P.YELLOW,
                   tall=0.84, seed="iris"),
    "max":    dict(skin="c", hair="short", hair_col="teal", shirt=P.CORAL,
                   hat="beanie", tall=0.86, seed="max"),
    "nell":   dict(skin="a", hair="long", hair_col="pink", shirt=P.SEA,
                   tall=0.9, seed="nell"),
    "theo":   dict(skin="d", hair="curls", hair_col="navy", shirt=P.ORANGE,
                   tall=0.72, seed="theo"),
    "juno":   dict(skin="b", hair="bob", hair_col="green", shirt=P.PLUM,
                   apron=P.TEAL_PALE, hat="kerchief", tall=0.95, seed="juno"),
}


# ------------------------------------------------------------------ animals

def cat(col=None, col2=None):
    col = col or P.ORANGE
    col2 = col2 or P.CORAL
    body = blob(52, 64, 24, 17, "catbody", 10, 1.4)
    return "".join([
        contact_shadow(52, 82, 24, 6, 0.18),
        path("M76 62 Q92 56 88 40 Q84 48 74 52 Z", fill=col),
        path("M76 62 Q92 56 88 40 Q84 48 74 52 Z", fill="none", stroke=OUT, w=1.3),
        path(body, fill=col), path(body, fill="none", stroke=OUT, w=LW),
        path("M22 34 L18 18 L34 26 Z", fill=col),
        path("M46 32 L50 14 L58 30 Z", fill=col),
        path("M22 34 L18 18 L34 26 Z", fill="none", stroke=OUT, w=1.3),
        path("M46 32 L50 14 L58 30 Z", fill="none", stroke=OUT, w=1.3),
        circle(34, 40, 17, fill=col), circle(34, 40, 17, fill="none", stroke=OUT, w=LW),
        circle(29, 38, 2.2, fill=OUT), circle(39, 38, 2.2, fill=OUT),
        path("M31 45 Q34 48 37 45", stroke=OUT, w=1.5, fill="none",
             stroke_linecap="round"),
        path("M34 43 l-2 2 l4 0 Z", fill=P.PINK),
        "".join(line(34 + s * 6, 44, 34 + s * 20, 42 + i * 3, OUT, 1.0)
                for s in (-1, 1) for i in range(2)),
        ellipse(52, 62, 12, 7, fill=col2, opacity=0.6),
    ])


def dog(col=None):
    """Long floppy ear on the near side only, curled tail, muzzle patch."""
    col = col or P.CARAMEL
    body = blob(54, 64, 24, 17, "dogbody", 10, 1.3)
    return "".join([
        contact_shadow(52, 84, 26, 6, 0.18),
        path("M76 58 Q92 52 88 38 Q84 46 76 50", stroke=col, w=6.5,
             fill="none", stroke_linecap="round"),
        path(body, fill=col), path(body, fill="none", stroke=OUT, w=LW),
        line(44, 76, 44, 86, col, 7), line(62, 76, 62, 86, col, 7),
        line(44, 76, 44, 86, OUT, 8.6, opacity="0"),
        circle(32, 42, 17, fill=col),
        circle(32, 42, 17, fill="none", stroke=OUT, w=LW),
        path("M20 34 Q6 40 10 58 Q18 62 22 52 Z", fill=P.COCOA),
        path("M20 34 Q6 40 10 58 Q18 62 22 52 Z", fill="none", stroke=OUT, w=1.3),
        ellipse(34, 50, 13, 9, fill=P.PAPER_PALE),
        ellipse(34, 50, 13, 9, fill="none", stroke=OUT, w=1.2),
        ellipse(34, 45, 4.5, 3.4, fill=OUT),
        path("M34 49 Q34 54 29 54 M34 49 Q34 54 39 54", stroke=OUT, w=1.4,
             fill="none", stroke_linecap="round"),
        circle(27, 38, 2.2, fill=OUT), circle(40, 38, 2.2, fill=OUT),
        ellipse(46, 36, 9, 7, fill=P.COCOA, opacity=0.45),
        ellipse(58, 66, 12, 8, fill=P.PAPER_DEEP, opacity=0.5),
    ])


def chicken():
    body = blob(52, 62, 21, 18, "chick", 10, 1.3)
    return "".join([
        contact_shadow(52, 84, 20, 5, 0.18),
        line(46, 78, 46, 88, P.ORANGE, 2.4), line(58, 78, 58, 88, P.ORANGE, 2.4),
        path(body, fill=P.PAPER_PALE), path(body, fill="none", stroke=OUT, w=LW),
        path("M66 58 Q80 52 78 66 Q70 66 66 62 Z", fill=P.PAPER_DEEP),
        path("M66 58 Q80 52 78 66 Q70 66 66 62 Z", fill="none", stroke=OUT, w=1.2),
        circle(40, 40, 14, fill=P.PAPER_PALE),
        circle(40, 40, 14, fill="none", stroke=OUT, w=LW),
        path("M34 28 q3 -8 6 0 q3 -8 6 0 q2 3 -1 4 l-10 0 q-3 -1 -1 -4 Z",
             fill=P.CORAL),
        path("M27 44 l-8 3 l8 3 Z", fill=P.YELLOW),
        path("M27 44 l-8 3 l8 3 Z", fill="none", stroke=OUT, w=1.1),
        circle(36, 38, 2.2, fill=OUT),
        ellipse(40, 52, 4, 5, fill=P.CORAL, opacity=0.8),
    ])


def bird():
    return "".join([
        contact_shadow(50, 78, 14, 4, 0.16),
        ellipse(50, 58, 18, 15, fill=P.SEA),
        ellipse(50, 58, 18, 15, fill="none", stroke=OUT, w=LW),
        path("M52 52 Q66 46 64 62 Q56 62 52 58 Z", fill=P.TEAL),
        circle(44, 42, 11, fill=P.SEA), circle(44, 42, 11, fill="none",
                                               stroke=OUT, w=LW),
        circle(41, 41, 2.0, fill=OUT),
        path("M34 44 l-7 3 l7 2 Z", fill=P.YELLOW),
        line(46, 72, 46, 78, P.YELLOW, 2.0), line(54, 72, 54, 78, P.YELLOW, 2.0),
        path("M66 60 q10 4 14 -2", stroke=P.TEAL, w=5, fill="none",
             stroke_linecap="round"),
    ])


ANIMALS = {"cat": cat, "dog": dog, "chicken": chicken, "bird": bird}


# ------------------------------------------------------------- small props
# Draggable decoration. Nothing here does anything; that is the point.

def teapot():
    """Round body, a spout that tapers, a loop handle and a lid with a knob."""
    b = blob(50, 60, 23, 19, "teapot", 10, 1.0)
    return "".join([
        contact_shadow(50, 82, 24),
        path("M70 54 Q84 50 88 62 L82 64 Q80 56 68 60 Z", fill=P.TEAL),
        path("M70 54 Q84 50 88 62 L82 64 Q80 56 68 60 Z", fill="none",
             stroke=OUT, w=1.3),
        path("M28 50 Q12 50 12 62 Q12 74 28 72", stroke=P.TEAL, w=6.5,
             fill="none", stroke_linecap="round"),
        path("M28 50 Q12 50 12 62 Q12 74 28 72", stroke=OUT, w=8.5,
             fill="none", stroke_linecap="round", opacity=0.0),
        path(b, fill=P.TEAL), path(b, fill="none", stroke=OUT, w=LW),
        ellipse(50, 42, 17, 6, fill=P.TEAL_DEEP),
        ellipse(50, 42, 17, 6, fill="none", stroke=OUT, w=1.3),
        path("M36 42 Q50 32 64 42 Z", fill=P.TEAL_DEEP),
        path("M36 42 Q50 32 64 42", fill="none", stroke=OUT, w=1.3),
        circle(50, 30, 4.5, fill=P.YELLOW),
        circle(50, 30, 4.5, fill="none", stroke=OUT, w=1.3),
        sprinkle_scatter(50, 62, 13, 8, "potdots", 6, [P.PAPER_PALE]),
        highlight(40, 52, 5, 8, -25, 0.28),
    ])


def mug():
    return "".join([
        contact_shadow(50, 80, 18),
        path("M68 50 Q82 50 82 60 Q82 70 68 70", stroke=P.CORAL, w=6,
             fill="none", stroke_linecap="round"),
        path("M32 44 L36 76 Q36 80 42 80 L58 80 Q64 80 64 76 L68 44 Z",
             fill=P.CORAL),
        path("M32 44 L36 76 Q36 80 42 80 L58 80 Q64 80 64 76 L68 44 Z",
             fill="none", stroke=OUT, w=LW),
        ellipse(50, 44, 18, 6, fill=P.PAPER_DEEP),
        ellipse(50, 44, 18, 6, fill="none", stroke=OUT, w=1.3),
    ])


def cake_stand():
    """A footed stand with a domed cover. Empty ellipses read as nothing, so
    it needs a column, a foot and a visible dome."""
    return "".join([
        contact_shadow(50, 88, 28),
        ellipse(50, 84, 22, 7, fill=P.PAPER_DEEP),
        ellipse(50, 84, 22, 7, fill="none", stroke=OUT, w=LW),
        path("M45 84 Q42 72 46 62 L54 62 Q58 72 55 84 Z", fill=P.PAPER_DEEP),
        path("M45 84 Q42 72 46 62 L54 62 Q58 72 55 84 Z", fill="none",
             stroke=OUT, w=1.3),
        ellipse(50, 62, 30, 9, fill=P.PAPER_PALE),
        ellipse(50, 62, 30, 9, fill="none", stroke=OUT, w=LW),
        path("M22 60 Q22 26 50 24 Q78 26 78 60 Z", fill=P.TEAL_PALE,
             opacity=0.30),
        path("M22 60 Q22 26 50 24 Q78 26 78 60", fill="none", stroke=OUT, w=LW),
        circle(50, 20, 5, fill=P.CORAL),
        circle(50, 20, 5, fill="none", stroke=OUT, w=1.3),
        path("M32 52 Q31 34 44 29", stroke=P.PAPER_PALE, w=2.6, fill="none",
             opacity=0.8),
    ])


def vase():
    b = "M38 84 Q34 60 42 48 Q40 40 44 34 L56 34 Q60 40 58 48 Q66 60 62 84 Z"
    return "".join([
        contact_shadow(50, 86, 20),
        path(b, fill=P.SEA), path(b, fill="none", stroke=OUT, w=LW),
        "".join(line(50, 36, 50 + math.cos(a) * 22, 22 + math.sin(a) * 6,
                     P.MOSS, 2.0) for a in (-2.4, -1.9, -1.2, -0.7)),
        circle(28, 16, 7, fill=P.CORAL), circle(50, 10, 7, fill=P.YELLOW),
        circle(70, 18, 7, fill=P.PINK),
        circle(28, 16, 2.6, fill=P.PAPER_PALE),
        circle(50, 10, 2.6, fill=P.PAPER_PALE),
        circle(70, 18, 2.6, fill=P.PAPER_PALE),
    ])


def balloon():
    return "".join([
        path("M50 44 Q50 62 48 88", stroke=OUT, w=1.2, fill="none"),
        path(blob(50, 28, 20, 23, "balloon", 10, 0.8), fill=P.CORAL),
        path(blob(50, 28, 20, 23, "balloon", 10, 0.8), fill="none",
             stroke=OUT, w=LW),
        path("M46 50 l4 -6 l4 6 Z", fill=P.CORAL),
        highlight(42, 20, 5, 8, -25, 0.5),
    ])


def teddy():
    return "".join([
        contact_shadow(50, 86, 22),
        circle(32, 32, 8, fill=P.CARAMEL), circle(68, 32, 8, fill=P.CARAMEL),
        circle(32, 32, 8, fill="none", stroke=OUT, w=1.3),
        circle(68, 32, 8, fill="none", stroke=OUT, w=1.3),
        path(blob(50, 66, 22, 20, "teddyb", 10, 1.2), fill=P.CARAMEL),
        path(blob(50, 66, 22, 20, "teddyb", 10, 1.2), fill="none", stroke=OUT, w=LW),
        ellipse(50, 70, 13, 11, fill=P.YELLOW_PALE),
        circle(50, 38, 16, fill=P.CARAMEL),
        circle(50, 38, 16, fill="none", stroke=OUT, w=LW),
        ellipse(50, 44, 9, 7, fill=P.YELLOW_PALE),
        ellipse(50, 41, 3.4, 2.6, fill=OUT),
        circle(44, 35, 2.0, fill=OUT), circle(56, 35, 2.0, fill=OUT),
    ])


def book_stack():
    out = [contact_shadow(50, 82, 26)]
    cols = [P.CORAL, P.TEAL, P.YELLOW, P.PLUM]
    for i, c in enumerate(cols):
        y = 76 - i * 11
        w_ = 52 - i * 3
        out.append(rect(50 - w_ / 2, y - 10, w_, 10, 2, fill=c))
        out.append(rect(50 - w_ / 2, y - 10, w_, 10, 2, fill="none",
                        stroke=OUT, w=1.3))
        out.append(line(50 - w_ / 2 + 4, y - 5, 50 + w_ / 2 - 4, y - 5,
                        P.PAPER_PALE, 1.6))
    return "".join(out)


def lantern():
    """A little paper lantern. The game's title object -- she can put a small
    light anywhere she wants one."""
    return "".join([
        contact_shadow(50, 86, 18),
        line(50, 8, 50, 22, OUT, 1.4),
        rect(38, 20, 24, 6, 3, fill=P.PLUM),
        path("M36 26 Q30 48 36 72 L64 72 Q70 48 64 26 Z", fill=P.YELLOW),
        path("M36 26 Q30 48 36 72 L64 72 Q70 48 64 26 Z", fill="none",
             stroke=OUT, w=LW),
        line(33, 40, 67, 40, P.ORANGE, 1.4), line(32, 52, 68, 52, P.ORANGE, 1.4),
        circle(50, 50, 9, fill=P.PAPER_PALE, opacity=0.8),
        rect(40, 72, 20, 6, 3, fill=P.PLUM),
        rect(40, 72, 20, 6, 3, fill="none", stroke=OUT, w=1.3),
        sparkle(50, 50, 16, P.GLOW_SOFT, 0.55),
    ])


def sign():
    return "".join([
        contact_shadow(50, 88, 20),
        rect(46, 50, 8, 38, 3, fill=P.PLUM),
        rect(18, 18, 64, 38, 5, fill=P.PAPER_PALE),
        rect(18, 18, 64, 38, 5, fill="none", stroke=OUT, w=LW),
        rect(23, 23, 54, 28, 3, fill="none", stroke=P.CORAL, w=1.6),
        line(30, 32, 70, 32, P.NAVY_PALE, 2.4),
        line(30, 40, 62, 40, P.NAVY_PALE, 2.4),
    ])


PROPS = {
    "teapot": teapot, "mug": mug, "cake-stand": cake_stand, "vase": vase,
    "balloon": balloon, "teddy": teddy, "books": book_stack,
    "lantern": lantern, "sign": sign,
}
