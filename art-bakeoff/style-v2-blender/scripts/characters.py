"""The three cast members, rigged and rendered in every pose + face layers.

Blender -b --factory-startup -P characters.py -- [girl] [boy] [adult]

  char_girl   9-year-old cafe chef: striped tee, blush apron, auburn pigtails
  char_boy    5-year-old: star tee, rolled shorts, bath-towel cape, messy tuft
  char_adult  grown-up customer: curly hair bun, round glasses, cardigan
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
import toonlib as T
import toonchar as C


def cut_mesh(ob, planes):
    """Bisect an object's mesh by (co, no) planes in LOCAL space, keeping the
    side the normal points AWAY from (clear_outer)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=co, plane_no=no,
                               clear_outer=True)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def solidify(ob, t, offset=1.0):
    s = ob.modifiers.new("Thick", "SOLIDIFY")
    s.thickness = t
    s.offset = offset
    s.use_even_offset = True
    return s


def hair_cap(rig, mat, grow=1.07, back_cut=-0.05, fringe_z=0.07, fringe_tilt=0.0,
             fringe_grow=1.055, name="hair"):
    """Bold single-shape hair: a back/side shell framing the face + a top fringe."""
    c = rig.head_c
    rx, ry, rz = rig.head_r
    back = T.sphere(f"{rig.name}_{name}_back", c + Vector((0, 0.012, 0.012)),
                    (rx * grow, ry * grow, rz * grow), mat, segs=40, rings=24)
    cut_mesh(back, [((0, back_cut, 0), (0, -1, 0))])      # keep y > back_cut
    solidify(back, 0.012, -1)
    T._subsurf(back)
    rig.attach(back, "head")
    top = T.sphere(f"{rig.name}_{name}_top", c + Vector((0, 0, 0.008)),
                   (rx * fringe_grow, ry * fringe_grow, rz * fringe_grow), mat, segs=40, rings=24)
    no = Vector((fringe_tilt, 0, -1)).normalized()
    cut_mesh(top, [((0, 0, fringe_z), no)])              # keep z > fringe line
    solidify(top, 0.012, -1)
    T._subsurf(top)
    rig.attach(top, "head")
    return back, top


def fringe(rig, mat, edge_fn, grow=1.055, name="fringe", nu=120, nv=18):
    """Top-of-head hair shell whose lower edge follows edge_fn(theta) -> z (m,
    relative to head centre); theta = 0 at the front, +/-pi at the back.
    Built directly on the ellipsoid, so the scalloped edge is perfectly smooth."""
    c = rig.head_c
    rx, ry, rz = (r * grow for r in rig.head_r)
    bm = bmesh.new()
    rows = []
    for j in range(nv + 1):
        row = []
        for i in range(nu):
            th = -math.pi + 2 * math.pi * i / nu
            z_edge = max(-0.97 * rz, min(0.97 * rz, edge_fn(th)))
            lat_e = math.asin(z_edge / rz)
            lat = math.pi / 2 - (math.pi / 2 - lat_e) * j / nv
            if j == 0:
                lat = math.pi / 2 - 1e-3
            x = rx * math.cos(lat) * math.sin(th)
            y = -ry * math.cos(lat) * math.cos(th)
            z = rz * math.sin(lat)
            row.append(bm.verts.new((c.x + x, c.y + y + 0.01 * (1 - math.cos(th)) / 2, c.z + z)))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            k = (i + 1) % nu
            bm.faces.new((rows[j][i], rows[j][k], rows[j + 1][k], rows[j + 1][i]))
    bmesh.ops.remove_doubles(bm, verts=rows[0], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = T.mesh_obj(f"{rig.name}_{name}", bm, mat)
    solidify(ob, 0.012, -1)
    T._subsurf(ob)
    rig.attach(ob, "head")
    return ob


def strands(rig, strokes, grow=1.062, width_px=2.2):
    """Interior hair lines (Toca-style strand strokes): thin ink tubes lying on
    the hair surface. strokes: lists of (theta deg from front, latitude deg)."""
    c = rig.head_c
    rx, ry, rz = (r * grow for r in rig.head_r)
    ink = T.flat("ink")
    for k, st in enumerate(strokes):
        pts = []
        for th, lat in st:
            th, lat = math.radians(th), math.radians(lat)
            pts.append((c.x + rx * math.cos(lat) * math.sin(th),
                        c.y - ry * math.cos(lat) * math.cos(th) + 0.01 * (1 - math.cos(th)) / 2,
                        c.z + rz * math.sin(lat)))
        ob = T.tube(f"{rig.name}_strand{k}", pts, width_px / 2 / T.PPM, ink, line=False)
        rig.attach(ob, "head")


def scallop(base, amp, n, tilt=0.0, front=1.25, side_z=-0.12):
    """Edge function: pointy locks across the forehead, dropping at the sides."""
    def f(th):
        a = abs(th)
        if a < front:
            return base + tilt * th + amp * abs(math.sin(n * th))
        t = min(1.0, (a - front) / 0.5)
        z0 = base + tilt * math.copysign(front, th) + amp * abs(math.sin(n * front))
        return z0 + (side_z - z0) * (t * t * (3 - 2 * t))
    return f


def bangs(rig, mat, locks, z=0.07, depth=1.0):
    """Chunky fringe locks hanging from the hairline: gives a scalloped edge.
    locks: list of (x offset m, length m, width m, tilt deg)."""
    c = rig.head_c
    rx, ry, rz = rig.head_r
    out = []
    for i, (dx, ln, wd, tilt) in enumerate(locks):
        # sit the lock on the head surface at (dx, z)
        yy = -ry * math.sqrt(max(0.05, 1 - (dx / rx) ** 2 - (z / rz) ** 2)) * depth
        p = c + Vector((dx, yy + 0.004, z + 0.005))
        ob = T.sphere(f"{rig.name}_bang{i}", p, (wd, 0.03, ln), mat, segs=20, rings=12,
                      rot=(-12, tilt, 0))
        rig.attach(ob, "head")
        out.append(ob)
    return out


# ----------------------------------------------------------------------------
def girl():
    T.reset()
    rig = C.Rig("girl", hip_z=0.36, hip_x=0.072, knee_z=0.21, ankle_z=0.075, sh_x=0.125,
                sh_z=0.645, elbow=(0.165, 0.51), wrist=(0.185, 0.395), neck_z=0.72,
                head_c=(0, 0, 0.975), head_r=(0.27, 0.24, 0.25))
    skin = "skin_tan"
    C.head(rig, skin, ears=False)
    shirt = T.stripes("cream", "teal", 0.05, axis="z", duty=0.55)
    C.torso(rig, shirt, 0.158, 0.13, 0.32, 0.73)
    for s in "RL":
        C.arm(rig, s, "teal", skin, r=0.043)
        C.leg(rig, s, "plum", "plum", "white", r=0.05, shoe=(0.07, 0.1, 0.048), sole="rose")
    # apron: a shell over the torso front, plus a skirt panel over the thighs
    prof = [(0.0, 0.3), (0.172, 0.3), (0.172, 0.34), (0.165, 0.45), (0.152, 0.55),
            (0.14, 0.65), (0.0, 0.66)]
    ap = T.lathe("girl_apron", prof, T.toon("blush"), segs=40, scale=(1, 0.74, 1))
    cut_mesh(ap, [((0, -0.06 / 0.74, 0), (0, 1, 0)), ((0, 0, 0.625), (0, 0, 1))])
    solidify(ap, 0.008)
    T._subsurf(ap)
    rig.attach(ap, "chest")
    sk = T.box("girl_apron_skirt", (0, -0.128, 0.245), (0.3, 0.02, 0.15), T.toon("blush"),
               round_=0.02)
    rig.attach(sk, "hips")
    pk = T.box("girl_pocket", (0, -0.145, 0.43), (0.13, 0.012, 0.075), T.toon("rose"),
               round_=0.01)
    rig.attach(pk, "chest")
    hrt = T.prism("girl_heart", T.heart_pts(0.022), 0.006, T.toon("tomato", shade=False),
                  loc=(0, -0.153, 0.434))
    rig.attach(hrt, "chest")
    for s in (1, -1):   # neck straps
        st = T.tube(f"girl_strap{s}", [(s * 0.1, -0.11, 0.62), (s * 0.085, -0.1, 0.7),
                                       (s * 0.05, -0.06, 0.745)], 0.011, T.toon("blush"),
                    line=True)
        rig.attach(st, "chest")
    # hair: auburn cap with a side-swept fringe and two puffy low pigtails
    hm = T.toon("hair_auburn", cut=0.06)
    hair_cap(rig, hm, fringe_z=0.2, fringe_tilt=0.0)
    fringe(rig, hm, scallop(0.052, 0.034, 2.6, tilt=0.03, side_z=-0.09))
    strands(rig, [[(22, 84), (26, 62), (22, 42)],
                  [(-8, 66), (-18, 48), (-20, 30)],
                  [(-40, 58), (-50, 40), (-52, 22)],
                  [(48, 56), (56, 38), (58, 20)]])
    c = rig.head_c
    for s in (1, -1):
        tie = T.sphere(f"girl_tie{s}", c + Vector((s * 0.265, 0.04, -0.07)), (0.04, 0.04, 0.035),
                       T.toon("mustard"), segs=20, rings=12)
        rig.attach(tie, "head")
        puff = T.sphere(f"girl_tail{s}", c + Vector((s * 0.31, 0.05, -0.19)), (0.085, 0.075, 0.13),
                        hm, segs=28, rings=16, rot=(0, s * -12, 0))
        T._subsurf(puff)
        rig.attach(puff, "head")
    style = dict(eye=(0.05, 0.064), eye_dx=0.098, eye_z=-0.015, mouth_z=-0.118, mouth_w=0.065,
                 lash=True)
    return C.export_character("char_girl", rig, style)


# ----------------------------------------------------------------------------
def boy():
    T.reset()
    rig = C.Rig("boy", hip_z=0.285, hip_x=0.064, knee_z=0.165, ankle_z=0.065, sh_x=0.112,
                sh_z=0.505, elbow=(0.148, 0.395), wrist=(0.163, 0.3), neck_z=0.565,
                head_c=(0, 0, 0.8), head_r=(0.255, 0.225, 0.235))
    skin = "skin_light"
    C.head(rig, skin, ears=True)
    C.torso(rig, T.toon("denim"), 0.14, 0.12, 0.25, 0.575)
    star = T.prism("boy_star", T.star_pts(0.062, 0.028), 0.01, T.toon("butter"),
                   loc=(0, -0.104, 0.43))
    rig.attach(star, "chest")
    for s in "RL":
        C.arm(rig, s, "denim", skin, r=0.04)
        C.leg(rig, s, "sage", skin, "tomato", r=0.056, shin_r=0.042, shoe=(0.068, 0.095, 0.046),
              sole="white")
    # shorts hem: a band so the shorts read as shorts
    shorts = T.lathe("boy_shorts", [(0, 0.2), (0.14, 0.2), (0.145, 0.24), (0.14, 0.29), (0, 0.29)],
                     T.toon("sage"), segs=36, scale=(1, 0.74, 1), subsurf=1)
    rig.attach(shorts, "hips")
    # towel cape: a curved sheet behind the back, rose with two cream bands
    towel = T.stripes("rose", "cream", 0.2, axis="z", duty=0.82, offset=0.02)
    bm = bmesh.new()
    nx, nz = 12, 10
    verts = []
    for j in range(nz + 1):
        v = j / nz                      # 0 = top (shoulders), 1 = hem
        z = 0.54 - v * 0.46
        half = 0.11 + v * 0.17
        row = []
        for i in range(nx + 1):
            u = -1 + 2 * i / nx
            x = u * half
            y = 0.085 + 0.07 * v + 0.05 * (1 - u * u) * (0.4 + v)
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    cape = T.mesh_obj("boy_cape", bm, towel)
    solidify(cape, 0.012)
    T._subsurf(cape)
    rig.attach(cape, "chest")
    knot = T.sphere("boy_knot", (0, -0.085, 0.545), (0.04, 0.03, 0.03), T.toon("rose"),
                    segs=20, rings=12)
    rig.attach(knot, "chest")
    for s in (1, -1):
        ear = T.sphere(f"boy_knotend{s}", (s * 0.045, -0.088, 0.515), (0.028, 0.018, 0.04),
                       T.toon("rose"), segs=16, rings=10, rot=(0, s * 35, 0))
        rig.attach(ear, "chest")
    # hair: short brown cap, straight fringe, three tufts on top
    hm = T.toon("hair_brown", cut=0.06)
    hair_cap(rig, hm, grow=1.05, back_cut=0.02, fringe_z=0.2, fringe_tilt=0.0,
             fringe_grow=1.045)
    fringe(rig, hm, scallop(0.075, 0.03, 3.2, tilt=-0.02, side_z=0.02), grow=1.045)
    strands(rig, [[(-12, 62), (-18, 48), (-16, 36)], [(30, 58), (36, 45), (34, 34)]],
            grow=1.05)
    c = rig.head_c
    for i, (dx, rz, tilt) in enumerate(((-0.07, 0.07, 25), (0.02, 0.085, -8), (0.1, 0.06, -35))):
        tuft = T.sphere(f"boy_tuft{i}", c + Vector((dx, 0.0, 0.225)), (0.045, 0.045, rz), hm,
                        segs=20, rings=12, rot=(0, tilt, 0))
        rig.attach(tuft, "head")
    style = dict(eye=(0.048, 0.06), eye_dx=0.092, eye_z=-0.02, mouth_z=-0.108, mouth_w=0.06,
                 lash=False)
    return C.export_character("char_boy", rig, style)


# ----------------------------------------------------------------------------
def adult():
    T.reset()
    rig = C.Rig("adult", hip_z=0.62, hip_x=0.085, knee_z=0.34, ankle_z=0.075, sh_x=0.15,
                sh_z=0.975, elbow=(0.2, 0.78), wrist=(0.225, 0.6), neck_z=1.07,
                head_c=(0, 0, 1.3), head_r=(0.235, 0.215, 0.235))
    skin = "skin_deep"
    C.head(rig, skin, ears=True)
    C.torso(rig, T.toon("mustard"), 0.175, 0.16, 0.56, 1.085)
    # cream top showing down the open cardigan front, with buttons
    top = T.prism("adult_top", [(-0.085, 1.075), (0.085, 1.075), (0.028, 0.86), (0.028, 0.64),
                                (-0.028, 0.64), (-0.028, 0.86)], 0.02, T.toon("cream"),
                  loc=(0, -0.121, 0))
    rig.attach(top, "chest")
    for i in range(3):
        b = T.cylinder(f"adult_btn{i}", (0.07, -0.128, 0.93 - i * 0.1), 0.012, 0.01,
                       T.toon("wood_dark"), rot=(90, 0, 0), segs=16)
        rig.attach(b, "chest")
    for s in "RL":
        C.arm(rig, s, "mustard", skin, r=0.045, sleeve_len=2)
        C.leg(rig, s, "denim", "denim", "wood_dark", r=0.06, shoe=(0.075, 0.11, 0.05),
              sole="ink")
    # curly hair: a cloud of puffs around the back/top + a big top bun
    hm = T.toon("hair_black", cut=0.06)
    c = rig.head_c
    hair_cap(rig, hm, grow=1.06, back_cut=0.0, fringe_z=0.11, fringe_tilt=0.0, fringe_grow=1.05)
    for i in range(11):
        a = math.radians(-100 + i * 20)
        p = c + Vector((math.sin(a) * 0.245, 0.03, math.cos(a) * 0.23 + 0.01))
        puff = T.sphere(f"adult_curl{i}", p, (0.06, 0.06, 0.06), hm, segs=16, rings=10)
        rig.attach(puff, "head")
    bun = T.sphere("adult_bun", c + Vector((0, 0.02, 0.29)), (0.11, 0.1, 0.095), hm, segs=24,
                   rings=14)
    rig.attach(bun, "head")
    band = T.torus("adult_band", c + Vector((0, 0.02, 0.215)), 0.07, 0.016, T.toon("teal"),
                   rot=(0, 0, 0))
    rig.attach(band, "head")
    # round glasses (frames only; the eye layer shows through the lenses)
    ey, ez, edx = -0.212, c.z - 0.01, 0.08
    for s in (1, -1):
        g = T.torus(f"adult_glass{s}", (s * edx, c.y + ey, ez), 0.043, 0.0055, T.toon("ink",
                    shade=False), rot=(90, 0, 0), tube_segs=8, line=False)
        rig.attach(g, "head")
    br = T.tube("adult_bridge", [(-0.037, ey - 0.005, ez + 0.005), (0, ey - 0.012, ez + 0.012),
                                 (0.037, ey - 0.005, ez + 0.005)], 0.005,
                T.toon("ink", shade=False))
    rig.attach(br, "head")
    for s in (1, -1):
        ear = T.sphere(f"adult_earring{s}", (s * 0.228, 0.005, c.z - 0.075), 0.014,
                       T.toon("mustard"), segs=12, rings=8)
        rig.attach(ear, "head")
    style = dict(eye=(0.036, 0.046), eye_dx=0.08, eye_z=-0.01, mouth_z=-0.112, mouth_w=0.058,
                 lash=True)
    return C.export_character("char_adult", rig, style)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["girl", "boy", "adult"]
    for n in argv:
        {"girl": girl, "boy": boy, "adult": adult}[n]()
