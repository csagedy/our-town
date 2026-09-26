"""Cafe kitchen background, rendered as DEPTH LAYERS so characters can stand
between the back counter, the island and the dining table.

Blender -b --factory-startup -P bg_cafe_kitchen.py

Layers (all 2048x1536, same camera; composite back to front):
  bg_back    walls, floor, rug, back counters, fridge, shelves, window, lamps
  bg_island  the kitchen island + its stools (characters stand behind OR in front)
  bg_chairs  the two chairs behind the dining table (a sitter goes after this)
  bg_front   dining table, front stools, big floor plant

World: x right, y away from camera, z up. Back wall face at y = 1.2.
"""
import sys, os, math, random, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import toonlib as T
import props as P

W_PX, H_PX = 2048, 1536
CX, CY = 0.0, 1.42           # camera centre (x, sheared z)
WALL_Y = 1.2
CT = 0.92                     # counter top height
_layer = ["back"]


def tag_new(before, layer):
    for ob in bpy.context.scene.objects:
        if ob.name not in before:
            ob["layer"] = layer


class layer:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.before = set(o.name for o in bpy.context.scene.objects)

    def __exit__(self, *a):
        tag_new(self.before, self.name)


toon = T.toon
rnd = random.Random(7)


# ----------------------------------------------------------------------------
def room():
    # floor boards + back wall bricks + white dollhouse frame posts
    T.slab("floor", -3.6, 3.6, -3.0, WALL_Y + 0.05, -0.1, 0.0,
           T.planks("floor", "floor_line", width=0.22, length=1.4))
    T.slab("wall", -3.6, 3.6, WALL_Y, WALL_Y + 0.1, 0.0, 3.6, T.bricks(scale=1.0))
    # plaster column behind the window + ceiling beam
    T.slab("plaster", -1.12, 0.42, WALL_Y - 0.01, WALL_Y, 0.0, 3.6, toon("cream", shade=False))
    T.slab("beam", -3.6, 3.6, WALL_Y - 0.12, WALL_Y, 3.3, 3.6, toon("wood_light"))
    T.slab("skirting", -3.6, 3.6, WALL_Y - 0.03, WALL_Y, 0.0, 0.1, toon("white"))
    for x in (-3.2, 3.2):
        T.slab(f"post{x}", x - 0.07, x + 0.07, WALL_Y - 0.14, WALL_Y, 0.0, 3.6, toon("white"))
    # round rug under the dining table (flat on the floor)
    T.cylinder("rug", (-2.05, -1.72, 0.004), 1.05, 0.008, toon("oat", shade=False), segs=64)
    T.cylinder("rug_in", (-2.05, -1.72, 0.01), 0.88, 0.006,
               toon("cream", shade=False), segs=64)
    # a runner by the island
    T.slab("runner", -0.35, 1.25, -1.35, -1.0, 0.0, 0.01, T.stripes("sage", "cream", 0.1,
                                                                        axis="x", duty=0.7))


def shelf(name, x0, x1, z, depth=0.28, brackets=True):
    T.slab(name, x0, x1, WALL_Y - depth, WALL_Y, z - 0.035, z, toon("wood"))
    if brackets:
        for bx in (x0 + 0.12, x1 - 0.12):
            T.slab(f"{name}_br{bx:.2f}", bx - 0.02, bx + 0.02, WALL_Y - depth * 0.6, WALL_Y,
                   z - 0.12, z - 0.035, toon("wood_dark"))


def jar(name, loc, r, h, body="sky_light", lid="wood", fill=None):
    x, y, z = loc
    T.cylinder(name, (x, y, z + h / 2), r, h, toon(body), segs=28)
    if fill:
        T.cylinder(name + "_in", (x, y - r * 0.5, z + h * 0.35), r * 0.86, h * 0.6, toon(fill),
                   segs=28)
    T.cylinder(name + "_lid", (x, y, z + h + 0.015), r * 1.05, 0.03, toon(lid), segs=28)


def bottle(name, loc, r, h, color="olive", cap="wood_dark"):
    x, y, z = loc
    T.lathe(name, [(0, 0), (r, 0), (r, h * 0.62), (r * 0.4, h * 0.82), (r * 0.36, h),
                   (0, h)], toon(color), loc=loc, segs=24, smooth=False)
    T.cylinder(name + "_cap", (x, y, z + h + 0.015), r * 0.42, 0.03, toon(cap), segs=16)
    T.slab(name + "_lbl", x - r * 0.9, x + r * 0.9, y - r - 0.004, y - r + 0.01, z + h * 0.18,
           z + h * 0.48, toon("cream"))


def plates(name, loc, r=0.1, n=5, color="white"):
    x, y, z = loc
    for i in range(n):
        T.cylinder(f"{name}{i}", (x, y, z + 0.012 + i * 0.022), r, 0.018,
                   toon(color if i % 2 == 0 else "cream"), segs=36)


def basket(name, loc, w, h, d=0.18, handle=True):
    x, y, z = loc
    T.slab(name, x - w / 2, x + w / 2, y - d / 2, y + d / 2, z, z + h,
           T.stripes("basket", "basket_dark", 0.035, axis="z", duty=0.55))
    T.slab(name + "_rim", x - w / 2 - 0.01, x + w / 2 + 0.01, y - d / 2 - 0.01, y + d / 2 + 0.01,
           z + h - 0.025, z + h + 0.005, toon("basket_dark"))
    if handle:
        T.torus(name + "_h", (x, y, z + h), w * 0.32, 0.012, toon("basket_dark"), rot=(90, 0, 0),
                arc=(0, 180))


def book_stack(name, loc, n=3, w=0.2):
    x, y, z = loc
    cols = ["terracotta", "sage", "mustard", "rose", "teal", "oat"]
    for i in range(n):
        ww = w - 0.02 * (i % 2)
        T.slab(f"{name}{i}", x - ww / 2 + 0.01 * (i % 2), x + ww / 2, y - 0.08, y + 0.08,
               z + i * 0.035, z + (i + 1) * 0.035, toon(cols[(i + len(name)) % len(cols)]))


def books_upright(name, x0, loc_y, z, n=5):
    cols = ["terracotta", "sage", "mustard", "rose", "teal", "plum", "oat"]
    x = x0
    for i in range(n):
        w = 0.035 + 0.012 * ((i * 7) % 3)
        h = 0.2 + 0.03 * ((i * 5) % 3)
        T.slab(f"{name}{i}", x, x + w, loc_y - 0.08, loc_y + 0.08, z, z + h,
               toon(cols[(i * 3 + len(name)) % len(cols)]))
        T.slab(f"{name}{i}_b", x, x + w, loc_y - 0.085, loc_y + 0.08, z + h * 0.7, z + h * 0.78,
               toon("cream"), line=False)
        x += w + 0.004
    return x


def lantern(name, loc, s=1.0):
    x, y, z = loc
    T.cylinder(name + "_base", (x, y, z + 0.015 * s), 0.06 * s, 0.03 * s, toon("rust"))
    T.cylinder(name + "_glass", (x, y, z + 0.1 * s), 0.045 * s, 0.14 * s, toon("bulb",
               shade=False))
    T.cylinder(name + "_flame", (x, y - 0.03 * s, z + 0.09 * s), 0.012 * s, 0.04 * s,
               toon("mustard", shade=False), radius2=0.002, line=False)
    for dx in (-1, 1):
        T.capsule(name + f"_bar{dx}", (x + dx * 0.048 * s, y - 0.02, z + 0.03 * s),
                  (x + dx * 0.048 * s, y - 0.02, z + 0.17 * s), 0.008 * s, toon("rust"))
    T.cylinder(name + "_top", (x, y, z + 0.185 * s), 0.06 * s, 0.03 * s, toon("rust"),
               radius2=0.02 * s)
    T.torus(name + "_ring", (x, y, z + 0.215 * s), 0.025 * s, 0.006 * s, toon("rust"),
            rot=(90, 0, 0))


def egg_carton(name, loc):
    x, y, z = loc
    T.slab(name, x - 0.16, x + 0.16, y - 0.08, y + 0.08, z, z + 0.05, toon("warm_grey"))
    for i in range(4):
        T.sphere(f"{name}_egg{i}", (x - 0.12 + i * 0.08, y - 0.02, z + 0.075),
                 (0.034, 0.03, 0.042), toon(("peach", "cream")[i % 2]), segs=20, rings=12)


def bread(name, loc):
    x, y, z = loc
    basket(name + "_bsk", loc, 0.3, 0.09, handle=False)
    for i, dx in enumerate((-0.07, 0.07)):
        b = T.sphere(f"{name}_loaf{i}", (x + dx, y, z + 0.1), (0.1, 0.07, 0.055),
                     toon("basket"), segs=24, rings=12)
        T._subsurf(b)
        for k in range(3):
            T.capsule(f"{name}_cut{i}{k}", (x + dx - 0.04 + k * 0.035, y - 0.068, z + 0.12),
                      (x + dx - 0.02 + k * 0.035, y - 0.068, z + 0.14), 0.005,
                      toon("basket_dark", shade=False), line=False)


def hanging_pot(name, top, drop, seed=1):
    x, y, z = top
    for dx in (-0.06, 0.06):
        T.tube(f"{name}_rope{dx}", [(x, y, z), (x + dx, y, z - drop)], 0.004, toon("oat"),
               line=False)
    P.cup(name + "_pot", (x, y, z - drop - 0.12), 0.07, 0.09, 0.12, toon("cream"),
          fill=toon("wood_dark"))
    P.potted_plant  # (vines instead of an upright plant)
    for k in range(4):
        P.trailing_vine(f"{name}_v{k}", (x - 0.07 + k * 0.045, y - 0.05 - 0.01 * k,
                                         z - drop - 0.01), 0.5 + 0.25 * ((k * 7 + seed) % 3),
                        seed=seed * 10 + k, sway=0.05)
    for k in range(5):
        P.leaf(f"{name}_top{k}", (x - 0.04 + k * 0.02, y - 0.06, z - drop - 0.01),
               -60 + k * 30, 0.1, 0.07, ("leaf", "leaf_dark", "leaf_light")[k % 3])


def pendant(name, x, z_bulb, y=0.2):
    T.tube(name + "_cord", [(x, y, 3.6), (x, y, z_bulb + 0.1)], 0.006, toon("ink",
           shade=False), line=False)
    T.cylinder(name + "_cap", (x, y, z_bulb + 0.08), 0.03, 0.06, toon("charcoal"))
    b = T.sphere(name + "_bulb", (x, y, z_bulb), (0.075, 0.075, 0.085), toon("bulb", shade=False),
                 segs=28, rings=14)
    T._subsurf(b)


def cabinets(name, x0, x1, body="sage", doors=2, drawers=True):
    """Lower cabinet run with inset doors, knobs, toe kick and a wood top."""
    T.slab(name, x0, x1, 0.6, WALL_Y, 0.08, CT - 0.04, toon(body))
    T.slab(name + "_kick", x0 + 0.02, x1 - 0.02, 0.62, WALL_Y, 0.0, 0.08, toon("wood_dark"))
    T.slab(name + "_top", x0 - 0.03, x1 + 0.03, 0.56, WALL_Y, CT - 0.04, CT, toon("wood"))
    w = (x1 - x0) / doors
    for i in range(doors):
        a, b = x0 + i * w + 0.03, x0 + (i + 1) * w - 0.03
        if drawers:
            T.slab(f"{name}_dr{i}", a, b, 0.585, 0.6, CT - 0.2, CT - 0.07, toon(body))
            T.cylinder(f"{name}_drk{i}", ((a + b) / 2, 0.575, CT - 0.135), 0.018, 0.02,
                       toon("wood_dark"), rot=(90, 0, 0), segs=16)
        T.slab(f"{name}_door{i}", a, b, 0.585, 0.6, 0.12, CT - 0.24, toon(body))
        kx = b - 0.05 if i % 2 == 0 else a + 0.05
        T.cylinder(f"{name}_dk{i}", (kx, 0.575, CT - 0.32), 0.018, 0.02, toon("wood_dark"),
                   rot=(90, 0, 0), segs=16)


# ----------------------------------------------------------------------------
def left_shelves():
    x0, x1 = -3.08, -1.98
    zs = [0.95, 1.52, 2.1, 2.68]
    for i, z in enumerate(zs):
        shelf(f"lsh{i}", x0, x1, z)
    y = WALL_Y - 0.14
    # shelf 0: jars + mugs
    z = zs[0]
    jar("ljar0", (-2.95, y, z), 0.055, 0.16, fill="oat")
    jar("ljar1", (-2.8, y, z), 0.05, 0.13, fill="terracotta", lid="sage")
    jar("ljar2", (-2.66, y, z), 0.05, 0.18, fill="mustard")
    P.mug((-2.46, y, z), s=1.0, color="sage")
    P.mug((-2.3, y, z), s=1.0, color="rose")
    P.potted_plant("lp0", (-2.1, y, z), pot_r=0.065, pot_h=0.09, kind="succulent", n=7, seed=4,
                   pot="white")
    # shelf 1: eggs, herbs, plates
    z = zs[1]
    egg_carton("eggs", (-2.87, y, z))
    P.potted_plant("lp1", (-2.58, y, z), pot_r=0.06, pot_h=0.09, kind="leafy", n=7, size=0.7,
                   seed=5, pot="cream")
    plates("lplates", (-2.26, y, z), r=0.12, n=6)
    # shelf 2: bread, bottles, coffee bag, herb pot
    z = zs[2]
    P.potted_plant("lp2", (-2.93, y, z), pot_r=0.1, pot_h=0.12, kind="leafy", n=11, size=1.1,
                   seed=6, pot="terracotta")
    bread("lbread", (-2.6, y, z))
    bottle("oil", (-2.36, y, z), 0.035, 0.24, color="olive")
    bottle("vinegar", (-2.27, y + 0.02, z), 0.03, 0.2, color="terra_dark")
    T.slab("coffee", -2.18, -2.03, y - 0.05, y + 0.05, z, z + 0.2, toon("terra_dark"))
    T.slab("coffee_l", -2.16, -2.05, y - 0.056, y - 0.05, z + 0.05, z + 0.13, toon("cream"))
    # shelf 3: basket plant, lantern, books, bowl succulent
    z = zs[3]
    basket("lbasket", (-2.9, y, z), 0.26, 0.14)
    P.potted_plant("lp3", (-2.9, y - 0.02, z + 0.02), pot_r=0.001, pot_h=0.1, kind="leafy",
                   n=11, size=1.2, seed=8)
    lantern("llant", (-2.6, y, z), s=1.1)
    book_stack("lbooks", (-2.38, y, z), n=3, w=0.2)
    P.cup("lbowl", (-2.13, y, z), 0.07, 0.11, 0.07, toon("white"), fill=toon("wood_dark"))
    P.potted_plant("lp4", (-2.13, y - 0.01, z), pot_r=0.001, pot_h=0.06, kind="succulent", n=9,
                   seed=9, colors=("sage", "sage_dark", "leaf_light"))
    # floor: watering can, tall basket, crate with veg
    y = WALL_Y - 0.3
    T.cylinder("wcan", (-2.4, y, 0.13), 0.1, 0.26, toon("mustard"))
    T.tube("wcan_sp", [(-2.5, y, 0.1), (-2.62, y, 0.2), (-2.7, y, 0.3)], 0.018, toon("mustard"),
           line=True)
    T.torus("wcan_h", (-2.3, y, 0.2), 0.07, 0.014, toon("mustard"), rot=(90, 0, 0), arc=(-90, 90))
    basket("lbsk2", (-2.88, y + 0.05, 0.0), 0.34, 0.3)
    for i in range(3):
        T.capsule(f"leek{i}", (-2.95 + i * 0.06, y, 0.25), (-2.98 + i * 0.07, y - 0.02, 0.5),
                  0.02, toon(("leaf_light", "sage", "leaf")[i]))
    T.cylinder("tin", (-2.14, y, 0.12), 0.08, 0.24, T.stripes("steel", "sky", 0.08, duty=0.7))
    P.potted_plant("lp5", (-2.14, y - 0.02, 0.2), pot_r=0.001, pot_h=0.04, kind="leafy", n=6,
                   size=0.8, seed=11)


def fridge():
    x0, x1 = -1.92, -1.18
    T.slab("fridge", x0, x1, 0.52, WALL_Y - 0.02, 0.02, 1.98, toon("charcoal"))
    T.slab("fridge_split", x0 + 0.01, x1 - 0.01, 0.51, 0.52, 1.42, 1.44, toon("grey_dark"),
           line=True)
    T.capsule("fridge_h1", (x1 - 0.07, 0.49, 1.1), (x1 - 0.07, 0.49, 1.35), 0.018, toon("steel"))
    T.capsule("fridge_h2", (x1 - 0.07, 0.49, 1.5), (x1 - 0.07, 0.49, 1.65), 0.018, toon("steel"))
    # kid drawing + magnets
    T.slab("drawing", -1.8, -1.52, 0.505, 0.51, 0.95, 1.25, toon("white"))
    T.sphere("sun_draw", (-1.72, 0.5, 1.17), (0.035, 0.003, 0.035), toon("mustard",
             shade=False), line=False)
    T.prism("house_draw", [(-0.07, 0), (0.07, 0), (0.07, 0.07), (0, 0.12), (-0.07, 0.07)], 0.003,
            toon("rose", shade=False), loc=(-1.62, 0.502, 0.99), line=False)
    for i, (mx, mz, c) in enumerate(((-1.78, 1.24, "tomato"), (-1.54, 1.23, "teal"),
                                     (-1.66, 1.7, "mustard"), (-1.5, 1.58, "sage"))):
        T.cylinder(f"magnet{i}", (mx, 0.5, mz), 0.022, 0.02, toon(c), rot=(90, 0, 0), segs=16)
    T.prism("heart_mag", T.heart_pts(0.03), 0.015, toon("pink"), loc=(-1.78, 0.5, 1.55))
    # on top: cereal box + basket
    T.slab("cereal", -1.85, -1.66, 0.8, 1.0, 1.98, 2.3, toon("butter"))
    T.sphere("cereal_logo", (-1.755, 0.795, 2.17), (0.05, 0.003, 0.05), toon("tomato",
             shade=False), line=True)
    basket("fbasket", (-1.42, 0.9, 1.98), 0.3, 0.14)


def chalkboard():
    x0, x1, z0, z1 = -1.9, -1.2, 2.42, 3.12
    T.slab("chalk_frame", x0, x1, WALL_Y - 0.05, WALL_Y, z0, z1, toon("wood"))
    T.slab("chalk", x0 + 0.05, x1 - 0.05, WALL_Y - 0.06, WALL_Y - 0.05, z0 + 0.05, z1 - 0.05,
           toon("#4F5A55", shade=False))
    ch = toon("cream", shade=False)
    y = WALL_Y - 0.07
    # doodles: steaming cup, cupcake, three stars (no text)
    T.tube("ch_cup", [(-1.78, y, 2.9), (-1.76, y, 2.74), (-1.62, y, 2.74), (-1.6, y, 2.9)],
           0.006, ch, line=False)
    T.torus("ch_cuph", (-1.58, y, 2.83), 0.03, 0.006, ch, rot=(90, 0, 0), arc=(-90, 90))
    for k in range(2):
        T.tube(f"ch_steam{k}", [(-1.72 + k * 0.05, y, 2.94), (-1.7 + k * 0.05, y, 2.98),
                                (-1.73 + k * 0.05, y, 3.02), (-1.7 + k * 0.05, y, 3.06)],
               0.005, ch, line=False)
    T.tube("ch_cc", [(-1.44, y, 2.62), (-1.46, y, 2.72), (-1.28, y, 2.72), (-1.3, y, 2.62),
                     (-1.44, y, 2.62)], 0.006, toon("pink", shade=False), line=False)
    T.tube("ch_cc2", [(-1.47, y, 2.72), (-1.43, y, 2.8), (-1.37, y, 2.84), (-1.31, y, 2.8),
                      (-1.27, y, 2.72)], 0.006, toon("pink", shade=False), line=False)
    for k, (sx, sz) in enumerate(((-1.8, 2.58), (-1.62, 2.54), (-1.34, 2.98))):
        T.prism(f"ch_star{k}", T.star_pts(0.035, 0.015), 0.004, toon("butter", shade=False),
                loc=(sx, y, sz), line=False)


def sink_run():
    cabinets("cab_sink", -1.12, 0.38, body="sage", doors=3)
    # sink basin + tap
    T.slab("sink", -0.7, -0.15, 0.62, 1.0, CT - 0.005, CT + 0.004, toon("steel"))
    T.slab("sink_in", -0.66, -0.19, 0.66, 0.96, CT, CT + 0.006, toon("grey_dark", shade=False))
    T.tube("tap", [(-0.42, 1.05, CT), (-0.42, 1.05, CT + 0.28), (-0.42, 0.9, CT + 0.3),
                   (-0.42, 0.82, CT + 0.22)], 0.022, toon("steel"), line=True)
    for dx in (-0.1, 0.1):
        T.cylinder(f"tapk{dx}", (-0.42 + dx, 1.05, CT + 0.03), 0.025, 0.05, toon("steel"))
    # dish rack with plates, soap, sponge
    T.slab("rack", -1.06, -0.76, 0.75, 1.05, CT, CT + 0.06, toon("wood_light"))
    for i in range(4):
        T.cylinder(f"rplate{i}", (-1.0 + i * 0.055, 0.9, CT + 0.15), 0.12, 0.018,
                   toon(("white", "rose", "white", "sage")[i]), rot=(0, 90, 0), segs=32)
    T.lathe("soap", [(0, 0), (0.04, 0), (0.04, 0.12), (0.015, 0.15), (0.015, 0.18), (0, 0.18)],
            toon("teal"), loc=(-0.04, 1.0, CT), segs=24, smooth=False)
    T.slab("sponge", 0.06, 0.18, 0.95, 1.05, CT, CT + 0.05, toon("butter"))
    T.slab("sponge_g", 0.06, 0.18, 0.95, 1.05, CT + 0.035, CT + 0.05, toon("leaf_light"))
    # window above with cafe curtain + sill plants
    wx0, wx1, wz0, wz1 = -0.82, 0.12, 1.3, 2.75
    T.slab("win_frame", wx0 - 0.06, wx1 + 0.06, WALL_Y - 0.06, WALL_Y - 0.01, wz0 - 0.06,
           wz1 + 0.06, toon("white"))
    T.slab("win_sky", wx0, wx1, WALL_Y - 0.065, WALL_Y - 0.06, wz0, wz1,
           T.stripes("sky_light", "sky", 0.42, axis="z", duty=0.5), line=True)
    # a tree and a cloud outside
    T.sphere("tree", (-0.62, WALL_Y - 0.068, 1.55), (0.28, 0.002, 0.22), toon("sage_dark",
             shade=False), line=True)
    for i, (dx, r) in enumerate(((-0.05, 0.07), (0.05, 0.09), (0.15, 0.065))):
        T.sphere(f"cloud{i}", (dx - 0.2, WALL_Y - 0.067, 2.45), (r, 0.002, r * 0.8),
                 toon("white", shade=False), line=True)
    T.slab("win_mull", (wx0 + wx1) / 2 - 0.02, (wx0 + wx1) / 2 + 0.02, WALL_Y - 0.08,
           WALL_Y - 0.06, wz0, wz1, toon("white"))
    T.slab("win_tran", wx0, wx1, WALL_Y - 0.08, WALL_Y - 0.06, 2.1, 2.14, toon("white"))
    T.slab("win_sill", wx0 - 0.1, wx1 + 0.1, WALL_Y - 0.2, WALL_Y, wz0 - 0.07, wz0 - 0.03,
           toon("white"))
    T.capsule("rod", (wx0 - 0.1, WALL_Y - 0.12, 1.98), (wx1 + 0.1, WALL_Y - 0.12, 1.98), 0.012,
              toon("wood_dark"))
    cur = T.checks("rose", "cream", 0.05, axes="xz")
    for i, (a, b) in enumerate(((wx0 - 0.08, (wx0 + wx1) / 2 - 0.01),
                                ((wx0 + wx1) / 2 + 0.01, wx1 + 0.08))):
        T.slab(f"curtain{i}", a, b, WALL_Y - 0.13, WALL_Y - 0.11, 1.48, 1.98, cur)
        T.slab(f"cur_top{i}", a, b, WALL_Y - 0.14, WALL_Y - 0.12, 1.92, 1.98, toon("rose"))
    y = WALL_Y - 0.12
    lantern("sill_lant", (-0.7, y, wz0 - 0.03), s=0.9)
    P.potted_plant("sillp", (-0.3, y, wz0 - 0.03), pot_r=0.055, pot_h=0.08, kind="spiky", n=7,
                   size=0.8, seed=12, pot="white")
    T.lathe("vase", [(0, 0), (0.05, 0), (0.06, 0.06), (0.02, 0.13), (0.02, 0.16), (0, 0.16)],
            toon("sky"), loc=(0.02, y, wz0 - 0.03), segs=24)
    T.tube("sprig", [(0.02, y, wz0 + 0.1), (0.04, y, wz0 + 0.25), (0.08, y, wz0 + 0.36)], 0.005,
           toon("olive"), line=False)
    for k in range(3):
        P.leaf(f"sprigl{k}", (0.03 + 0.02 * k, y - 0.01, wz0 + 0.17 + 0.07 * k),
               (-50, 55, -30)[k], 0.08, 0.055, "leaf")


def stove_run():
    x0, x1 = 0.38, 1.22
    T.slab("oven", x0, x1, 0.56, WALL_Y, 0.0, CT - 0.02, toon("cream"))
    T.slab("oven_win", x0 + 0.1, x1 - 0.1, 0.55, 0.56, 0.18, 0.56, toon("charcoal"))
    T.slab("oven_glow", x0 + 0.16, x1 - 0.16, 0.545, 0.55, 0.24, 0.3, toon("terracotta",
           shade=False), line=False)
    T.capsule("oven_h", (x0 + 0.1, 0.52, 0.64), (x1 - 0.1, 0.52, 0.64), 0.016, toon("steel"))
    for i in range(4):
        T.cylinder(f"knob{i}", (x0 + 0.14 + i * 0.187, 0.545, 0.77), 0.03, 0.03, toon("charcoal"),
                   rot=(90, 0, 0), segs=20)
    T.slab("hob", x0 - 0.01, x1 + 0.01, 0.56, WALL_Y, CT - 0.02, CT + 0.005, toon("charcoal"))
    # pot + kettle on the hob
    P.cup("stockpot", (0.6, 0.85, CT + 0.005), 0.13, 0.13, 0.17, toon("teal"),
          fill=toon("tomato"), fill_level=0.75)
    T.capsule("sp_h1", (0.45, 0.85, CT + 0.15), (0.49, 0.85, CT + 0.15), 0.014, toon("teal"))
    T.capsule("sp_h2", (0.71, 0.85, CT + 0.15), (0.75, 0.85, CT + 0.15), 0.014, toon("teal"))
    T.tube("ladle", [(0.63, 0.83, CT + 0.08), (0.66, 0.8, CT + 0.25), (0.7, 0.79, CT + 0.34)],
           0.01, toon("wood_dark"), line=True)
    k = (1.02, 0.85, CT + 0.005)
    T.lathe("kettle", [(0, 0), (0.1, 0), (0.105, 0.05), (0.08, 0.14), (0.03, 0.16), (0, 0.16)],
            T.dots("white", "teal", 0.04, 0.01), loc=k, segs=32, subsurf=1)
    T.tube("kettle_sp", [(0.94, 0.85, CT + 0.06), (0.87, 0.85, CT + 0.12), (0.85, 0.85, CT + 0.17)],
           0.016, toon("white"), line=True)
    T.torus("kettle_h", (1.02, 0.85, CT + 0.16), 0.07, 0.012, toon("charcoal"), rot=(90, 0, 0),
            arc=(20, 160))
    # utensil rail above the stove
    T.capsule("rail", (0.35, WALL_Y - 0.05, 1.42), (1.25, WALL_Y - 0.05, 1.42), 0.012,
              toon("steel"))
    for i, (ux, kind) in enumerate(((0.45, "spoon"), (0.6, "whisk"), (0.75, "spat"),
                                    (0.9, "ladle"), (1.05, "spoon"), (1.17, "fork"))):
        y = WALL_Y - 0.07
        T.torus(f"hook{i}", (ux, y, 1.4), 0.015, 0.004, toon("steel"), rot=(90, 0, 0))
        T.capsule(f"ut{i}", (ux, y, 1.37), (ux, y, 1.18), 0.01,
                  toon("wood_dark" if kind in ("spoon", "spat") else "steel"))
        if kind == "spoon":
            T.sphere(f"ut{i}_h", (ux, y, 1.14), (0.035, 0.012, 0.05), toon("wood"), segs=16,
                     rings=10)
        elif kind == "spat":
            T.slab(f"ut{i}_h", ux - 0.035, ux + 0.035, y - 0.006, y + 0.006, 1.05, 1.18,
                   toon("terracotta"))
        elif kind == "ladle":
            P.cup(f"ut{i}_h", (ux, y, 1.1), 0.03, 0.045, 0.05, toon("steel"))
        elif kind == "whisk":
            for a in (-1, 0, 1):
                T.tube(f"ut{i}_w{a}", [(ux, y, 1.2), (ux + a * 0.04, y, 1.12), (ux, y, 1.04)],
                       0.004, toon("steel"), line=True)
        elif kind == "fork":
            T.slab(f"ut{i}_h", ux - 0.025, ux + 0.025, y - 0.005, y + 0.005, 1.1, 1.18,
                   toon("steel"))


def right_run():
    cabinets("cab_r", 1.22, 2.42, body="sage", doors=2)
    # stand mixer
    x, y = 1.42, 0.86
    T.slab("mix_base", x - 0.12, x + 0.12, y - 0.1, y + 0.1, CT, CT + 0.04, toon("rose"),
           round_=0.02)
    T.capsule("mix_col", (x + 0.08, y + 0.02, CT + 0.03), (x + 0.08, y + 0.02, CT + 0.3), 0.055,
              toon("rose"))
    T.capsule("mix_head", (x - 0.12, y + 0.02, CT + 0.32), (x + 0.1, y + 0.02, CT + 0.34), 0.07,
              toon("rose"))
    P.cup("mix_bowl", (x - 0.04, y, CT + 0.04), 0.07, 0.11, 0.13, toon("steel"),
          fill=toon("cream"))
    # cake under a (drawn) dome, fruit bowl, jars
    P.layer_cake((1.78, 0.85, CT), s=0.95)
    P.cup("fruit", (2.15, 0.85, CT), 0.08, 0.16, 0.08, toon("terracotta"))
    for i, (dx, c) in enumerate(((-0.07, "mustard"), (0.0, "tomato"), (0.07, "mustard"),
                                 (-0.035, "leaf_light"), (0.035, "peach"))):
        T.sphere(f"fruit{i}", (2.15 + dx, 0.85 - 0.02 * (i > 2), CT + 0.1 + 0.04 * (i > 2)),
                 0.05, toon(c), segs=20, rings=12)
    jar("rjar0", (2.34, 1.02, CT), 0.05, 0.2, body="sky_light", fill="basket")
    # open shelves above
    zs = [1.62, 2.22, 2.84]
    for i, z in enumerate(zs):
        shelf(f"rsh{i}", 1.3, 3.05, z)
    y = WALL_Y - 0.14
    z = zs[0]
    for i in range(5):   # mugs hanging under the first shelf
        mx = 1.45 + i * 0.13
        T.torus(f"mhook{i}", (mx, y, z - 0.05), 0.012, 0.004, toon("steel"), rot=(90, 0, 0))
        P.cup(f"hmug{i}", (mx, y, z - 0.19), 0.045, 0.047, 0.1,
              toon(("terracotta", "sage", "mustard", "rose", "teal")[i]))
    plates("rplates", (2.2, y, z), r=0.12, n=5)
    for i in range(3):   # glass stack
        T.cylinder(f"glass{i}", (2.5, y, z + 0.05 + i * 0.07), 0.05, 0.08,
                   toon("sky_light"), radius2=0.055)
    P.potted_plant("rp0", (2.82, y, z), pot_r=0.07, pot_h=0.1, kind="spiky", n=9, seed=21,
                   pot="terracotta")
    z = zs[1]
    # round wall clock sits on this shelf
    T.cylinder("clock", (1.55, y, z + 0.16), 0.15, 0.06, toon("teal"), rot=(90, 0, 0), segs=40)
    T.cylinder("clock_f", (1.55, y - 0.035, z + 0.16), 0.12, 0.012, toon("cream"), rot=(90, 0, 0),
               segs=40)
    T.slab("clock_h1", 1.545, 1.555, y - 0.048, y - 0.042, z + 0.16, z + 0.24, toon("ink",
           shade=False), line=False)
    T.slab("clock_h2", 1.55, 1.62, y - 0.048, y - 0.042, z + 0.155, z + 0.165, toon("ink",
           shade=False), line=False)
    for i in range(4):
        cx = 1.55 + 0.095 * math.cos(i * math.pi / 2)
        cz = z + 0.16 + 0.095 * math.sin(i * math.pi / 2)
        T.sphere(f"clock_d{i}", (cx, y - 0.045, cz), 0.009, toon("ink", shade=False), line=False,
                 segs=8, rings=6)
    x = books_upright("rbooks", 1.78, y, z, n=6)
    book_stack("rbook_s", (2.2, y, z), n=2, w=0.2)
    lantern("rlant", (2.2, y, z + 0.07), s=0.8)
    jar("rjar1", (2.48, y, z), 0.07, 0.18, body="cream", lid="terracotta", fill="rose")
    P.potted_plant("rp1", (2.8, y, z), pot_r=0.085, pot_h=0.12, kind="leafy", n=10, seed=22,
                   size=1.0, pot="sky")
    z = zs[2]
    basket("rbsk", (1.55, y, z), 0.3, 0.15)
    P.potted_plant("rp2", (1.9, y, z), pot_r=0.075, pot_h=0.1, kind="succulent", n=9, seed=23,
                   pot="rose", size=1.4)
    P.teapot((2.25, y, z), s=0.9)
    jar("rjar2", (2.56, y, z), 0.06, 0.15, body="sky_light", lid="wood", fill="terra_dark")
    jar("rjar3", (2.72, y, z), 0.05, 0.11, body="sky_light", lid="sage", fill="mustard")
    P.potted_plant("rp3", (2.93, y, z), pot_r=0.06, pot_h=0.09, kind="leafy", n=7, seed=24,
                   size=0.8, pot="white")
    # vines trailing off the top shelf's plant
    for k in range(3):
        P.trailing_vine(f"rtrail{k}", (2.88 + 0.03 * k, y - 0.12, z + 0.05), 0.55 + 0.2 * k,
                        seed=30 + k, sway=0.04)
    # far-right floor corner: side table + lamp + plant
    T.slab("stable", 2.55, 3.05, 0.7, 1.1, 0.55, 0.6, toon("wood"))
    for lx in (2.6, 3.0):
        T.slab(f"stable_l{lx}", lx - 0.02, lx + 0.02, 0.75, 1.05, 0.0, 0.55, toon("wood_dark"))
    P.potted_plant("rp4", (2.8, 0.9, 0.6), pot_r=0.08, pot_h=0.12, kind="spiky", n=9, seed=25,
                   size=1.1, pot="white")
    basket("rbsk2", (2.8, 0.9, 0.0), 0.36, 0.26)


def ceiling_things():
    pendant("pend0", -0.35, 2.95, y=0.6)
    pendant("pend1", 1.1, 2.6, y=0.4)
    hanging_pot("hang0", (-2.45, 0.9, 3.35), 0.25, seed=2)
    hanging_pot("hang1", (0.72, 0.9, 3.35), 0.18, seed=5)
    # fairy-light garland along the beam
    pts = []
    for i in range(33):
        x = -3.1 + i * 6.2 / 32
        pts.append((x, WALL_Y - 0.16, 3.28 - 0.06 * abs(math.sin(i * math.pi / 4))))
    T.tube("garland", pts, 0.005, toon("olive"), line=False)
    for i, p in enumerate(pts[::2]):
        T.sphere(f"fl{i}", (p[0], p[1] - 0.01, p[2] - 0.03), (0.022, 0.022, 0.03),
                 toon(("bulb", "butter", "blush")[i % 3], shade=False), segs=12, rings=8)


def island():
    x0, x1, y0, y1, h = -0.45, 1.35, -0.75, -0.2, 0.88
    T.slab("isl_top", x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, h - 0.05, h, toon("wood"))
    for lx in (x0, x1 - 0.06):
        T.slab(f"isl_leg{lx}", lx, lx + 0.06, y0, y0 + 0.06, 0.0, h - 0.05, toon("wood_dark"))
        T.slab(f"isl_legb{lx}", lx, lx + 0.06, y1 - 0.06, y1, 0.0, h - 0.05, toon("wood_dark"))
    T.slab("isl_back", x0 + 0.02, x1 - 0.02, y1 - 0.04, y1 - 0.02, 0.1, h - 0.05, toon("rose"))
    T.slab("isl_shelf", x0 + 0.02, x1 - 0.02, y0, y1, 0.18, 0.22, toon("wood"))
    # things on the open shelf
    y = (y0 + y1) / 2
    basket("isl_bsk", (-0.15, y, 0.22), 0.36, 0.2)
    for i, c in enumerate(("mustard", "tomato", "leaf_light")):
        T.sphere(f"isl_veg{i}", (-0.25 + i * 0.1, y - 0.05, 0.45), 0.055, toon(c), segs=18,
                 rings=10)
    plates("isl_pl", (0.35, y, 0.22), r=0.14, n=4, color="sage")
    P.frying_pan((0.85, y, 0.22), s=1.0, egg=False)
    # on top: cutting board, tomatoes, mug, candles, cookbook, cupcakes
    T.slab("board", -0.3, 0.2, y - 0.14, y + 0.14, h, h + 0.03, toon("wood_light"))
    T.capsule("board_h", (0.2, y, h + 0.015), (0.27, y, h + 0.015), 0.02, toon("wood_light"))
    P.tomato((-0.18, y - 0.02, h + 0.03), s=1.0)
    P.tomato((-0.04, y + 0.03, h + 0.03), s=0.9)
    P.mug((0.45, y, h), s=1.1, color="mustard")
    T.cylinder("candle0", (0.7, y, h + 0.09), 0.045, 0.18, toon("cream"))
    T.cylinder("candle1", (0.8, y + 0.02, h + 0.06), 0.04, 0.12, toon("cream"))
    for i, (cx, ch) in enumerate(((0.7, 0.18), (0.8, 0.12))):
        T.sphere(f"cflame{i}", (cx, y - 0.02, h + ch + 0.035), (0.014, 0.01, 0.026),
                 toon("mustard", shade=False), segs=12, rings=8)
    P.potted_plant("isl_pl2", (0.98, y, h), pot_r=0.06, pot_h=0.08, kind="succulent", n=7,
                   seed=40, pot="terracotta")
    book_stack("isl_book", (1.2, y, h), n=2, w=0.22)
    # two stools in front
    for sx in (0.05, 0.85):
        stool(f"isl_stool{sx}", (sx, -0.98, 0.0), h=0.6)


def stool(name, loc, h=0.55, top="cream"):
    x, y, z = loc
    T.cylinder(name + "_seat", (x, y, z + h - 0.03), 0.19, 0.06, toon(top), segs=40)
    for i, (dx, dy) in enumerate(((-0.12, -0.1), (0.12, -0.1), (-0.12, 0.1), (0.12, 0.1))):
        T.capsule(f"{name}_leg{i}", (x + dx * 0.7, y + dy * 0.7, z + h - 0.06),
                  (x + dx, y + dy, z + 0.01), 0.02, toon("wood"))
    T.slab(name + "_bar", x - 0.13, x + 0.13, y - 0.1, y - 0.08, z + 0.2, z + 0.23,
           toon("wood"))


def chair(name, loc, h=0.48):
    x, y, z = loc
    T.slab(name + "_seat", x - 0.21, x + 0.21, y - 0.2, y + 0.2, z + h - 0.05, z + h, toon("wood"))
    for dx in (-0.18, 0.18):
        for dy in (-0.17, 0.17):
            T.slab(f"{name}_l{dx}{dy}", x + dx - 0.022, x + dx + 0.022, y + dy - 0.022,
                   y + dy + 0.022, 0.0, z + h - 0.05, toon("wood_dark"))
        T.slab(f"{name}_post{dx}", x + dx - 0.022, x + dx + 0.022, y + 0.16, y + 0.2, z + h,
               z + h + 0.48, toon("wood_dark"))
    T.slab(name + "_back", x - 0.2, x + 0.2, y + 0.16, y + 0.2, z + h + 0.28, z + h + 0.46,
           toon("wood"))
    T.slab(name + "_back2", x - 0.2, x + 0.2, y + 0.16, y + 0.2, z + h + 0.14, z + h + 0.2,
           toon("wood"))


def dining():
    with layer("chairs"):
        chair("chairA", (-2.45, -1.28, 0.0))
        chair("chairB", (-1.65, -1.28, 0.0))
    with layer("front"):
        x0, x1, y0, y1, h = -2.85, -1.25, -2.0, -1.45, 0.76
        T.slab("tbl_top", x0, x1, y0, y1, h - 0.05, h, toon("wood"))
        T.slab("tbl_apron", x0 + 0.05, x1 - 0.05, y0 + 0.02, y1 - 0.02, h - 0.12, h - 0.05,
               toon("wood_dark"))
        for lx in (x0 + 0.05, x1 - 0.1):
            for ly in (y0 + 0.03, y1 - 0.08):
                T.slab(f"tbl_leg{lx}{ly}", lx, lx + 0.05, ly, ly + 0.05, 0.0, h - 0.05,
                       toon("wood_dark"))
        y = (y0 + y1) / 2
        P.cup("tbl_bowl", (-2.3, y, h), 0.1, 0.19, 0.1, toon("terracotta"),
              fill=toon("wood_dark"))
        for i, c in enumerate(("tomato", "mustard", "peach", "leaf_light")):
            T.sphere(f"tbl_fruit{i}", (-2.42 + i * 0.08, y - 0.03, h + 0.12 + 0.02 * (i % 2)),
                     0.055, toon(c), segs=18, rings=10)
        for k in range(3):
            P.leaf(f"tbl_lf{k}", (-2.3 + 0.05 * (k - 1), y + 0.05, h + 0.1), (-55, 5, 50)[k],
                   0.14, 0.09, ("leaf", "leaf_dark", "leaf_light")[k])
        T.cylinder("utpot", (-1.75, y, h + 0.08), 0.06, 0.16,
                   T.dots("terracotta", "ink", 0.035, 0.009))
        for k in range(3):
            T.capsule(f"utpot_u{k}", (-1.78 + 0.03 * k, y, h + 0.12),
                      (-1.8 + 0.05 * k, y - 0.01, h + 0.28), 0.012, toon("steel"))
            T.sphere(f"utpot_s{k}", (-1.8 + 0.05 * k, y - 0.01, h + 0.3), (0.02, 0.012, 0.03),
                     toon("steel"), segs=12, rings=8)
        T.lathe("fvase", [(0, 0), (0.05, 0), (0.065, 0.08), (0.03, 0.16), (0.035, 0.19),
                          (0, 0.19)], toon("sky"), loc=(-2.7, y, h), segs=24)
        for k, (dx, dz, c) in enumerate(((-0.06, 0.34, "pink"), (0.03, 0.38, "butter"),
                                         (0.08, 0.3, "blush"))):
            T.tube(f"fl_st{k}", [(-2.7, y, h + 0.15), (-2.7 + dx, y, h + dz)], 0.005,
                   toon("olive"), line=False)
            for p in range(5):
                a = p * 2 * math.pi / 5
                T.sphere(f"fl_p{k}{p}", (-2.7 + dx + 0.03 * math.cos(a), y - 0.01,
                                         h + dz + 0.03 * math.sin(a)), (0.024, 0.01, 0.024),
                         toon(c), segs=12, rings=8)
            T.sphere(f"fl_c{k}", (-2.7 + dx, y - 0.02, h + dz), (0.018, 0.01, 0.018),
                     toon("mustard"), segs=10, rings=6)
        for sx in (-2.45, -1.65):
            stool(f"tstool{sx}", (sx, -2.28, 0.0), h=0.48, top="sage")
        # big floor plant, front right
        P.cup("bigpot", (2.72, -1.95, 0.0), 0.17, 0.22, 0.34,
              T.stripes("basket", "basket_dark", 0.05, duty=0.5), fill=toon("wood_dark"))
        P.potted_plant("bigplant", (2.72, -1.95, 0.0), pot_r=0.001, pot_h=0.3, kind="palm", n=12,
                       size=1.3, seed=50, colors=("leaf", "leaf_dark", "olive"))


# ----------------------------------------------------------------------------
LAYERS = ["back", "island", "chairs", "front"]


def build():
    T.reset()
    room()
    left_shelves()
    fridge()
    chalkboard()
    sink_run()
    stove_run()
    right_run()
    ceiling_things()
    with layer("island"):
        island()
    dining()


def main():
    t0 = time.time()
    build()
    n_obj = len([o for o in bpy.context.scene.objects if o.type == "MESH"])
    T.bake_shear()
    T.frame(CX, CY, W_PX, H_PX)
    meta = {"w": W_PX, "h": H_PX, "ppm": T.PPM, "shear_k": T.SHEAR_K, "cam_center": [CX, CY],
            "layers": {}, "objects": n_obj}
    t_build = time.time() - t0
    for L in LAYERS:
        for ob in bpy.context.scene.objects:
            if ob.type == "MESH":
                ob.hide_render = ob.get("layer", "back") != L
        fn = f"bg_{L}.png"
        rt = T.render_to(os.path.join(T.SPRITES, fn))
        meta["layers"][L] = {"file": fn, "render_s": round(rt, 1)}
        T.log_timing(f"bg_{L}", rt)
        print(f"[bg] {L}: {rt:.1f}s")
    meta["build_s"] = round(t_build, 1)
    T.write_meta("bg_cafe_kitchen", meta)
    print(f"[bg] {n_obj} objects, total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
