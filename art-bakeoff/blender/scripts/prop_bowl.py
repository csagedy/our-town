"""Mixing bowl prop with batter and a wooden spoon.  Blender -b -P prop_bowl.py"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector
import toylib as T

TILT = 12


def build():
    T.reset()
    root = T.empty("bowl", (0, 0, 0), (TILT, 0, 0))
    R, H = 0.22, 0.17
    outer = [(0.0, 0.0), (0.09, 0.0)]
    for i in range(1, 13):
        t = i / 12 * math.pi / 2
        outer.append((0.09 + (R - 0.09) * math.sin(t), H * (1 - math.cos(t)) + 0.0))
    outer += [(R + 0.012, H + 0.004), (R + 0.006, H + 0.016), (R - 0.012, H + 0.012)]
    inner = []
    for i in range(12, -1, -1):
        t = i / 12 * math.pi / 2
        inner.append(((R - 0.016) * math.sin(t) * 0.97 + 0.0, 0.02 + (H - 0.01) * (1 - math.cos(t))))
    shell = outer + inner + [(0.0, 0.02)]
    T.lathe("bowl_out", shell, T.gloss("sky", 0.35), parent=root)
    T.lathe("bowl_foot", [(0.0, -0.004), (0.1, -0.004), (0.104, 0.012), (0.0, 0.012)],
            T.clay("blue", 0.5), parent=root)
    # inside colour + batter surface
    T.lathe("bowl_in", [(0.0, 0.021)] + [(p[0] - 0.002, p[1] + 0.001) for p in inner[::-1]][1:],
            T.clay("cream", 0.5), parent=root, outline=False)
    batter = T.cylinder("batter", (0, 0, 0.1), 0.185, 0.02, T.clay("butter", 0.35, 0.2),
                        bevel=0.009, parent=root, outline=False)
    T.torus("batter_swirl", (0.0, 0.0, 0.112), 0.07, 0.012, T.clay("#FFE3A0", 0.35),
            parent=root, outline=False, arc=(20, 330))
    # wooden spoon leaning on the rim
    s0, s1 = Vector((-0.02, 0.03, 0.09)), Vector((0.2, 0.08, 0.4))
    T.capsule("spoon_handle", s0, s1, 0.015, T.clay("wood", 0.55), parent=root)
    T.sphere("spoon_head", s0 + Vector((-0.02, 0, -0.01)), (0.05, 0.035, 0.022),
             T.clay("wood", 0.55), rot=(0, 30, 10), parent=root)
    # stripe band around the bowl for charm
    T.torus("band", (0, 0, 0.1), R * 0.955, 0.011, T.gloss("white", 0.35), parent=root,
            outline=False)


if __name__ == "__main__":
    build()
    T.export_sprite("prop_mixing_bowl")
