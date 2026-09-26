"""Whole tomato + sliced tomato props.  Blender -b -P prop_tomato.py"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector, Matrix
import toylib as T

R = 0.12   # toy scale: tomatoes are chunky so a 5-year-old can grab them


def lobed_tomato(name, loc, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=36, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        a = math.atan2(y, x)
        lobe = 1.0 + 0.045 * math.cos(5 * a) * (1 - abs(z))   # gentle 5 lobes
        v.co.x *= R * lobe
        v.co.y *= R * lobe
        # squash + dimple at the top where the stem sits
        v.co.z = z * R * 0.82 - 0.03 * max(0.0, z) ** 8
    return T.mesh_obj(name, bm, T.gloss("tomato", 0.32), loc=loc, parent=parent)


def calyx(top, parent=None, scale=1.0):
    g = T.clay("leaf", rough=0.5)
    for i in range(5):
        a = math.radians(i * 72 + 18)
        d = Vector((math.cos(a), math.sin(a), 0))
        p = Vector(top) + d * 0.038 * scale + Vector((0, 0, -0.004))
        rot = Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(math.radians(-14), 4, "Y")
        T.sphere(f"sepal{i}", p, (0.045 * scale, 0.017 * scale, 0.009 * scale), g, rot=rot,
                 parent=parent)
    T.capsule("stem", Vector(top) + Vector((0, 0, -0.005)),
              Vector(top) + Vector((0.012, 0, 0.04 * scale)), 0.009 * scale,
              T.clay("leaf_dark", rough=0.5), parent=parent)


def cross_section(parent, radius, n=4, seed=3):
    """Flat decals for a cut tomato face, in parent-local XY at z=0."""
    rnd = random.Random(seed)
    flesh = T.clay("#FF6F5E", rough=0.35, sss=0.25, sheen=0.0)
    jelly = T.gloss("#FFB199", 0.25)
    seedm = T.clay("#FFF0B8", rough=0.4)
    T.cylinder("flesh", (0, 0, 0.001), radius * 0.86, 0.004, flesh, bevel=0.0015,
               parent=parent, outline=False)
    T.sphere("core", (0, 0, 0.004), (radius * 0.2, radius * 0.2, 0.004), flesh,
             parent=parent, outline=False)
    for i in range(n):
        a = 2 * math.pi * i / n + 0.4
        c = Vector((math.cos(a), math.sin(a), 0)) * radius * 0.5
        rot = Matrix.Rotation(a, 4, "Z")
        T.sphere(f"jelly{i}", c + Vector((0, 0, 0.004)),
                 (radius * 0.26, radius * 0.19, 0.005), jelly, rot=rot, parent=parent,
                 outline=False)
        for s in range(3):
            off = Vector((rnd.uniform(-0.3, 0.3), (s - 1) * 0.45, 0)) * radius * 0.28
            T.sphere(f"seed{i}_{s}", c + rot.to_3x3() @ off + Vector((0, 0, 0.009)),
                     (radius * 0.055, radius * 0.035, 0.003), seedm,
                     rot=rot @ Matrix.Rotation(1.57, 4, "Z"), parent=parent, outline=False)


def build_whole():
    T.reset()
    lobed_tomato("tomato", (0, 0, R * 0.82))
    calyx((0, 0, R * 0.82 * 2 - 0.03))


def build_sliced():
    T.reset()
    # Half tomato, cut face turned toward the camera.
    root = T.empty("half", (-0.05, 0.05, R * 0.82), (0, 0, -25))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=36, radius=1.0)
    for v in bm.verts:
        v.co.x *= R
        v.co.y *= R
        v.co.z *= R * 0.82
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=(0, 0, 0),
                                 plane_no=(0, -1, 0), clear_outer=True)
    edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    bmesh.ops.edgeloop_fill(bm, edges=edges)
    T.mesh_obj("half_skin", bm, T.gloss("tomato", 0.32), parent=root)
    face = T.empty("half_face", (0, -0.001, 0), (90, 0, 0))
    face.parent = root
    face.scale = (1, 0.82, 1)
    cross_section(face, R, n=3)
    calyx((0.0, 0.03, R * 0.82 - 0.02), parent=root, scale=0.9)
    # Two slices leaning in front, fanned.
    for i, (x, yaw, tilt) in enumerate(((0.07, 12, 62), (0.155, 22, 58))):
        s = T.empty(f"slice{i}", (x, -0.07 - i * 0.03, 0.075), (tilt, 0, yaw))
        rr = R * 0.9
        T.cylinder(f"slice{i}_skin", (0, 0, -0.012), rr, 0.024, T.gloss("tomato", 0.32),
                   bevel=0.008, parent=s)
        d = T.empty(f"slice{i}_face", (0, 0, 0.0005))
        d.parent = s
        cross_section(d, rr, n=4, seed=10 + i)


if __name__ == "__main__":
    build_whole()
    T.export_sprite("prop_tomato_whole")
    build_sliced()
    T.export_sprite("prop_tomato_sliced")
