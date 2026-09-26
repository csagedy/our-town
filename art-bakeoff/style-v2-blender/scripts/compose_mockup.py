"""Composite mockup.png (2048x1536) from the background depth layers, the posed
characters (body + face layers) and a held prop.

Blender -b --factory-startup -P compose_mockup.py

This is the reference for how the engine places things:
  * World point -> screen: T.screen_px(bg cam_center, W, H, (x, y, z)) with shear.
  * A character sprite is placed so its anchor_px (feet) or seat_px (sitting)
    lands on that screen point; its face layers go at head_px.
  * Draw order = depth: bg_back, things behind the island, bg_island, things
    between island and table, bg_chairs, a seated character, bg_front.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import toonlib as T
import toonchar as C

S = T.SPRITES
meta = lambda n: json.load(open(os.path.join(S, n + ".json")))
BG = meta("bg_cafe_kitchen")


def world_px(p):
    return T.screen_px(BG["cam_center"][0], BG["cam_center"][1], BG["w"], BG["h"], p, shear=True)


def layer(img, name):
    T.over(img, T.load_rgba(os.path.join(S, BG["layers"][name]["file"])), 0, 0)


def shadow(img, cx, cy, rx, ry, alpha=0.16):
    """Soft-free flat contact shadow (hard-edged ellipse, like a Toca floor tone)."""
    H, W = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    a = np.clip((1 - d) * 6, 0, 1) * alpha
    ink = T.srgb("ink")
    img[..., :3] = img[..., :3] * (1 - a[..., None]) + ink * a[..., None]


def character(img, name, pose, emotion, world, key="anchor_px", hold=None, shadow_w=None):
    m = meta(name)
    p = m["poses"][pose]
    spr = C.compose_character(m, pose, emotion)
    sx, sy = world_px(world)
    x = int(round(sx - p[key][0]))
    y = int(round(sy - p[key][1]))
    if shadow_w and key == "anchor_px":
        shadow(img, sx, sy - 2, shadow_w, shadow_w * 0.22)
    T.over(img, spr, x, y)
    if hold:
        pm = meta(hold)
        pr = T.load_rgba(os.path.join(S, pm["file"]))
        hx = x + (p["hand_R_px"][0] + p["hand_L_px"][0]) / 2
        hy = y + (p["hand_R_px"][1] + p["hand_L_px"][1]) / 2
        T.over(img, pr, int(round(hx - pm["anchor_px"][0])), int(round(hy - pm["anchor_px"][1] + 14)))


def prop(img, name, world):
    pm = meta(name)
    sx, sy = world_px(world)
    T.over(img, T.load_rgba(os.path.join(S, pm["file"])), int(round(sx - pm["anchor_px"][0])),
           int(round(sy - pm["anchor_px"][1])))


def main():
    img = np.zeros((BG["h"], BG["w"], 4), np.float32)
    layer(img, "back")
    img[..., 3] = 1.0
    layer(img, "island")
    # between the island and the dining table
    character(img, "char_girl", "hold_up", "happy", (0.3, -1.2, 0.0), hold="prop_cupcake",
              shadow_w=95)
    character(img, "char_boy", "wave", "happy", (1.5, -1.45, 0.0), shadow_w=80)
    layer(img, "chairs")
    # seated on the left chair, behind the table
    character(img, "char_adult", "sit", "neutral", (-2.45, -1.3, 0.47), key="seat_px")
    layer(img, "front")
    prop(img, "prop_mug", (-2.02, -1.62, 0.76))
    prop(img, "prop_teapot", (-1.55, -1.75, 0.76))
    out = os.path.join(T.ROOT, "mockup.png")
    T.save_rgba(img, out)
    print("[mockup] wrote", out)


if __name__ == "__main__":
    main()
