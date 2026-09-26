"""sheet.png: every pose of every character (faces composited from layers),
an expression strip per character (5 emotions on the standing body, head crops),
and the props at @2x.

Blender -b --factory-startup -P compose_sheet.py
Rows: girl, boy, adult. Columns: stand, wave, hold_up (holding a cupcake), cheer,
walk (3/4 face set), sit | neutral, happy, surprised, sad, sleepy.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import toonlib as T
import toonchar as C

S = T.SPRITES
meta = lambda n: json.load(open(os.path.join(S, n + ".json")))
POSE_EMO = {"stand": "neutral", "wave": "happy", "hold_up": "surprised", "cheer": "happy",
            "walk": "neutral", "sit": "sleepy"}
EMOS = ["neutral", "happy", "surprised", "sad", "sleepy"]
GAP = 28


def fill(img, x0, y0, x1, y1, color):
    img[y0:y1, x0:x1, :3] = T.srgb(color)
    img[y0:y1, x0:x1, 3] = 1


def main():
    rows = []
    for name in ("char_girl", "char_boy", "char_adult"):
        m = meta(name)
        tiles = []
        for pn in C.POSE_ORDER:
            t = C.compose_character(m, pn, POSE_EMO[pn])
            if pn == "hold_up":
                p = m["poses"][pn]
                pm = meta("prop_cupcake")
                pr = T.load_rgba(os.path.join(S, pm["file"]))
                hx = (p["hand_R_px"][0] + p["hand_L_px"][0]) / 2
                hy = (p["hand_R_px"][1] + p["hand_L_px"][1]) / 2
                T.over(t, pr, int(hx - pm["anchor_px"][0]), int(hy - pm["anchor_px"][1] + 14))
            tiles.append(("pose", t))
        p = m["poses"]["stand"]
        r = int(m["face_front"]["eyes_open"]["center_px"][0] * 1.3)
        hx, hy = int(p["head_px"][0]), int(p["head_px"][1] - r * 0.12)
        for e in EMOS:
            t = C.compose_character(m, "stand", e)
            pad = np.zeros((t.shape[0] + 2 * r, t.shape[1] + 2 * r, 4), np.float32)
            pad[r:r + t.shape[0], r:r + t.shape[1]] = t
            tiles.append(("face", pad[hy:hy + 2 * r, hx:hx + 2 * r].copy()))
        rows.append(tiles)
    props = [T.load_rgba(os.path.join(S, n + "@2x.png")) for n in
             ("prop_cupcake", "prop_frying_pan", "prop_teapot", "prop_mug", "prop_layer_cake",
              "prop_tomato")]
    row_h = [max(t.shape[0] for _, t in r) for r in rows] + [max(p.shape[0] for p in props)]
    row_w = [sum(t.shape[1] for _, t in r) + GAP * (len(r) + 2) for r in rows]
    row_w.append(sum(p.shape[1] for p in props) + GAP * (len(props) + 1))
    W = max(row_w) + GAP
    H = sum(row_h) + GAP * (len(row_h) * 2 + 1)
    img = np.zeros((H, W, 4), np.float32)
    fill(img, 0, 0, W, H, "cream")
    y = GAP
    for r, h in zip(rows + [None], row_h):
        fill(img, GAP // 2, y - GAP // 2, W - GAP // 2, y + h + GAP // 2, "white")
        x = GAP
        if r is None:
            for p in props:
                T.over(img, p, x, y + h - p.shape[0])
                x += p.shape[1] + GAP
        else:
            first_face = True
            for kind, t in r:
                if kind == "face" and first_face:
                    fill(img, x, y, x + 4, y + h, "oat")
                    x += GAP
                    first_face = False
                yy = y + h - t.shape[0] if kind == "pose" else y + (h - t.shape[0]) // 2
                T.over(img, t, x, yy)
                x += t.shape[1] + GAP
        y += h + GAP * 2
    out = os.path.join(T.ROOT, "sheet.png")
    T.save_rgba(img, out)
    print("[sheet] wrote", out, W, H)


if __name__ == "__main__":
    main()
