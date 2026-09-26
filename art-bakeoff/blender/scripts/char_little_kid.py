"""Little kid (~5): star tee, shorts, spiky tuft hair, waving.
Blender -b -P char_little_kid.py"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector, Matrix
import toylib as T
import charlib as C

NAME = "char_little_kid"
YAW = 14


def star(name, loc, R, r, depth, mat, parent, rot=None):
    bm = bmesh.new()
    verts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rad = R if i % 2 == 0 else r
        verts.append(bm.verts.new((rad * math.cos(a), rad * math.sin(a), 0)))
    f = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = T.mesh_obj(name, bm, mat, loc=loc, rot=rot, parent=parent, smooth=False)
    b = ob.modifiers.new("Bevel", "BEVEL")
    b.width = depth * 0.45
    b.segments = 3
    return ob


def build():
    T.reset()
    root = T.empty("root")
    skin = T.clay("skin", rough=0.55, sss=0.25)
    shirt = T.clay("blue", rough=0.6)
    shorts = T.clay("orange", rough=0.6)
    hair = T.clay("hair_caramel", rough=0.45, sheen=0.35)
    shoe = T.clay("tomato", rough=0.4, coat=0.4)
    sole = T.clay("white", rough=0.5)

    # legs + sneakers
    for s in (-1, 1):
        T.capsule(f"leg{s}", (s * 0.058, 0, 0.05), (s * 0.058, 0, 0.19), 0.037, skin,
                  parent=root)
        T.sphere(f"sole{s}", (s * 0.064, -0.02, 0.022), (0.062, 0.092, 0.024), sole,
                 parent=root)
        T.sphere(f"shoe{s}", (s * 0.064, -0.018, 0.045), (0.058, 0.086, 0.045), shoe,
                 parent=root)
    # shorts + tee (a round tummy reads younger)
    T.cylinder("shorts", (0, 0, 0.2), 0.132, 0.11, shorts, bevel=0.045, parent=root)
    T.sphere("tee", (0, 0, 0.33), (0.148, 0.128, 0.15), shirt, parent=root)
    T.capsule("neck", (0, 0, 0.4), (0, 0, 0.5), 0.045, skin, parent=root)
    p, d = T.on_sphere((0, 0, 0.33), 0.128, 0, 6, extra=-0.004)
    star("star", p + Vector((0, 0, 0)), 0.055, 0.024, 0.012, T.clay("butter", rough=0.45),
         root, rot=T.face_rot(d) @ Matrix.Rotation(math.radians(90), 4, "X"))
    # arms: left one waving high, right one relaxed
    for s, hand in ((-1, (-0.2, -0.04, 0.22)), (1, (0.26, -0.03, 0.56))):
        sh = (s * 0.12, 0, 0.39)
        T.sphere(f"sleeve{s}", sh, 0.058, shirt, parent=root)
        T.capsule(f"arm{s}", sh, hand, 0.034, skin, parent=root)
        T.sphere(f"hand{s}", hand, (0.046, 0.042, 0.048), skin, parent=root)

    # head (bigger relative to body than the big kid)
    c, r = Vector((0, 0, 0.7)), 0.25
    C.head_base(c, r, root, skin)
    n = Vector((0, -1, -0.8)).normalized()
    T.shell_cut("hair_cap", c + Vector((0, 0.01, 0.02)), r * 1.06, hair,
                plane_co=(0, -0.08, 0.015), plane_no=n, thickness=0.028, parent=root)
    # soft clay clumps: a swept fringe over the forehead + a crown with a cowlick
    for i, (yaw, pitch, sz) in enumerate(((-40, 34, 0.055), (-15, 40, 0.062), (11, 40, 0.06),
                                          (36, 34, 0.052))):
        p, d = T.on_sphere(c, r, yaw, pitch, extra=0.012)
        tip, _ = T.on_sphere(c, r, yaw - 13, pitch - 12, extra=0.016)
        T.capsule(f"fringe{i}", p, tip, sz, hair, r1=0.016, parent=root)
    for i, (yaw, pitch) in enumerate(((-25, 62), (20, 64), (0, 52), (-55, 40), (55, 40))):
        p, d = T.on_sphere(c, r, yaw, pitch, extra=0.0)
        T.sphere(f"clump{i}", p, 0.075, hair, parent=root)
    T.tube("cowlick", [tuple(c + Vector((0.0, 0.03, r * 1.05))),
                       tuple(c + Vector((0.03, 0.02, r * 1.05 + 0.08))),
                       tuple(c + Vector((0.08, 0.0, r * 1.05 + 0.1))),
                       tuple(c + Vector((0.1, -0.01, r * 1.05 + 0.07)))], 0.017, hair,
           parent=root, outline=True)

    face = C.build_face_parts(c, r, root)
    root.rotation_euler.z = math.radians(YAW)
    return face


if __name__ == "__main__":
    face = build()
    C.export_character(NAME, face)
