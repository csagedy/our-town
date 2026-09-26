"""Big kid (~9): cafe chef in a cream apron, high pigtails.
Blender -b -P char_big_kid.py"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector
import toylib as T
import charlib as C

NAME = "char_big_kid"
YAW = -14          # turn slightly toward screen-left


def apron(root, z0, z1, r_bot, r_top, mat):
    """Front-only shell that hugs the A-line dress."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=72, radius1=r_bot, radius2=r_top,
                          depth=z1 - z0)
    kill = [f for f in bm.faces if f.calc_center_median().y > -0.55 * (r_bot + r_top) / 2]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    ob = T.mesh_obj("apron", bm, mat, loc=(0, 0, (z0 + z1) / 2), parent=root)
    s = ob.modifiers.new("Thick", "SOLIDIFY")
    s.thickness = 0.012
    s.offset = 1
    b = ob.modifiers.new("Bevel", "BEVEL")
    b.width = 0.005
    b.segments = 2
    sub = ob.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    return ob


def build():
    T.reset()
    root = T.empty("root")
    skin = T.clay("skin", rough=0.55, sss=0.25)
    dress = T.clay("lilac", rough=0.6)
    hair = T.clay("hair_brown", rough=0.45, sheen=0.35)
    apron_m = T.clay("cream", rough=0.65)
    accent = T.clay("coral", rough=0.5)
    shoe = T.clay("teal", rough=0.45, coat=0.3)

    # legs + shoes
    for s in (-1, 1):
        T.capsule(f"leg{s}", (s * 0.07, 0, 0.06), (s * 0.07, 0, 0.27), 0.042,
                  T.clay("plum", rough=0.6), parent=root)
        T.sphere(f"shoe{s}", (s * 0.078, -0.025, 0.045), (0.066, 0.1, 0.052), shoe,
                 parent=root)
    # A-line dress, neck
    T.cylinder("dress", (0, 0, 0.42), 0.205, 0.34, dress, bevel=0.07, radius2=0.12,
               parent=root)
    T.capsule("neck", (0, 0.0, 0.56), (0, 0.0, 0.7), 0.05, skin, parent=root)
    # apron + pocket + straps
    apron(root, 0.28, 0.585, 0.222, 0.138, apron_m)
    T.box("pocket", (0, -0.2, 0.365), (0.13, 0.03, 0.075), accent, bevel=0.02,
          rot=(-11, 0, 0), parent=root)
    for s in (-1, 1):
        T.tube(f"strap{s}", [(s * 0.075, -0.125, 0.575), (s * 0.07, -0.095, 0.63),
                             (s * 0.065, -0.05, 0.69)], 0.012, accent, parent=root,
               outline=True)
    # arms: puff sleeve, skin arm, mitten hand
    for s in (-1, 1):
        T.sphere(f"sleeve{s}", (s * 0.135, 0.0, 0.54), 0.065, dress, parent=root)
        T.capsule(f"arm{s}", (s * 0.16, 0.0, 0.52), (s * 0.235, -0.04, 0.37), 0.044, skin,
                  parent=root)
        T.sphere(f"hand{s}", (s * 0.245, -0.05, 0.345), (0.05, 0.045, 0.052), skin,
                 parent=root)

    # head
    c, r = Vector((0, 0, 0.895)), 0.26
    C.head_base(c, r, root, skin)
    # hair cap: sphere with the face window cut away
    n = Vector((0, -1, -1.05)).normalized()
    T.shell_cut("hair_cap", c + Vector((0, 0.012, 0.015)), r * 1.075, hair,
                plane_co=(0, -0.1, -0.035), plane_no=n, thickness=0.03, parent=root)
    # back of the hair (fills the lower back so the head reads as hair from any angle)
    T.sphere("hair_back", c + Vector((0, 0.07, -0.06)), (r * 1.02, r * 0.9, r * 0.92), hair,
             parent=root)
    # scalloped bangs
    for i, yaw in enumerate((-42, -21, 0, 21, 42)):
        p, d = T.on_sphere(c, r, yaw, 30 - abs(yaw) * 0.12, extra=0.005)
        T.sphere(f"bang{i}", p, (0.07, 0.035, 0.062), hair, rot=T.face_rot(d, 0), parent=root)
    # pigtail puffs + bobbles
    for s in (-1, 1):
        T.sphere(f"pigtail{s}", c + Vector((s * 0.3, 0.07, 0.1)), (0.105, 0.1, 0.12), hair,
                 parent=root)
        T.sphere(f"bobble{s}", c + Vector((s * 0.235, 0.04, 0.12)), 0.038,
                 T.gloss("coral", 0.3), parent=root)

    face = C.build_face_parts(c, r, root)
    root.rotation_euler.z = math.radians(YAW)
    return face


if __name__ == "__main__":
    face = build()
    C.export_character(NAME, face)
