"""Tiny SVG drawing helpers.

Sprites are drawn in a 100x100 coordinate box and emitted as <symbol> content.
Everything is deterministic: the same seed always produces the same wobble, so
rebuilds produce byte-identical assets and git diffs stay meaningful.
"""

import math
import random
import struct
import zlib

import palette as P


# --------------------------------------------------------------------- random

def rng(seed):
    """A private, reproducible random stream keyed by a string."""
    return random.Random(seed)


def jitter(r, amount=None):
    a = P.WOBBLE if amount is None else amount
    return (r.random() - 0.5) * 2 * a


# ------------------------------------------------------------------ formatting

def n(v):
    """Format a number compactly: 12.0 -> '12', 12.345 -> '12.35'."""
    v = round(float(v), 2)
    if v == int(v):
        return str(int(v))
    return ("%.2f" % v).rstrip("0").rstrip(".")


def attrs(**kw):
    out = []
    for k, v in kw.items():
        if v is None:
            continue
        k = k.replace("__", ":").replace("_", "-")
        if isinstance(v, float) or isinstance(v, int):
            v = n(v)
        out.append('%s="%s"' % (k, v))
    return " ".join(out)


# ------------------------------------------------------------------- elements

def path(d, fill="none", stroke=None, w=None, **kw):
    return "<path %s/>" % attrs(d=d, fill=fill, stroke=stroke,
                                stroke_width=w, **kw)


def circle(cx, cy, r, fill="none", stroke=None, w=None, **kw):
    return "<circle %s/>" % attrs(cx=cx, cy=cy, r=r, fill=fill,
                                  stroke=stroke, stroke_width=w, **kw)


def ellipse(cx, cy, rx, ry, fill="none", stroke=None, w=None, **kw):
    return "<ellipse %s/>" % attrs(cx=cx, cy=cy, rx=rx, ry=ry, fill=fill,
                                   stroke=stroke, stroke_width=w, **kw)


def rect(x, y, w_, h, r=None, fill="none", stroke=None, w=None, **kw):
    return "<rect %s/>" % attrs(x=x, y=y, width=w_, height=h, rx=r,
                                fill=fill, stroke=stroke, stroke_width=w, **kw)


def line(x1, y1, x2, y2, stroke, w=P.STROKE, cap="round", **kw):
    return "<line %s/>" % attrs(x1=x1, y1=y1, x2=x2, y2=y2, stroke=stroke,
                                stroke_width=w, stroke_linecap=cap, **kw)


def g(children, **kw):
    body = children if isinstance(children, str) else "".join(children)
    a = attrs(**kw)
    return "<g%s>%s</g>" % (" " + a if a else "", body)


def text(x, y, s, size=10, fill=None, anchor="middle", weight="700", **kw):
    return '<text %s>%s</text>' % (
        attrs(x=x, y=y, font_size=size, fill=fill or P.INK,
              text_anchor=anchor, font_weight=weight,
              font_family="ui-rounded,system-ui,sans-serif", **kw), s)


# ------------------------------------------------------------- organic shapes

def blob(cx, cy, rx, ry, seed, points=9, rough=None):
    """A closed, hand-wobbled ellipse. The workhorse shape of the whole game."""
    r = rng(seed)
    rough = P.WOBBLE * 1.6 if rough is None else rough
    pts = []
    for i in range(points):
        a = (i / points) * math.tau
        pts.append((cx + math.cos(a) * (rx + jitter(r, rough)),
                    cy + math.sin(a) * (ry + jitter(r, rough))))
    return closed_spline(pts)


def closed_spline(pts):
    """Catmull-Rom through pts, converted to cubic beziers, closed."""
    k = len(pts)
    d = ["M%s %s" % (n(pts[0][0]), n(pts[0][1]))]
    for i in range(k):
        p0 = pts[(i - 1) % k]
        p1 = pts[i]
        p2 = pts[(i + 1) % k]
        p3 = pts[(i + 2) % k]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d.append("C%s %s %s %s %s %s" % (n(c1[0]), n(c1[1]), n(c2[0]),
                                         n(c2[1]), n(p2[0]), n(p2[1])))
    d.append("Z")
    return "".join(d)


def open_spline(pts):
    d = ["M%s %s" % (n(pts[0][0]), n(pts[0][1]))]
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d.append("C%s %s %s %s %s %s" % (n(c1[0]), n(c1[1]), n(c2[0]),
                                         n(c2[1]), n(p2[0]), n(p2[1])))
    return "".join(d)


def arc(cx, cy, r_, a0, a1, steps=10):
    """An open arc as a spline, angles in degrees, 0 = east, clockwise down."""
    pts = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        pts.append((cx + math.cos(a) * r_, cy + math.sin(a) * r_))
    return open_spline(pts)


def highlight(cx, cy, rx, ry, rot=-25, op=0.30):
    """The single soft specular mark that gives every object its roundness."""
    return ellipse(cx, cy, rx, ry, fill=P.WHITE, opacity=op,
                   transform="rotate(%s %s %s)" % (n(rot), n(cx), n(cy)))


def shade(d, op=0.14):
    """A darker form-shadow mark, used on the lower-right of round things."""
    return path(d, fill=P.SHADOW_HEX, opacity=op)


def contact_shadow(cx, cy, rx, ry=None, op=0.13):
    """The soft ellipse under an object that sits it on a surface."""
    return ellipse(cx, cy, rx, ry if ry is not None else rx * 0.32,
                   fill=P.SHADOW_HEX, opacity=op)


# ------------------------------------------------------------ small vocabulary

def berry(cx, cy, r_, color, seed, leaf=True):
    out = [path(blob(cx, cy, r_, r_ * 0.96, seed, 8, r_ * 0.10), fill=color),
           highlight(cx - r_ * 0.3, cy - r_ * 0.35, r_ * 0.32, r_ * 0.20, -30, .45)]
    if leaf:
        out.append(path(
            "M%s %s q %s %s %s %s q %s %s %s %s Z" % (
                n(cx), n(cy - r_ * 0.9), n(r_ * 0.7), n(-r_ * 0.7),
                n(r_ * 1.1), n(-r_ * 0.25), n(-r_ * 0.5), n(r_ * 0.55),
                n(-r_ * 1.1), n(r_ * 0.25)),
            fill=P.GREEN))
    return "".join(out)


def leaf(cx, cy, w_, h_, color=None, rot=0):
    color = color or P.GREEN
    d = "M%s %s C%s %s %s %s %s %s C%s %s %s %s %s %s Z" % (
        n(cx), n(cy - h_ / 2),
        n(cx + w_ / 2), n(cy - h_ / 4), n(cx + w_ / 2), n(cy + h_ / 4),
        n(cx), n(cy + h_ / 2),
        n(cx - w_ / 2), n(cy + h_ / 4), n(cx - w_ / 2), n(cy - h_ / 4),
        n(cx), n(cy - h_ / 2))
    return g(path(d, fill=color) +
             path("M%s %s L%s %s" % (n(cx), n(cy - h_ / 2), n(cx), n(cy + h_ / 2)),
                  stroke=P.GREEN_DEEP, w=0.8, opacity=0.45),
             transform="rotate(%s %s %s)" % (n(rot), n(cx), n(cy)))


def sparkle(cx, cy, r_, color=None, op=0.9):
    color = color or P.GLOW
    d = ("M%s %s Q%s %s %s %s Q%s %s %s %s Q%s %s %s %s Q%s %s %s %s Z" % (
        n(cx), n(cy - r_), n(cx + r_ * .18), n(cy - r_ * .18), n(cx + r_), n(cy),
        n(cx + r_ * .18), n(cy + r_ * .18), n(cx), n(cy + r_),
        n(cx - r_ * .18), n(cy + r_ * .18), n(cx - r_), n(cy),
        n(cx - r_ * .18), n(cy - r_ * .18), n(cx), n(cy - r_)))
    return path(d, fill=color, opacity=op)


def heart(cx, cy, r_, color=None):
    color = color or P.ROSE_DEEP
    d = ("M%s %s C%s %s %s %s %s %s C%s %s %s %s %s %s Z" % (
        n(cx), n(cy + r_ * .85),
        n(cx - r_ * 1.35), n(cy - r_ * .15), n(cx - r_ * .75), n(cy - r_ * 1.15), n(cx), n(cy - r_ * .35),
        n(cx + r_ * .75), n(cy - r_ * 1.15), n(cx + r_ * 1.35), n(cy - r_ * .15), n(cx), n(cy + r_ * .85)))
    return path(d, fill=color)


def steam(x, y, h_, seed, color=None, op=0.5):
    """Two wavy lines rising. Static in the sheet; CSS animates them."""
    r = rng(seed)
    color = color or P.WHITE
    out = []
    for i in (-1, 1):
        pts = [(x + i * 5 + jitter(r, 1.5), y - t * h_ / 4.0 + jitter(r, 1))
               for t in range(5)]
        out.append(path(open_spline(pts), stroke=color, w=2.4,
                        fill="none", stroke_linecap="round", opacity=op))
    return "".join(out)


def sprinkle_scatter(cx, cy, rx, ry, seed, count=9, colors=None):
    r = rng(seed)
    colors = colors or [P.JAM, P.SKY, P.LEMON, P.GREEN, P.ROSE, P.PLUM]
    out = []
    for i in range(count):
        a = r.random() * math.tau
        rad = math.sqrt(r.random())
        x = cx + math.cos(a) * rx * rad
        y = cy + math.sin(a) * ry * rad
        out.append(rect(x, y, 4.2, 1.9, 1, fill=colors[i % len(colors)],
                        transform="rotate(%s %s %s)" % (n(r.uniform(0, 180)),
                                                        n(x), n(y))))
    return "".join(out)


def drip_top(cx, cy, w_, seed, color, depth=6, lobes=5):
    """Frosting / glaze running over the top edge of a round thing."""
    r = rng(seed)
    x0 = cx - w_ / 2.0
    d = ["M%s %s" % (n(x0), n(cy - 1))]
    for i in range(lobes):
        xa = x0 + w_ * i / lobes
        xb = x0 + w_ * (i + 1) / lobes
        dip = depth * (1.0 if i % 2 else 0.45) + jitter(r, 1.0)
        d.append("Q%s %s %s %s" % (n((xa + xb) / 2.0), n(cy + dip),
                                   n(xb), n(cy - 1)))
    d.append("L%s %s L%s %s Z" % (n(x0 + w_), n(cy - 11), n(x0), n(cy - 11)))
    return path("".join(d), fill=color)


# -------------------------------------------------------------- PNG generation

def write_png(path_out, width, height, pixels):
    """Minimal RGBA PNG writer (stdlib only). pixels: list of (r,g,b,a) rows."""
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in pixels)

    def chunk(tag, data):
        c = tag + data
        return (struct.pack(">I", len(data)) + c +
                struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n" +
           chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) +
           chunk(b"IDAT", zlib.compress(raw, 9)) +
           chunk(b"IEND", b""))
    with open(path_out, "wb") as f:
        f.write(png)
    return len(png)


def grain_png(path_out, size=96, alpha=None, seed="grain"):
    """A small tileable paper-grain tile. Cheaper than an SVG filter, and it
    rasterises once instead of per-element."""
    alpha = P.GRAIN_ALPHA if alpha is None else alpha
    r = rng(seed)
    rows = []
    for _y in range(size):
        row = []
        for _x in range(size):
            v = r.randint(0, 255)
            a = int(alpha * (v / 255.0))
            row.append((70, 55, 40, a) if v < 128 else (255, 250, 240, a))
        rows.append(row)
    return write_png(path_out, size, size, rows)
