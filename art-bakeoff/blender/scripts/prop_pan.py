"""Frying pan prop (enamel toy pan, wooden handle).  Blender -b -P prop_pan.py"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toylib as T

TILT = 16      # tipped toward the camera so the cooking surface reads


def build():
    T.reset()
    root = T.empty("pan", (0, 0, 0.0), (TILT, 0, -18))
    shell = [(0.0, 0.0), (0.13, 0.0), (0.16, 0.008), (0.178, 0.03), (0.19, 0.06),
             (0.195, 0.066), (0.182, 0.068), (0.172, 0.04), (0.155, 0.02), (0.12, 0.014),
             (0.0, 0.014)]
    T.lathe("pan_shell", shell, T.gloss("teal", 0.3), parent=root)
    T.lathe("pan_surface", [(0.0, 0.016), (0.13, 0.016), (0.152, 0.024), (0.0, 0.024)],
            T.clay("iron", rough=0.45, sss=0.0, spec=0.5), parent=root, outline=False)
    # handle: steel neck, wooden grip with a hanging hole
    T.capsule("neck", (0.17, 0, 0.05), (0.26, 0, 0.075), 0.018, T.clay("steel", 0.3, 0.0),
              parent=root)
    T.capsule("grip", (0.25, 0, 0.073), (0.44, 0, 0.098), 0.03, T.clay("wood", 0.55),
              r1=0.034, parent=root)
    T.torus("hole", (0.41, -0.0, 0.094), 0.012, 0.005, T.clay("wood_dark", 0.6),
            rot=(90, -8, 0), parent=root, outline=False)


if __name__ == "__main__":
    build()
    T.export_sprite("prop_frying_pan")
