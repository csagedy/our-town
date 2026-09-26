"""Prop builders (shared by the prop sprites and the kitchen background) and the
prop sprite exports.

Blender -b --factory-startup -P props.py

Every builder takes loc = the world point where the prop's bottom-centre sits and
builds around it. Sizes are "toy scale" (about 1.3x real) so props read at 1x.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import toonlib as T

V = Vector


def cup(name, loc, r0, r1, h, mat, wall=0.012, fill=None, fill_level=0.8, segs=36, lip=True):
    """Open vessel (mug, bowl, pot, jar) with a visible inside + optional fill."""
    x, y, z = loc
    prof = [(0.0, 0.0), (r0 * 0.92, 0.0), (r0, 0.01), (r1, h), (r1 - wall, h),
            (r0 - wall, 0.02), (0.0, 0.02)]
    ob = T.lathe(name, prof, mat, loc=(x, y, z), segs=segs, smooth=True)
    for p in ob.data.polygons:
        p.use_smooth = False
    if fill:
        fr = r0 + (r1 - r0) * fill_level - wall
        T.cylinder(name + "_fill", (x, y, z + h * fill_level), fr, 0.006, fill, segs=segs)
    return ob


def leaf_pts(L, W, n=14, tip=1.0):
    """Pointed leaf outline in (x, z) with its base at the origin, pointing +z."""
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        w = W * math.sin(math.pi * t) ** 0.8 * (1 - 0.25 * t)
        left.append((-w / 2, t * L))
        right.append((w / 2, t * L))
    return left[:-1] + [(0, L * tip)] + right[::-1][1:-1]


def leaf(name, base, angle, L, W, color="leaf", yaw=0.0, depth=0.006):
    """Flat outlined leaf. angle: degrees from vertical (+ = leans to screen right)."""
    ob = T.prism(name, leaf_pts(L, W), depth, T.toon(color), loc=base,
                 rot=(0, angle, yaw))
    return ob


def potted_plant(name, loc, pot_r=0.08, pot_h=0.12, pot="terracotta", kind="leafy", n=9,
                 size=1.0, seed=1, colors=("leaf", "leaf_dark", "leaf_light")):
    rnd = random.Random(seed)
    x, y, z = loc
    if pot_r > 0.01:
        cup(name + "_pot", loc, pot_r * 0.78, pot_r, pot_h, T.toon(pot), fill=T.toon("wood_dark"),
            fill_level=0.86)
        T.cylinder(name + "_rim", (x, y, z + pot_h - 0.012), pot_r * 1.06, 0.03, T.toon(pot))
    top = z + pot_h
    objs = []
    for i in range(n):
        f = -1 + 2 * i / max(1, n - 1)
        if kind == "leafy":        # round-ish broad leaves fanning out
            ang = f * 62 + rnd.uniform(-8, 8)
            L = (0.13 + rnd.uniform(0, 0.06)) * size
            objs.append(leaf(f"{name}_lf{i}", (x + f * 0.02, y - 0.005 * i, top - 0.01), ang,
                             L, L * 0.62, rnd.choice(colors), yaw=rnd.uniform(-25, 25)))
        elif kind == "spiky":      # snake-plant / grass blades
            ang = f * 28 + rnd.uniform(-5, 5)
            L = (0.2 + rnd.uniform(0, 0.12)) * size
            objs.append(leaf(f"{name}_lf{i}", (x + f * 0.035, y - 0.004 * i, top - 0.01), ang,
                             L, 0.045 * size, rnd.choice(colors)))
        elif kind == "palm":       # long arching fronds
            ang = f * 70 + rnd.uniform(-6, 6)
            L = (0.5 + rnd.uniform(0, 0.25)) * size
            objs.append(leaf(f"{name}_lf{i}", (x + f * 0.03, y - 0.004 * i, top - 0.02), ang,
                             L, 0.16 * size, rnd.choice(colors), yaw=rnd.uniform(-20, 20)))
        elif kind == "succulent":
            ang = f * 75
            L = 0.07 * size * (1.2 - 0.4 * abs(f))
            objs.append(leaf(f"{name}_lf{i}", (x + f * 0.01, y - 0.003 * (n - abs(i - n / 2)),
                                               top), ang, L, L * 0.55, rnd.choice(colors)))
    return objs


def trailing_vine(name, top, length, seed=3, color_set=("leaf", "leaf_dark"), sway=0.08,
                  leaf_size=0.07):
    """A stem hanging down from `top` with alternating heart-ish leaves."""
    rnd = random.Random(seed)
    x, y, z = top
    pts = []
    n = max(4, int(length / 0.08))
    for i in range(n + 1):
        t = i / n
        pts.append((x + sway * math.sin(t * 3.0 + seed), y - 0.01, z - t * length))
    T.tube(name + "_stem", pts, 0.006, T.toon("olive"), line=False)
    for i in range(1, n + 1):
        px, py, pz = pts[i]
        side = 1 if i % 2 else -1
        ang = 180 - side * rnd.uniform(35, 70)
        s = leaf_size * rnd.uniform(0.8, 1.15)
        leaf(f"{name}_vl{i}", (px, py - 0.004 * (i % 3), pz), ang, s, s * 0.7,
             rnd.choice(color_set), yaw=rnd.uniform(-20, 20))


# ----------------------------------------------------------------------------
# Hero props (also exported as sprites)
# ----------------------------------------------------------------------------
def cupcake(loc, s=1.0, frost="pink", case="sage"):
    x, y, z = loc
    fl = lambda a, zz: 1.0 + 0.06 * abs(math.sin(a * 8))
    T.lathe("cc_case", [(0, 0), (0.055 * s, 0), (0.072 * s, 0.07 * s), (0.0, 0.07 * s)],
            T.stripes(case, "cream", 0.024 * s, axis="x", duty=0.6), loc=loc, segs=48,
            radial_fn=fl, smooth=False)
    for i, (r, zz) in enumerate(((0.078, 0.085), (0.062, 0.115), (0.042, 0.14))):
        tor = T.sphere(f"cc_fr{i}", (x, y, z + zz * s), (r * s, r * s, 0.03 * s), T.toon(frost),
                       segs=32, rings=14)
        T._subsurf(tor)
    T.sphere("cc_cherry", (x + 0.004, y, z + 0.175 * s), 0.024 * s, T.toon("tomato"), segs=20,
             rings=12)
    T.tube("cc_stem", [(x + 0.004, y, z + 0.19 * s), (x + 0.012, y, z + 0.215 * s),
                       (x + 0.028, y, z + 0.228 * s)], 0.004 * s, T.toon("olive"), line=True)
    for i in range(7):   # sprinkles
        a = i * 2.3
        T.box(f"cc_sp{i}", (x + math.cos(a) * 0.045 * s, y - 0.06 * s + 0.01 * (i % 3),
                            z + (0.1 + 0.012 * (i % 3)) * s), (0.018 * s, 0.006, 0.007 * s),
              T.toon(("butter", "sky", "cream", "sage")[i % 4], shade=False), rot=(0, a * 40, 0),
              line=False)


def frying_pan(loc, s=1.0, egg=True):
    x, y, z = loc
    cup("pan", loc, 0.11 * s, 0.14 * s, 0.04 * s, T.toon("charcoal"), wall=0.01)
    T.capsule("pan_handle", (x + 0.14 * s, y, z + 0.035 * s), (x + 0.33 * s, y, z + 0.06 * s),
              0.017 * s, T.toon("wood_dark"))
    if egg:
        wh = T.sphere("egg_white", (x - 0.01, y, z + 0.024 * s), (0.085 * s, 0.07 * s, 0.01 * s),
                      T.toon("white"), segs=28, rings=10)
        T._subsurf(wh)
        T.sphere("egg_yolk", (x + 0.005, y - 0.01, z + 0.034 * s), (0.032 * s, 0.03 * s, 0.018 * s),
                 T.toon("mustard"), segs=20, rings=10)


def teapot(loc, s=1.0, body="sage", dotc="cream"):
    x, y, z = loc
    mat = T.dots(body, dotc, 0.045 * s, 0.009 * s, axes="xz")
    T.lathe("tp_body", [(0, 0), (0.07 * s, 0), (0.1 * s, 0.04 * s), (0.105 * s, 0.075 * s),
                        (0.085 * s, 0.12 * s), (0.05 * s, 0.135 * s), (0, 0.135 * s)], mat,
            loc=loc, segs=40, subsurf=1)
    T.lathe("tp_lid", [(0, 0), (0.052 * s, 0), (0.04 * s, 0.018 * s), (0, 0.022 * s)],
            T.toon(body), loc=(x, y, z + 0.13 * s), segs=32)
    T.sphere("tp_knob", (x, y, z + 0.165 * s), 0.016 * s, T.toon("rose"), segs=16, rings=10)
    T.tube("tp_spout", [(x - 0.08 * s, y, z + 0.05 * s), (x - 0.14 * s, y, z + 0.08 * s),
                        (x - 0.165 * s, y, z + 0.13 * s)], 0.017 * s, T.toon(body), line=True)
    T.torus("tp_handle", (x + 0.105 * s, y, z + 0.075 * s), 0.042 * s, 0.012 * s, T.toon(body),
            rot=(90, 0, 0), arc=(-80, 80))


def mug(loc, s=1.0, color="terracotta", fill="choc_milk"):
    x, y, z = loc
    T.PALETTE.setdefault("choc_milk", "#A8765A")
    T.PALETTE.setdefault("foam", "#F1E2CC")
    cup("mug", loc, 0.05 * s, 0.052 * s, 0.1 * s, T.toon(color), fill=T.toon("foam"),
        fill_level=0.88)
    T.torus("mug_h", (x + 0.055 * s, y, z + 0.05 * s), 0.028 * s, 0.009 * s, T.toon(color),
            rot=(90, 0, 0), arc=(-90, 90))
    T.prism("mug_heart", T.heart_pts(0.018 * s), 0.004, T.toon("choc_milk", shade=False),
            loc=(x, y + 0.0, z + 0.095 * s), rot=(90, 0, 0), line=False)


def layer_cake(loc, s=1.0):
    x, y, z = loc
    # cake stand
    T.lathe("ck_stand", [(0, 0), (0.07 * s, 0), (0.06 * s, 0.01 * s), (0.018 * s, 0.03 * s),
                         (0.018 * s, 0.07 * s), (0.15 * s, 0.075 * s), (0.15 * s, 0.085 * s),
                         (0, 0.085 * s)], T.toon("white"), loc=loc, segs=40, smooth=False)
    base = z + 0.085 * s
    T.cylinder("ck_body", (x, y, base + 0.07 * s), 0.12 * s, 0.14 * s,
               T.stripes("peach", "cream", 0.047 * s, axis="z", duty=0.72, offset=-0.0))
    T.cylinder("ck_top", (x, y, base + 0.146 * s), 0.126 * s, 0.018 * s, T.toon("pink"))
    for i in range(9):   # frosting drips
        a = math.radians(200 + i * 16)
        T.capsule(f"ck_drip{i}", (x + math.cos(a) * 0.123 * s, y + math.sin(a) * 0.123 * s,
                                  base + 0.14 * s),
                  (x + math.cos(a) * 0.123 * s, y + math.sin(a) * 0.123 * s,
                   base + (0.105 - 0.02 * (i % 2)) * s), 0.013 * s, T.toon("pink"))
    for i, dx in enumerate((-0.06, 0.0, 0.06)):
        T.sphere(f"ck_berry{i}", (x + dx * s, y + 0.02 * (i % 2) * s, base + 0.175 * s),
                 (0.024 * s, 0.024 * s, 0.028 * s), T.toon("tomato"), segs=16, rings=10)


def tomato(loc, s=1.0):
    x, y, z = loc
    t = T.sphere("tom", (x, y, z + 0.05 * s), (0.065 * s, 0.065 * s, 0.052 * s), T.toon("tomato"),
                 segs=28, rings=14)
    T._subsurf(t)
    for i in range(5):
        a = math.radians(90 + i * 72)
        T.prism(f"tom_leaf{i}", leaf_pts(0.035 * s, 0.018 * s), 0.004, T.toon("olive"),
                loc=(x, y - 0.01, z + 0.1 * s), rot=(90, 0, math.degrees(a)), line=True)


PROPS = {
    "prop_cupcake": cupcake,
    "prop_frying_pan": frying_pan,
    "prop_teapot": teapot,
    "prop_mug": mug,
    "prop_layer_cake": layer_cake,
    "prop_tomato": tomato,
}

if __name__ == "__main__":
    ppm, lpx = T.PPM, T.LINE_PX
    for scale, suffix in ((1, ""), (2, "@2x")):
        T.PPM, T.LINE_PX = ppm * scale, lpx * scale   # @2x: same look, twice the pixels
        for name, fn in PROPS.items():
            T.reset()
            fn((0, 0, 0), s=1.0)
            T.export_sprite(name + suffix, shear=True)
    T.PPM, T.LINE_PX = ppm, lpx
