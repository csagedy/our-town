"""Cupcake prop: fluted wrapper, swirl frosting, sprinkles, cherry.
Blender -b -P prop_cupcake.py"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix
import toylib as T

SPRINKLES = ["butter", "sky", "mint", "white", "lilac", "coral"]


def build():
    T.reset()
    rnd = random.Random(7)
    root = T.empty("cupcake", (0, 0, 0), (6, 0, 0))
    flute = lambda a, z: 1.0 + 0.045 * max(0.0, math.cos(18 * a)) ** 0.6
    T.lathe("wrapper", [(0.0, 0.0), (0.072, 0.0), (0.078, 0.006), (0.098, 0.09),
                        (0.093, 0.095), (0.0, 0.095)],
            T.clay("mint", rough=0.55), segs=144, radial_fn=flute, parent=root)
    T.sphere("cake", (0, 0, 0.098), (0.1, 0.1, 0.03), T.clay("choc", 0.7), parent=root)
    frost = T.clay("pink", rough=0.4, sss=0.2, sheen=0.1)
    tiers = [(0.087, 0.03, 0.118), (0.066, 0.028, 0.162), (0.043, 0.024, 0.2)]
    for i, (R, r, z) in enumerate(tiers):
        T.torus(f"swirl{i}", (0, 0, z), R, r + 0.004, frost, rot=(0, 0, i * 40), parent=root)
    T.sphere("dollop", (0, 0, 0.214), (0.04, 0.04, 0.036), frost, parent=root)
    # sprinkles scattered on the tier surfaces that face the camera
    for k in range(34):
        R, r, z = tiers[k % 3]
        a = rnd.uniform(-math.pi * 0.95, -math.pi * 0.05)
        b = rnd.uniform(0.1, 1.2)
        p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a),
                    z + r * math.sin(b)))
        n = Vector((math.cos(b) * math.cos(a), math.cos(b) * math.sin(a), math.sin(b)))
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        d = (d - n * d.dot(n)).normalized() * 0.009
        c = SPRINKLES[k % len(SPRINKLES)]
        T.capsule(f"spr{k}", p - d + n * 0.001, p + d + n * 0.001, 0.0045,
                  T.gloss(c, 0.35), parent=root, outline=False)
    # cherry + stem
    T.sphere("cherry", (0.005, -0.005, 0.268), 0.034, T.gloss("tomato", 0.15), parent=root)
    T.tube("cherry_stem", [(0.005, -0.005, 0.29), (0.012, -0.004, 0.32), (0.03, 0.0, 0.345)],
           0.004, T.clay("leaf_dark", 0.5), parent=root, outline=True)


if __name__ == "__main__":
    build()
    T.export_sprite("prop_cupcake")
