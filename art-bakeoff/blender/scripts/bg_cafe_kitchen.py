"""Cafe kitchen background (2048x1536, iPad landscape @2x).
Blender -b -P bg_cafe_kitchen.py

World layout (metres): back wall face at y=0.7, floor z=0, camera looks +Y.
Counters are 0.6 deep (front face y=0.1). Characters stand around y=-0.35.
"""
import sys, os, math, random, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
import toylib as T

NAME = "bg_cafe_kitchen"
W, H = 2048, 1536
CX, CY = 0.0, 1.47          # camera-plane centre of the frame
WALL_Y = 0.7
COUNTER_Z = 0.9


# ----------------------------------------------------------------------------
# Procedural surface colours
# ----------------------------------------------------------------------------
def wallpaper(nt, co):
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(co, sep.inputs[0])
    x = T.math_node(nt, "MULTIPLY", sep.outputs[0], 5.0)
    f = T.math_node(nt, "FRACT", x)
    r = T.ramp_node(nt, [(0.0, "wall"), (0.62, "#F9D9B6")])
    nt.links.new(f, r.inputs[0])
    return r.outputs[0]


def floor_checker(nt, co):
    ch = nt.nodes.new("ShaderNodeTexChecker")
    ch.inputs["Scale"].default_value = 2.4
    ch.inputs["Color1"].default_value = T.col("cream")
    ch.inputs["Color2"].default_value = T.col("#8FD1BE")
    nt.links.new(co, ch.inputs["Vector"])
    return ch.outputs["Color"]


def tiles(nt, co):
    b = nt.nodes.new("ShaderNodeTexBrick")
    b.inputs["Color1"].default_value = T.col("white")
    b.inputs["Color2"].default_value = T.col("#EAF6F2")
    b.inputs["Mortar"].default_value = T.col("#E6CDB2")
    b.inputs["Scale"].default_value = 1.0
    b.inputs["Mortar Size"].default_value = 0.008
    b.inputs["Brick Width"].default_value = 0.2
    b.inputs["Row Height"].default_value = 0.1
    b.offset = 0.5
    # brick node works in XY; map wall XZ -> XY
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(co, sep.inputs[0])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(sep.outputs[0], comb.inputs[0])
    nt.links.new(sep.outputs[2], comb.inputs[1])
    nt.links.new(comb.outputs[0], b.inputs["Vector"])
    return b.outputs["Color"]


def gingham(nt, co):
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(co, sep.inputs[0])
    sx = T.math_node(nt, "GREATER_THAN", T.math_node(nt, "FRACT", T.math_node(nt, "MULTIPLY", sep.outputs[0], 14.0)), 0.5)
    sz = T.math_node(nt, "GREATER_THAN", T.math_node(nt, "FRACT", T.math_node(nt, "MULTIPLY", sep.outputs[2], 14.0)), 0.5)
    s = T.math_node(nt, "MULTIPLY", T.math_node(nt, "ADD", sx, sz), 0.5)
    r = T.ramp_node(nt, [(0.0, "white"), (0.4, "#F7A99B"), (0.9, "coral")])
    nt.links.new(s, r.inputs[0])
    return r.outputs[0]


def wood_grain(nt, co):
    w = nt.nodes.new("ShaderNodeTexWave")
    w.inputs["Scale"].default_value = 3.0
    w.inputs["Distortion"].default_value = 3.0
    w.bands_direction = "X"
    nt.links.new(co, w.inputs["Vector"])
    r = T.ramp_node(nt, [(0.0, "wood"), (0.8, "#D69457")], interp="LINEAR")
    nt.links.new(w.outputs["Fac"], r.inputs[0])
    return r.outputs[0]


def sky_grad(nt, co):
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(co, sep.inputs[0])
    z = T.math_node(nt, "MULTIPLY", T.math_node(nt, "ADD", sep.outputs[2], 0.6), 0.8)
    r = T.ramp_node(nt, [(0.0, "#DDF3FF"), (1.0, "#7CC6F2")], interp="LINEAR")
    nt.links.new(z, r.inputs[0])
    return r.outputs[0]


def sky_mat():
    m = T.proc_clay("sky_proc", sky_grad)
    b = m.node_tree.nodes.get("Principled BSDF")
    # make it glow like daylight: route colour into emission too
    m.node_tree.links.new(b.inputs["Base Color"].links[0].from_socket,
                          b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.0
    return m


# ----------------------------------------------------------------------------
# Furniture builders
# ----------------------------------------------------------------------------
def knob(name, loc, mat, r=0.028):
    T.cylinder(name, loc, r, 0.03, mat, bevel=0.012, rot=(90, 0, 0))


def base_cabinet(tag, x0, x1, body, door, top, doors=2):
    w = x1 - x0
    xc = (x0 + x1) / 2
    T.box(f"{tag}_body", (xc, 0.4, 0.43), (w, 0.6, 0.86), body, bevel=0.03)
    T.box(f"{tag}_kick", (xc, 0.14, 0.04), (w - 0.06, 0.08, 0.08), T.clay("wood_dark", 0.6),
          bevel=0.01)
    T.box(f"{tag}_top", (xc, 0.37, 0.87), (w + 0.04, 0.68, 0.07), top, bevel=0.025)
    # drawer row
    n = doors
    dw = (w - 0.06 - 0.03 * (n - 1)) / n
    for i in range(n):
        x = x0 + 0.03 + dw / 2 + i * (dw + 0.03)
        T.box(f"{tag}_drawer{i}", (x, 0.09, 0.735), (dw, 0.035, 0.13), door, bevel=0.018)
        knob(f"{tag}_dknob{i}", (x, 0.06, 0.735), T.gloss("white", 0.3), 0.022)
        T.box(f"{tag}_door{i}", (x, 0.09, 0.39), (dw, 0.035, 0.49), door, bevel=0.022)
        T.box(f"{tag}_panel{i}", (x, 0.07, 0.39), (dw - 0.09, 0.012, 0.37), body, bevel=0.012)
        kx = x + (dw / 2 - 0.06) * (1 if i % 2 == 0 else -1)
        knob(f"{tag}_knob{i}", (kx, 0.055, 0.55), T.gloss("white", 0.3))


def wavy_panel(name, x0, x1, z0, z1, y, mat, waves=4, amp=0.018):
    bm = bmesh.new()
    nx, nz = 48, 6
    verts = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            u = i / nx
            x = x0 + (x1 - x0) * u
            z = z1 - (z1 - z0) * j / nz
            row.append(bm.verts.new((x, y + amp * math.sin(u * waves * 2 * math.pi), z)))
        verts.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    ob = T.mesh_obj(name, bm, mat)
    s = ob.modifiers.new("Thick", "SOLIDIFY")
    s.thickness = 0.02
    s.offset = 0
    sub = ob.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    return ob


def jar(name, x, z, h, r, body, lid):
    T.cylinder(name, (x, 0.59, z + h / 2), r, h, body, bevel=r * 0.5)
    T.cylinder(name + "_lid", (x, 0.59, z + h + 0.018), r * 0.85, 0.04, lid, bevel=0.015)
    T.sphere(name + "_nub", (x, 0.59, z + h + 0.05), 0.018, lid)


def mug(name, x, z, mat):
    T.cylinder(name, (x, 0.59, z + 0.055), 0.05, 0.11, mat, bevel=0.015)
    T.torus(name + "_h", (x + 0.055, 0.59, z + 0.058), 0.028, 0.01, mat, rot=(90, 0, 0))


# ----------------------------------------------------------------------------
def build():
    T.reset()
    # --- room shell --------------------------------------------------------
    wall = T.box("wall", (0, WALL_Y + 0.1, 1.9), (6.4, 0.2, 3.8),
                 T.proc_clay("wallpaper", wallpaper, rough=0.8), bevel=0.0, subsurf=0)
    cut = T.box("win_cut", (-0.95, WALL_Y + 0.1, 1.74), (1.0, 0.6, 0.86),
                T.clay("white"), bevel=0.0, subsurf=0)
    cut.hide_render = True
    bo = wall.modifiers.new("Window", "BOOLEAN")
    bo.object = cut
    bo.operation = "DIFFERENCE"
    wall.modifiers.move(len(wall.modifiers) - 1, 0)
    T.box("floor", (0, -1.0, -0.05), (6.4, 3.6, 0.1),
          T.proc_clay("floor", floor_checker, rough=0.5), bevel=0.0, subsurf=0)
    T.box("baseboard", (0, WALL_Y - 0.02, 0.06), (6.4, 0.05, 0.12), T.clay("wall_trim", 0.6),
          bevel=0.015)
    # tiled backsplash strip (split around the window)
    tile = T.proc_clay("tiles", tiles, rough=0.35)
    T.box("splash_l", (-2.05, WALL_Y - 0.005, 1.13), (1.1, 0.02, 0.46), tile, bevel=0.005,
          subsurf=0)
    T.box("splash_r", (1.1, WALL_Y - 0.005, 1.13), (2.9, 0.02, 0.46), tile, bevel=0.005,
          subsurf=0)
    T.box("splash_w", (-0.95, WALL_Y - 0.005, 1.1), (1.4, 0.02, 0.4), tile, bevel=0.005,
          subsurf=0)
    # picture rail
    T.box("rail", (0, WALL_Y - 0.01, 2.72), (6.4, 0.04, 0.05), T.clay("white", 0.5),
          bevel=0.015)

    # --- window with a sunny view -----------------------------------------
    wx, wz0, wz1, ww = -0.95, 1.31, 2.17, 1.0
    wzc = (wz0 + wz1) / 2
    T.box("sky", (wx, WALL_Y + 0.45, wzc), (1.6, 0.02, 1.4), sky_mat(), bevel=0.0,
          subsurf=0, outline=False)
    T.sphere("hill", (wx + 0.2, WALL_Y + 0.42, wz0 - 0.55), (1.2, 0.05, 0.75),
             T.flat("#8FD88A", 1.0), outline=False)
    T.sphere("hill2", (wx - 0.6, WALL_Y + 0.40, wz0 - 0.35), (0.7, 0.05, 0.5),
             T.flat("#7BCB7C", 1.0), outline=False)
    T.sphere("tree", (wx + 0.3, WALL_Y + 0.38, wz0 + 0.35), (0.16, 0.05, 0.19),
             T.flat("#5DB56A", 1.0), outline=False)
    T.box("trunk", (wx + 0.3, WALL_Y + 0.39, wz0 + 0.12), (0.035, 0.02, 0.2),
          T.flat("#B07A52", 1.0), bevel=0.01, outline=False)
    for i, (dx, dz, s) in enumerate(((-0.25, 0.6, 0.09), (-0.14, 0.62, 0.11), (-0.04, 0.6, 0.08))):
        T.sphere(f"cloud{i}", (wx + dx, WALL_Y + 0.36, wz0 + dz), (s, 0.03, s * 0.8),
                 T.flat("white", 1.0), outline=False)
    frame = T.clay("white", 0.45)
    fw = 0.07
    T.box("win_top", (wx, WALL_Y - 0.02, wz1 + fw / 2 - 0.01), (ww + 2 * fw, 0.1, fw), frame, 0.02)
    T.box("win_bot", (wx, WALL_Y - 0.05, wz0 - 0.02), (ww + 2 * fw + 0.12, 0.2, 0.06), frame, 0.02)
    for s in (-1, 1):
        T.box(f"win_side{s}", (wx + s * (ww / 2 + fw / 2 - 0.01), WALL_Y - 0.02, wzc),
              (fw, 0.1, wz1 - wz0 + 0.02), frame, 0.02)
    T.box("mull_v", (wx, WALL_Y + 0.02, wzc), (0.035, 0.04, wz1 - wz0), frame, 0.01)
    T.box("mull_h", (wx, WALL_Y + 0.02, wzc + 0.05), (ww, 0.04, 0.035), frame, 0.01)
    # gingham cafe curtains + rod
    ging = T.proc_clay("gingham", gingham, rough=0.75, sss=0.1)
    T.capsule("rod", (wx - ww / 2 - 0.2, WALL_Y - 0.1, wz1 + 0.08),
              (wx + ww / 2 + 0.2, WALL_Y - 0.1, wz1 + 0.08), 0.015, T.clay("wood_dark", 0.5))
    for s in (-1, 1):
        T.sphere(f"rod_end{s}", (wx + s * (ww / 2 + 0.22), WALL_Y - 0.1, wz1 + 0.08), 0.03,
                 T.clay("wood_dark", 0.5))
    wavy_panel("curtain_l", wx - ww / 2 - 0.17, wx - ww / 2 + 0.14, wz0 + 0.02, wz1 + 0.08,
               WALL_Y - 0.12, ging, waves=3)
    wavy_panel("curtain_r", wx + ww / 2 - 0.14, wx + ww / 2 + 0.17, wz0 + 0.02, wz1 + 0.08,
               WALL_Y - 0.12, ging, waves=3)
    wavy_panel("valance", wx - ww / 2 - 0.17, wx + ww / 2 + 0.17, wz1 - 0.1, wz1 + 0.08,
               WALL_Y - 0.14, ging, waves=9, amp=0.02)
    # plant on the sill
    T.cylinder("pot", (wx + 0.3, WALL_Y - 0.08, wz0 + 0.07), 0.07, 0.12,
               T.clay("coral", 0.55), bevel=0.02, radius2=0.085)
    for i, (dx, dz, r) in enumerate(((0, 0.19, 0.07), (-0.07, 0.16, 0.055), (0.07, 0.17, 0.055),
                                     (-0.03, 0.25, 0.05), (0.04, 0.24, 0.05))):
        T.sphere(f"leaf{i}", (wx + 0.3 + dx, WALL_Y - 0.09, wz0 + dz), r, T.clay("leaf", 0.5))
    T.sphere("pot_herb", (wx - 0.3, WALL_Y - 0.08, wz0 + 0.08), (0.06, 0.05, 0.05),
             T.clay("lilac", 0.55))
    for i in range(5):
        a = math.radians(-60 + i * 30)
        T.capsule(f"herb{i}", (wx - 0.3, WALL_Y - 0.08, wz0 + 0.1),
                  (wx - 0.3 + 0.1 * math.sin(a), WALL_Y - 0.09, wz0 + 0.1 + 0.14 * math.cos(a)),
                  0.02, T.clay("leaf_dark", 0.5), r1=0.012)

    # --- fridge ------------------------------------------------------------
    fx0, fx1, fh = -2.52, -1.72, 1.95
    fxc = (fx0 + fx1) / 2
    mint = T.gloss("mint", 0.35)
    T.box("fridge", (fxc, 0.37, fh / 2 + 0.03), (fx1 - fx0, 0.64, fh), mint, bevel=0.1)
    T.box("fridge_door_top", (fxc, 0.05, 1.62), (fx1 - fx0 - 0.06, 0.04, 0.58), mint, 0.05)
    T.box("fridge_door_bot", (fxc, 0.05, 0.72), (fx1 - fx0 - 0.06, 0.04, 1.14), mint, 0.05)
    steel = T.clay("steel", 0.3, 0.0, spec=0.6)
    T.capsule("fh_top", (fx1 - 0.1, 0.0, 1.42), (fx1 - 0.1, 0.0, 1.64), 0.018, steel)
    T.capsule("fh_bot", (fx1 - 0.1, 0.0, 1.0), (fx1 - 0.1, 0.0, 1.26), 0.018, steel)
    for i, (dx, dz, c) in enumerate(((-0.2, 1.1, "coral"), (0.05, 0.85, "butter"),
                                     (-0.12, 0.55, "sky"))):
        T.cylinder(f"magnet{i}", (fxc + dx, 0.015, dz), 0.045, 0.02, T.gloss(c, 0.3),
                   bevel=0.008, rot=(90, 0, 0))
    # a kid's drawing held by a magnet
    T.box("drawing", (fxc - 0.05, 0.022, 0.72), (0.26, 0.005, 0.32), T.clay("white", 0.8),
          bevel=0.004, subsurf=0)
    T.sphere("drawing_sun", (fxc - 0.1, 0.017, 0.8), (0.05, 0.005, 0.05), T.clay("butter", 0.7),
             outline=False)
    T.box("drawing_house", (fxc + 0.0, 0.017, 0.65), (0.1, 0.005, 0.1), T.clay("coral", 0.7),
          bevel=0.004, subsurf=0, outline=False)
    T.cylinder("magnet_d", (fxc - 0.05, 0.01, 0.86), 0.03, 0.02, T.gloss("lilac", 0.3),
               bevel=0.008, rot=(90, 0, 0))
    # cookie jar on top
    T.cylinder("cookiejar", (fxc, 0.4, fh + 0.16), 0.12, 0.22, T.gloss("pink", 0.3),
               bevel=0.05)
    T.sphere("cookiejar_lid", (fxc, 0.4, fh + 0.29), (0.11, 0.11, 0.05), T.gloss("white", 0.3))
    T.sphere("cookiejar_nub", (fxc, 0.4, fh + 0.35), 0.03, T.gloss("coral", 0.3))

    # --- counters ----------------------------------------------------------
    body = T.clay("butter", 0.55)
    door = T.clay("#FFE39A", 0.5)
    top = T.proc_clay("woodtop", wood_grain, rough=0.5)
    base_cabinet("cabA", -1.68, -0.22, body, door, top, doors=2)
    base_cabinet("cabB", 0.62, 2.62, body, door, top, doors=3)
    # cutting board + utensil crock on counter A
    T.box("board", (-1.0, 0.36, 0.925), (0.5, 0.3, 0.03), T.clay("wood_dark", 0.55), 0.012)
    T.cylinder("crock", (-0.45, 0.55, 1.0), 0.07, 0.16, T.gloss("teal", 0.35), bevel=0.03)
    for i, (dx, tz, c) in enumerate(((-0.03, 1.22, "wood"), (0.02, 1.25, "coral"),
                                     (0.04, 1.2, "steel"))):
        T.capsule(f"utensil{i}", (-0.45 + dx * 0.3, 0.55, 1.02), (-0.45 + dx, 0.55, tz), 0.012,
                  T.clay(c, 0.5))
        T.sphere(f"utensil_head{i}", (-0.45 + dx, 0.55, tz + 0.03), (0.035, 0.015, 0.045),
                 T.clay(c, 0.5))
    # toaster on counter B
    T.box("toaster", (2.25, 0.5, 1.02), (0.34, 0.2, 0.22), T.gloss("sky", 0.35), bevel=0.07)
    T.box("toast", (2.2, 0.5, 1.15), (0.14, 0.03, 0.1), T.clay("#F2BF7A", 0.7), bevel=0.02)
    T.box("toaster_lever", (2.4, 0.39, 1.06), (0.04, 0.03, 0.02), T.clay("iron", 0.4), 0.008)

    # --- stove + hood -------------------------------------------------------
    sx0, sx1 = -0.2, 0.6
    sxc = (sx0 + sx1) / 2
    coral = T.gloss("coral", 0.35)
    T.box("stove", (sxc, 0.4, 0.45), (sx1 - sx0, 0.62, 0.9), coral, bevel=0.06)
    T.box("cooktop", (sxc, 0.4, 0.915), (sx1 - sx0 - 0.02, 0.6, 0.04),
          T.clay("iron", 0.4, 0.0), bevel=0.015)
    for i, (bx, by) in enumerate(((-0.2, 0.26), (0.2, 0.26), (-0.2, 0.54), (0.2, 0.54))):
        T.torus(f"burner{i}", (sxc + bx, by, 0.94), 0.075, 0.013, T.clay("#2E3440", 0.4))
        T.torus(f"burner_in{i}", (sxc + bx, by, 0.94), 0.035, 0.01, T.clay("#2E3440", 0.4))
    T.box("backguard", (sxc, 0.66, 1.03), (sx1 - sx0, 0.08, 0.22), coral, bevel=0.03)
    T.cylinder("clock_dial", (sxc, 0.615, 1.04), 0.06, 0.02, T.clay("cream", 0.5), bevel=0.008,
               rot=(90, 0, 0))
    for i in range(4):
        knob(f"sknob{i}", (sx0 + 0.13 + i * 0.18, 0.075, 0.82), T.clay("cream", 0.45), 0.032)
    T.box("oven_door", (sxc, 0.085, 0.43), (sx1 - sx0 - 0.1, 0.04, 0.6),
          T.gloss("#F68A75", 0.35), bevel=0.04)
    T.box("oven_window", (sxc, 0.06, 0.4), (0.44, 0.02, 0.3), T.gloss("#3B2E3A", 0.15),
          bevel=0.05)
    T.box("oven_glint", (sxc - 0.12, 0.048, 0.46), (0.06, 0.005, 0.12),
          T.flat("#6D5D6E", 1.0), bevel=0.02, rot=(0, -25, 0), outline=False)
    T.capsule("oven_handle", (sx0 + 0.13, 0.02, 0.67), (sx1 - 0.13, 0.02, 0.67), 0.018, steel)
    for s in (-1, 1):
        T.capsule(f"oven_handle_post{s}", (sxc + s * 0.25, 0.06, 0.67),
                  (sxc + s * 0.25, 0.02, 0.67), 0.012, steel)
    # hood: rounded frustum + chimney
    hood = T.cylinder("hood", (sxc, 0.47, 1.9), 0.5, 0.32, coral, bevel=0.05, segs=4,
                      radius2=0.2, rot=(0, 0, 45))
    T.box("chimney", (sxc, 0.6, 2.5), (0.26, 0.2, 1.0), coral, bevel=0.03)
    T.box("hood_band", (sxc, 0.14, 1.76), (0.7, 0.03, 0.05), T.clay("cream", 0.45), 0.015)

    # --- shelves -----------------------------------------------------------
    shelf = T.proc_clay("woodshelf", wood_grain, rough=0.5)
    for i, z in enumerate((1.46, 1.88)):
        T.box(f"shelf{i}", (1.62, 0.59, z), (1.7, 0.24, 0.045), shelf, bevel=0.015)
        for s in (-1, 1):
            T.box(f"bracket{i}{s}", (1.62 + s * 0.65, 0.66, z - 0.07), (0.035, 0.1, 0.1),
                  T.clay("wood_dark", 0.5), bevel=0.015)
    z1 = 1.46 + 0.0225
    jar("jar0", 0.95, z1, 0.2, 0.075, T.gloss("#FFEAA8", 0.3), T.clay("coral", 0.5))
    jar("jar1", 1.16, z1, 0.16, 0.07, T.gloss("#FFC9D6", 0.3), T.clay("teal", 0.5))
    jar("jar2", 1.36, z1, 0.24, 0.07, T.gloss("#D9F2E6", 0.3), T.clay("wood_dark", 0.5))
    mug("mug0", 1.68, z1, T.gloss("sky", 0.3))
    mug("mug1", 1.9, z1, T.gloss("butter", 0.3))
    for i in range(3):
        T.cylinder(f"bowlstack{i}", (2.23, 0.59, z1 + 0.025 + i * 0.045), 0.1 - i * 0.004, 0.05,
                   T.gloss(("lilac", "pink", "mint")[i], 0.3), bevel=0.02, radius2=0.08)
    z2 = 1.88 + 0.0225
    for i in range(3):
        T.cylinder(f"plate{i}", (0.95 + i * 0.07, 0.6, z2 + 0.13), 0.13, 0.025,
                   T.gloss(("white", "cream", "white")[i], 0.3), bevel=0.01,
                   rot=(78, 0, -8 + i * 3))
    T.cylinder("pot2", (1.55, 0.59, z2 + 0.06), 0.07, 0.12, T.clay("butter", 0.5), bevel=0.02)
    for i in range(6):
        a = i / 5.0
        T.sphere(f"trail{i}", (1.55 - 0.12 + 0.05 * math.sin(a * 5), 0.52, z2 + 0.08 - a * 0.28),
                 0.035, T.clay("leaf", 0.5))
    for i, (dx, dz) in enumerate(((0, 0.16), (-0.05, 0.13), (0.05, 0.14))):
        T.sphere(f"pot2_leaf{i}", (1.55 + dx, 0.58, z2 + dz), 0.05, T.clay("leaf", 0.5))
    # teapot
    tp = (2.1, 0.58, z2 + 0.1)
    T.sphere("teapot", tp, (0.12, 0.1, 0.1), T.gloss("teal", 0.3))
    T.capsule("spout", (tp[0] - 0.09, tp[1], tp[2]), (tp[0] - 0.19, tp[1], tp[2] + 0.07), 0.025,
              T.gloss("teal", 0.3), r1=0.015)
    T.torus("teapot_handle", (tp[0] + 0.11, tp[1], tp[2] + 0.01), 0.05, 0.014,
            T.gloss("teal", 0.3), rot=(90, 0, 0))
    T.sphere("teapot_lid", (tp[0], tp[1], tp[2] + 0.1), (0.06, 0.06, 0.025), T.gloss("cream", 0.3))
    T.sphere("teapot_knob", (tp[0], tp[1], tp[2] + 0.13), 0.02, T.gloss("coral", 0.3))

    # --- wall clock + pendant lamp + bunting -------------------------------
    T.cylinder("clock", (1.62, 0.66, 2.38), 0.19, 0.06, T.gloss("white", 0.35), bevel=0.02,
               rot=(90, 0, 0))
    T.torus("clock_rim", (1.62, 0.63, 2.38), 0.19, 0.022, T.gloss("coral", 0.35), rot=(90, 0, 0))
    T.box("clock_h", (1.62, 0.62, 2.43), (0.022, 0.01, 0.11), T.clay("ink", 0.5), 0.008,
          outline=False)
    T.box("clock_m", (1.67, 0.62, 2.38), (0.13, 0.01, 0.018), T.clay("ink", 0.5), 0.008,
          outline=False, rot=(0, 20, 0))
    T.sphere("clock_pin", (1.62, 0.61, 2.38), 0.018, T.gloss("coral", 0.35), outline=False)
    lx, lz = -0.95, 2.5
    T.tube("lamp_cord", [(lx, 0.25, 3.7), (lx, 0.25, lz + 0.1)], 0.008, T.clay("ink", 0.5),
           outline=False, caps=False)
    T.lathe("lamp_shade", [(0.0, 0.2), (0.04, 0.2), (0.07, 0.16), (0.16, 0.05), (0.2, -0.02),
                           (0.19, -0.03), (0.15, 0.03), (0.0, 0.14)],
            T.gloss("mustard", 0.35), loc=(lx, 0.25, lz))
    T.sphere("lamp_bulb", (lx, 0.25, lz - 0.01), 0.06, T.flat("#FFF4C9", 2.0), outline=False)
    # bunting across the top of the wall
    pts = []
    for i in range(21):
        x = -2.7 + 5.4 * i / 20
        pts.append((x, WALL_Y - 0.05, 3.18 - 0.12 * math.sin(math.pi * ((x + 2.7) / 2.7 % 1.0))))
    T.tube("bunting_string", pts, 0.008, T.clay("ink", 0.5), outline=False, caps=False)
    colors = ["coral", "butter", "mint", "sky", "lilac", "pink"]
    for i in range(18):
        x = -2.55 + i * 0.3
        zz = 3.18 - 0.12 * math.sin(math.pi * ((x + 2.7) / 2.7 % 1.0)) - 0.1
        T.cylinder(f"flag{i}", (x, WALL_Y - 0.06, zz), 0.12, 0.02,
                   T.clay(colors[i % len(colors)], 0.6), bevel=0.01, segs=3,
                   rot=(-90, 0, 0))


def export():
    t0 = time.time()
    T.add_outlines()
    T.frame(CX, CY, W, H)
    T.bpy.context.scene.render.film_transparent = False
    rt = T.render_to(os.path.join(T.SPRITES, NAME + ".png"))
    meta = {"file": NAME + ".png", "w": W, "h": H, "ppm": T.PPM, "cam_center": [CX, CY],
            "pitch_deg": T.PITCH_DEG,
            "note": "world->pixel: toylib.origin_px(cx, cy, w, h, world=(x, y, z))"}
    T.write_meta(NAME, meta)
    T.log_timing(NAME, time.time() - t0, {"render_only": round(rt, 2), "px": [W, H]})
    print(f"[bg] {NAME} in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    build()
    export()
