"""Debug contact sheet: Blender -b -P contact_sheet.py -- out.png scale a.png b.png ...
Places sprites side by side on a warm backdrop (optionally upscaled) for review."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import toylib as T

args = sys.argv[sys.argv.index("--") + 1:]
out, scale, files = args[0], int(args[1]), args[2:]
imgs = [T.load_rgba(f) for f in files]
imgs = [np.repeat(np.repeat(i, scale, 0), scale, 1) for i in imgs]
gap = 20
W = sum(i.shape[1] for i in imgs) + gap * (len(imgs) + 1)
H = max(i.shape[0] for i in imgs) + gap * 2
sheet = np.zeros((H, W, 4), np.float32)
sheet[..., :3] = (0.93, 0.89, 0.84)
sheet[..., 3] = 1
x = gap
for i in imgs:
    T.over(sheet, i, x, H - gap - i.shape[0])
    x += i.shape[1] + gap
T.save_rgba(sheet, out)
