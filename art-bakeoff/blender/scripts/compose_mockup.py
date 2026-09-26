"""Composite the in-game mockup (2048x1536) from the rendered sprites.
Blender -b -P compose_mockup.py

Placement is in WORLD metres (same space the background was modelled in), so this
doubles as a reference for how the game engine maps world -> screen:
    pixel = toylib.origin_px(bg_cx, bg_cy, W, H, world) - sprite.anchor_px
Characters are assembled from body + eye layer + mouth layer, exactly as the game would.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import toylib as T

S = T.SPRITES
meta = lambda n: json.load(open(os.path.join(S, n + ".json")))


def blob_shadow(dst, cx, cy, w, h, alpha=0.28):
    H, W = dst.shape[:2]
    x0, x1 = int(max(0, cx - w)), int(min(W, cx + w))
    y0, y1 = int(max(0, cy - h)), int(min(H, cy + h))
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = ((xx - cx) / (w / 2)) ** 2 + ((yy - cy) / (h / 2)) ** 2
    a = np.clip(1.15 - d, 0, 1) ** 1.5 * alpha
    ink = np.array(T.col("#8A5A44")[:3]) ** (1 / 2.2)
    region = dst[y0:y1, x0:x1]
    region[..., :3] = region[..., :3] * (1 - a[..., None]) + ink * a[..., None]


def place(dst, bg, name, world, layers=None, shadow=0.7):
    m = meta(name)
    ax, ay = T.origin_px(bg["cam_center"][0], bg["cam_center"][1], bg["w"], bg["h"], world)
    x, y = int(round(ax - m["anchor_px"][0])), int(round(ay - m["anchor_px"][1]))
    if shadow:
        blob_shadow(dst, ax, ay, m["w"] * shadow, m["w"] * shadow * 0.22)
    T.over(dst, T.load_rgba(os.path.join(S, m["file"])), x, y)
    for key in layers or []:
        L = m["layers"][key]
        T.over(dst, T.load_rgba(os.path.join(S, L["file"])), x + L["offset"][0], y + L["offset"][1])


def main():
    bg = meta("bg_cafe_kitchen")
    img = T.load_rgba(os.path.join(S, bg["file"]))
    img[..., 3] = 1.0
    # props on counters / stove (counter top z=0.905, cooktop z=0.935)
    place(img, bg, "prop_tomato_whole", (-1.05, 0.33, 0.94), shadow=0.5)
    place(img, bg, "prop_tomato_sliced", (-0.75, 0.3, 0.94), shadow=0.45)
    place(img, bg, "prop_frying_pan", (-0.02, 0.3, 0.94), shadow=0.35)
    place(img, bg, "prop_mixing_bowl", (1.62, 0.35, 0.905), shadow=0.5)
    place(img, bg, "prop_cupcake", (1.98, 0.2, 0.905), shadow=0.55)
    # kids in front of the counters, faces assembled from layers
    place(img, bg, "char_little_kid", (-1.6, -0.75, 0.0), ["eyes_happy", "mouth_laugh"])
    place(img, bg, "char_big_kid", (0.9, -0.62, 0.0), ["eyes_open", "mouth_smile"])
    out = os.path.join(T.ROOT, "mockup.png")
    T.save_rgba(img, out)
    print("[mockup] wrote", out)


if __name__ == "__main__":
    main()
