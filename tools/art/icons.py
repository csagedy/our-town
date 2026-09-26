"""Placeholder app icons, drawn with the Python stdlib only.

A friendly round "buddy" (the same one the boot stage shows) on a warm sunny
gradient. Shapes are signed-distance functions, so edges are anti-aliased
without supersampling. The design is temporary: P1.12 (art pipeline) owns the
real icon and can replace `draw_icon` without touching the PNG writer.
"""
import math
import os
import struct
import zlib

SIZES = (180, 192, 512)

# Palette (keep in sync with the buddy SVG in src/scenes/boot.js).
SKY_TOP = (255, 214, 110)
SKY_BOTTOM = (255, 150, 122)
BODY = (91, 192, 235)
BODY_SHADE = (62, 160, 214)
WHITE = (255, 255, 255)
INK = (43, 45, 66)
CHEEK = (255, 122, 150)


def write_png(path, size, pixels):
    """pixels: bytearray of RGB rows, size x size."""
    stride = size * 3
    raw = b''.join(b'\x00' + bytes(pixels[y * stride:(y + 1) * stride]) for y in range(size))

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


# --- signed distance shapes, in unit coordinates (0..1) -----------------------

def sd_ellipse(cx, cy, rx, ry):
    k = min(rx, ry)
    return (lambda x, y: (math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * k,
            (cx - rx, cy - ry, cx + rx, cy + ry))


def sd_circle(cx, cy, r):
    return sd_ellipse(cx, cy, r, r)


def sd_arc(cx, cy, r, a0, a1, thick):
    """Arc from angle a0 to a1 (radians, y down), round caps."""
    ends = [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in (a0, a1)]

    def f(x, y):
        a = math.atan2(y - cy, x - cx)
        if a0 <= a <= a1:
            return abs(math.hypot(x - cx, y - cy) - r) - thick / 2
        return min(math.hypot(x - ex, y - ey) for ex, ey in ends) - thick / 2
    pad = r + thick
    return f, (cx - pad, cy - pad, cx + pad, cy + pad)


def paint(buf, size, shape, color, alpha=1.0):
    f, (x0, y0, x1, y1) = shape
    px0, py0 = max(0, int(x0 * size) - 2), max(0, int(y0 * size) - 2)
    px1, py1 = min(size, int(x1 * size) + 3), min(size, int(y1 * size) + 3)
    for py in range(py0, py1):
        v = (py + 0.5) / size
        row = py * size * 3
        for px in range(px0, px1):
            d = f((px + 0.5) / size, v) * size          # distance in pixels
            cov = 0.5 - d
            if cov <= 0:
                continue
            a = alpha * (1.0 if cov >= 1 else cov)
            i = row + px * 3
            for c in range(3):
                buf[i + c] = int(buf[i + c] * (1 - a) + color[c] * a + 0.5)


def draw_icon(size):
    buf = bytearray(size * size * 3)
    for py in range(size):                                # vertical gradient
        t = py / (size - 1)
        col = bytes(int(SKY_TOP[c] + (SKY_BOTTOM[c] - SKY_TOP[c]) * t) for c in range(3))
        buf[py * size * 3:(py + 1) * size * 3] = col * size

    paint(buf, size, sd_ellipse(0.5, 0.86, 0.30, 0.05), INK, 0.18)        # ground shadow
    paint(buf, size, sd_ellipse(0.5, 0.56, 0.33, 0.31), BODY_SHADE)       # body
    paint(buf, size, sd_ellipse(0.49, 0.53, 0.31, 0.29), BODY)
    for ex in (0.39, 0.61):                                               # eyes
        paint(buf, size, sd_ellipse(ex, 0.48, 0.065, 0.075), WHITE)
        paint(buf, size, sd_circle(ex + 0.01, 0.495, 0.035), INK)
        paint(buf, size, sd_circle(ex + 0.022, 0.48, 0.011), WHITE)
    for cx in (0.31, 0.69):                                               # cheeks
        paint(buf, size, sd_ellipse(cx, 0.585, 0.045, 0.028), CHEEK, 0.75)
    paint(buf, size, sd_arc(0.5, 0.56, 0.085, math.radians(25), math.radians(155), 0.028), INK)  # smile
    return buf


def build_icons(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for size in SIZES:
        path = os.path.join(out_dir, 'icon-%d.png' % size)
        write_png(path, size, draw_icon(size))
        written.append(path)
    return written
