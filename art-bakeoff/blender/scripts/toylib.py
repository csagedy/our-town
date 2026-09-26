"""toylib: shared helpers for the "toy / clay" Blender sprite pipeline.

Everything visual that should stay consistent across hundreds of sprites lives
here: the palette, clay materials, primitive builders, inverted-hull outlines,
lighting, the orthographic camera and the sprite exporter.

Every asset script does:
    import toylib as T
    T.reset()
    ... build geometry with T.sphere / T.box / T.capsule ...
    T.export_sprite("name")

Scale contract: all sprites are rendered at the same pixels-per-metre (PPM)
through the same camera angle, so sprites composite 1:1 with the background.
Each sprite gets a JSON sidecar with the pixel position of the world origin
(the "anchor": feet of a character, bottom-centre of a prop).
"""
import bpy, bmesh, math, os, json, time
import numpy as np
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SPRITES = os.path.join(ROOT, "sprites")
os.makedirs(SPRITES, exist_ok=True)

# ----------------------------------------------------------------------------
# Global look settings
# ----------------------------------------------------------------------------
PITCH_DEG = 14.0          # camera looks down this much (0 = dead front-on)
PPM = 2048 / 5.2          # pixels per metre (@2x). Kitchen frame is 5.2 m wide.
OUTLINE_PX = 2.6          # inverted-hull outline width in output pixels
SAMPLES = 64              # EEVEE TAA samples
PAD_PX = 8                # transparent padding around sprites
EXPOSURE = -0.3         # global brightness trim (stops)
CHAR_SCALE = 1.3        # toy-scale kids: bigger than "real" next to furniture

# ----------------------------------------------------------------------------
# Palette: change colours here (or override from a JSON file, see NOTES.md).
# ----------------------------------------------------------------------------
PALETTE = {
    # neutrals
    "cream":      "#FFF4DE",
    "wall":       "#FBE3C4",
    "wall_trim":  "#F4C9A0",
    "ink":        "#4A2C2A",   # outline colour (warm dark brown, never black)
    "white":      "#FFFDF7",
    # warm accents
    "butter":     "#FFD36E",
    "mustard":    "#F2B33D",
    "peach":      "#FFB38A",
    "coral":      "#F4735E",
    "tomato":     "#E8463A",
    "pink":       "#FF9FB2",
    "blush":      "#FF8A8A",
    # cool accents
    "mint":       "#9FE0C8",
    "teal":       "#3BB3A6",
    "sky":        "#8FD3F5",
    "blue":       "#5B9BE6",
    "lilac":      "#B79CEB",
    "leaf":       "#6CC56B",
    "leaf_dark":  "#3F9A4E",
    # materials
    "wood":       "#E2A566",
    "wood_dark":  "#B8733F",
    "steel":      "#B9C3CC",
    "iron":       "#4B5563",
    "choc":       "#7A4A34",
    "plum":       "#8C6CC8",
    "orange":     "#F7964A",
    # characters
    "skin":       "#FFC7A3",
    "skin_shade": "#F7B99A",
    "hair_brown": "#6E3F2A",
    "hair_caramel": "#9A5A34",
    "eye":        "#2B1B1F",
    "mouth":      "#8E2F3A",
    "tongue":     "#FF8595",
}

_pal_override = os.environ.get("TOY_PALETTE")
if _pal_override and os.path.exists(_pal_override):
    PALETTE.update(json.load(open(_pal_override)))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def col(name_or_hex, a=1.0):
    h = PALETTE.get(name_or_hex, name_or_hex).lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), a)


# ----------------------------------------------------------------------------
# Scene / render setup
# ----------------------------------------------------------------------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = SAMPLES
    try:
        sc.eevee.use_raytracing = True
        sc.eevee.ray_tracing_method = "SCREEN"
        sc.eevee.use_fast_gi = True
        sc.eevee.fast_gi_distance = 0.6
    except Exception:
        pass
    sc.eevee.shadow_resolution_scale = 1.0
    sc.render.film_transparent = True
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 90
    for vt in ("Standard", "AgX"):
        try:
            sc.view_settings.view_transform = vt
            break
        except Exception:
            continue
    try:
        sc.view_settings.look = "None"
    except Exception:
        pass
    sc.view_settings.exposure = EXPOSURE
    setup_world()
    setup_lights()
    setup_camera()
    _materials.clear()


def setup_world(color="#FFF1E0", strength=0.5):
    w = bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = col(color)
    bg.inputs["Strength"].default_value = strength


def _sun(name, rot_deg, strength, color, angle_deg):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = strength
    ld.color = col(color)[:3]
    ld.angle = math.radians(angle_deg)
    ob = bpy.data.objects.new(name, ld)
    ob.rotation_euler = Euler([math.radians(a) for a in rot_deg])
    bpy.context.scene.collection.objects.link(ob)
    return ob


def setup_lights():
    """Soft 3-light 'toy photo' rig. Suns so it is scale independent."""
    _sun("Key", (48, 0, -32), 2.6, "#FFF0DC", 22)     # warm key, upper-left-front
    _sun("Fill", (70, 0, 55), 0.7, "#DCEBFF", 40)     # cool fill, right
    _sun("Rim", (-60, 0, 160), 2.2, "#FFF6E8", 15)    # back-light for a soft rim


def cam_rot():
    return Euler((math.radians(90 - PITCH_DEG), 0, 0)).to_matrix()


def setup_camera():
    cd = bpy.data.cameras.new("Cam")
    cd.type = "ORTHO"
    cd.clip_start = 0.1
    cd.clip_end = 200
    ob = bpy.data.objects.new("Cam", cd)
    ob.rotation_euler = Euler((math.radians(90 - PITCH_DEG), 0, 0))
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def world_to_cam2d(p):
    """World point -> (x, y) in camera plane metres (x right, y up)."""
    q = cam_rot().transposed() @ Vector(p)
    return q.x, q.y


# ----------------------------------------------------------------------------
# Materials
# ----------------------------------------------------------------------------
_materials = {}


def _principled(m):
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m.node_tree.nodes.get("Principled BSDF")


def clay(color, rough=0.55, sss=0.12, sheen=0.15, spec=0.35, coat=0.0, key=None):
    """Matte, slightly waxy 'modelling clay / vinyl toy' surface."""
    key = key or f"clay_{color}_{rough}_{sss}_{coat}"
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(key)
    b = _principled(m)
    c = col(color)
    b.inputs["Base Color"].default_value = c
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Subsurface Weight"].default_value = sss
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.45, 0.3)
    b.inputs["Subsurface Scale"].default_value = 0.02
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Sheen Tint"].default_value = (1, 1, 1, 1)
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.2
    m.diffuse_color = c
    _materials[key] = m
    return m


def gloss(color, rough=0.22, key=None):
    """Shiny glazed / plastic / enamel look (eyes, cherries, enamel pans)."""
    return clay(color, rough=rough, sss=0.0, sheen=0.0, spec=0.6, coat=0.6,
                key=key or f"gloss_{color}_{rough}")


def flat(color, strength=1.0, key=None):
    """Unlit emission (sky outside the window, eye highlights)."""
    key = key or f"flat_{color}_{strength}"
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(key)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = col(color)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    _materials[key] = m
    return m


def proc_clay(key, build_color, rough=0.6, sss=0.05, sheen=0.2):
    """Clay material whose base colour comes from a node builder.
    build_color(nt, coord_socket) -> colour output socket."""
    if key in _materials:
        return _materials[key]
    m = clay("#FFFFFF", rough=rough, sss=sss, sheen=sheen, key=key)
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sock = build_color(nt, tc.outputs["Object"])
    nt.links.new(sock, b.inputs["Base Color"])
    return m


def ramp_node(nt, stops, interp="CONSTANT"):
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation = interp
    els = r.color_ramp.elements
    while len(els) < len(stops):
        els.new(0.5)
    for e, (pos, c) in zip(els, stops):
        e.position = pos
        e.color = col(c)
    return r


def math_node(nt, op, a, b=None, val=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    if hasattr(a, "is_linked") or hasattr(a, "links"):
        nt.links.new(a, n.inputs[0])
    else:
        n.inputs[0].default_value = a
    if b is not None:
        if hasattr(b, "links"):
            nt.links.new(b, n.inputs[1])
        else:
            n.inputs[1].default_value = b
    return n.outputs[0]


def outline_mat(color="ink"):
    key = f"outline_{color}"
    if key in _materials:
        return _materials[key]
    m = flat(color, 1.0, key=key)
    m.use_backface_culling = True
    try:
        m.use_backface_culling_shadow = True
    except Exception:
        pass
    _materials[key] = m
    return m


# ----------------------------------------------------------------------------
# Geometry helpers (all bmesh, no operators -> fast and context free)
# ----------------------------------------------------------------------------
def link(ob, parent=None):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), rot_deg=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    ob.rotation_euler = Euler([math.radians(a) for a in rot_deg])
    return link(ob)


def mesh_obj(name, bm, mat=None, smooth=True, loc=(0, 0, 0), rot=None, parent=None,
             outline=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    if rot is not None:
        if isinstance(rot, Matrix):
            ob.rotation_euler = rot.to_euler()
        else:
            ob.rotation_euler = Euler([math.radians(a) for a in rot])
    if mat is not None:
        me.materials.append(mat)
    ob["outline"] = outline
    return link(ob, parent)


def _rot3(rot):
    if rot is None:
        return Matrix.Identity(3)
    if isinstance(rot, Matrix):
        return rot.to_3x3()
    return Euler([math.radians(a) for a in rot]).to_matrix()


def sphere(name, loc, radius, mat, rot=None, segs=48, rings=28, parent=None, outline=True):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    r = radius if isinstance(radius, (tuple, list)) else (radius,) * 3
    bmesh.ops.scale(bm, vec=r, verts=bm.verts)
    return mesh_obj(name, bm, mat, loc=loc, rot=rot, parent=parent, outline=outline)


def _round_mods(ob, bevel, segs=3, subsurf=1, angle=35):
    if bevel and bevel > 0:
        m = ob.modifiers.new("Bevel", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(angle)
        m.profile = 0.5
    if subsurf:
        s = ob.modifiers.new("Subsurf", "SUBSURF")
        s.levels = subsurf
        s.render_levels = subsurf


def box(name, loc, size, mat, bevel=0.03, rot=None, parent=None, subsurf=1, outline=True):
    """Rounded 'pillowy' box. size = full (x, y, z) dimensions."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, parent=parent, outline=outline)
    _round_mods(ob, min(bevel, min(size) * 0.49), subsurf=subsurf)
    return ob


def cylinder(name, loc, radius, depth, mat, bevel=0.02, rot=None, segs=48, radius2=None,
             parent=None, subsurf=1, outline=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=radius, radius2=radius if radius2 is None else radius2,
                          depth=depth)
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, parent=parent, outline=outline)
    _round_mods(ob, min(bevel, depth * 0.49, radius * 0.9), subsurf=subsurf)
    return ob


def torus(name, loc, R, r, mat, rot=None, parent=None, segs=48, tube_segs=20, outline=True,
          arc=None):
    """Torus in XY plane. arc=(a0, a1) degrees keeps only part of the ring."""
    bm = bmesh.new()
    a0, a1 = (0, 360) if arc is None else arc
    full = arc is None
    n_u = segs if full else max(4, int(segs * (a1 - a0) / 360))
    rows = []
    for i in range(n_u if full else n_u + 1):
        a = math.radians(a0 + (a1 - a0) * i / n_u)
        ring = []
        for j in range(tube_segs):
            b = 2 * math.pi * j / tube_segs
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
        rows.append(ring)
    nrows = len(rows)
    for i in range(nrows if full else nrows - 1):
        A, B = rows[i], rows[(i + 1) % nrows]
        for j in range(tube_segs):
            bm.faces.new((A[j], B[j], B[(j + 1) % tube_segs], A[(j + 1) % tube_segs]))
    if not full:
        for ring, rev in ((rows[0], True), (rows[-1], False)):
            c = sum((v.co for v in ring), Vector()) / len(ring)
            cv = bm.verts.new(c)
            for j in range(tube_segs):
                f = (ring[j], ring[(j + 1) % tube_segs], cv)
                bm.faces.new(f[::-1] if rev else f)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, loc=loc, rot=rot, parent=parent, outline=outline)


def capsule(name, p0, p1, radius, mat, parent=None, r1=None, outline=True):
    """Rounded limb from p0 to p1 (optionally tapering to r1)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    r1 = radius if r1 is None else r1
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
    for v in bm.verts:
        z = v.co.z
        rad = radius if z < 0 else r1
        v.co.x *= rad
        v.co.y *= rad
        v.co.z = z * rad + (L if z >= 0 else 0.0)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    return mesh_obj(name, bm, mat, loc=p0, rot=rot.to_4x4(), parent=parent, outline=outline)


def tube(name, pts, radius, mat, parent=None, outline=False, caps=True):
    """Round tube along a polyline, built as a bevelled curve then meshed."""
    cu = bpy.data.curves.new(name + "_cu", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.use_fill_caps = caps
    sp = cu.splines.new("NURBS" if len(pts) > 3 else "POLY")
    sp.points.add(len(pts) - 1)
    for p, pt in zip(sp.points, pts):
        p.co = (pt[0], pt[1], pt[2], 1.0)
    if sp.type == "NURBS":
        sp.use_endpoint_u = True
        sp.order_u = 3
        sp.resolution_u = 16
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    # round the flat caps a little by adding end spheres
    for p in me.polygons:
        p.use_smooth = True
    me.materials.clear()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob["outline"] = outline
    link(ob, parent)
    if caps:
        for i, pt in enumerate((pts[0], pts[-1])):
            sphere(f"{name}_cap{i}", pt, radius, mat, segs=16, rings=10, parent=parent,
                   outline=outline)
    return ob


def shell_cut(name, loc, radius, mat, plane_co, plane_no, thickness=0.0, parent=None,
              rot=None, segs=48, rings=32, outline=True, keep_positive=False):
    """Sphere (or ellipsoid) with everything on one side of a plane removed.
    Used for hair caps, bowls, apron bibs, cut tomatoes."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    r = radius if isinstance(radius, (tuple, list)) else (radius,) * 3
    bmesh.ops.scale(bm, vec=r, verts=bm.verts)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=plane_co, plane_no=plane_no,
                           clear_outer=not keep_positive, clear_inner=keep_positive)
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, parent=parent, outline=outline)
    if thickness:
        s = ob.modifiers.new("Thick", "SOLIDIFY")
        s.thickness = thickness
        s.offset = -1
        s.use_rim = True
        s.use_even_offset = True
        sub = ob.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 1
    return ob


def on_sphere(center, radius, yaw_deg, pitch_deg, extra=0.0):
    """Point + outward normal on a sphere facing -Y (the camera).
    yaw: + to the character's left (screen right), pitch: + up."""
    y, p = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    return Vector(center) + d * (radius + extra), d


def face_rot(d, roll_deg=0.0):
    """Rotation that points local -Y along direction d (for decals on a head)."""
    q = Vector((0, -1, 0)).rotation_difference(d)
    m = q.to_matrix().to_4x4()
    if roll_deg:
        m = m @ Matrix.Rotation(math.radians(roll_deg), 4, "Y")
    return m


# ----------------------------------------------------------------------------
# Outlines
# ----------------------------------------------------------------------------
def add_outlines(px=OUTLINE_PX, color="ink", objs=None):
    """Inverted-hull outline on every mesh flagged outline=True.
    Thickness is in world units derived from PPM so every sprite gets the same
    on-screen line weight."""
    mat = outline_mat(color)
    t = px / PPM
    for ob in (objs or bpy.context.scene.objects):
        if ob.type != "MESH" or not ob.get("outline", True):
            continue
        if ob.hide_render:
            continue
        sx = max(abs(s) for s in ob.matrix_world.to_scale())
        ob.data.materials.append(mat)
        m = ob.modifiers.new("Outline", "SOLIDIFY")
        m.thickness = t / sx
        m.offset = 1.0
        m.use_flip_normals = True
        m.use_rim = False
        m.use_even_offset = False
        m.material_offset = len(ob.data.materials) - 1
        m.material_offset_rim = len(ob.data.materials) - 1


# ----------------------------------------------------------------------------
# Framing, rendering, exporting
# ----------------------------------------------------------------------------
def renderable_meshes():
    return [o for o in bpy.context.scene.objects
            if o.type in ("MESH", "CURVE") and not o.hide_render]


def cam_bbox(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    Rt = cam_rot().transposed()
    xs, ys = [], []
    for ob in (objs or renderable_meshes()):
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ob.matrix_world
        for v in me.vertices:
            q = Rt @ (mw @ v.co)
            xs.append(q.x)
            ys.append(q.y)
        ev.to_mesh_clear()
    return min(xs), max(xs), min(ys), max(ys)


def frame(cx, cy, w_px, h_px):
    sc = bpy.context.scene
    cam = sc.camera
    sc.render.resolution_x = w_px
    sc.render.resolution_y = h_px
    cam.data.ortho_scale = max(w_px, h_px) / PPM
    cam.location = cam_rot() @ Vector((cx, cy, 60.0))


def auto_frame(objs=None, pad_px=PAD_PX):
    x0, x1, y0, y1 = cam_bbox(objs)
    pad = (pad_px + OUTLINE_PX) / PPM
    x0, x1, y0, y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
    w = int(math.ceil((x1 - x0) * PPM))
    h = int(math.ceil((y1 - y0) * PPM))
    # recentre on the integer-sized frame
    cx = x0 + w / PPM / 2
    cy = y0 + h / PPM / 2
    frame(cx, cy, w, h)
    return cx, cy, w, h


def render_to(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t


def origin_px(cx, cy, w, h, world=(0, 0, 0)):
    x, y = world_to_cam2d(world)
    return [round(w / 2 + (x - cx) * PPM, 2), round(h / 2 - (y - cy) * PPM, 2)]


def log_timing(name, seconds, extra=None):
    p = os.path.join(SPRITES, "_render_log.json")
    data = json.load(open(p)) if os.path.exists(p) else {}
    data[name] = {"seconds": round(seconds, 2), **(extra or {})}
    json.dump(data, open(p, "w"), indent=2, sort_keys=True)


def write_meta(name, meta):
    json.dump(meta, open(os.path.join(SPRITES, name + ".json"), "w"), indent=2)


def export_sprite(name, outline=True):
    t0 = time.time()
    if outline:
        add_outlines()
    cx, cy, w, h = auto_frame()
    path = os.path.join(SPRITES, name + ".png")
    rt = render_to(path)
    meta = {"file": name + ".png", "w": w, "h": h, "ppm": PPM,
            "anchor_px": origin_px(cx, cy, w, h), "cam_center": [cx, cy]}
    write_meta(name, meta)
    log_timing(name, time.time() - t0, {"render_only": round(rt, 2), "px": [w, h]})
    print(f"[toylib] {name}: {w}x{h} in {time.time() - t0:.1f}s")
    return meta


# ----------------------------------------------------------------------------
# Image helpers (numpy, via bpy.data.images; no PIL needed)
# ----------------------------------------------------------------------------
def load_rgba(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1].copy()   # top-down


def save_rgba(arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new("tmp_save", w, h, alpha=True)
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1], dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def alpha_bbox(arr, thresh=0.004):
    ys, xs = np.where(arr[..., 3] > thresh)
    if len(xs) == 0:
        return 0, 0, 1, 1
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def over(dst, src, x, y, opacity=1.0):
    """Straight-alpha 'over' of src onto dst at integer top-left (x, y)."""
    H, W = dst.shape[:2]
    h, w = src.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x]
    d = dst[y0:y1, x0:x1]
    sa = s[..., 3:4] * opacity
    da = d[..., 3:4]
    oa = sa + da * (1 - sa)
    rgb = (s[..., :3] * sa + d[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    d[..., :3] = rgb
    d[..., 3:4] = oa


def lathe(name, profile, mat, loc=(0, 0, 0), rot=None, segs=64, radial_fn=None, subsurf=1,
          parent=None, outline=True):
    """Surface of revolution around Z from a (radius, z) profile.
    radial_fn(angle, z) -> multiplier lets you flute/lobe the shape."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            k = radial_fn(a, z) if radial_fn else 1.0
            ring.append(bm.verts.new((r * k * math.cos(a), r * k * math.sin(a), z)))
        rings.append(ring)
    for A, B in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            if len(A) == 1 and len(B) == 1:
                continue
            if len(A) == 1:
                bm.faces.new((A[0], B[j], B[i]))
            elif len(B) == 1:
                bm.faces.new((A[i], A[j], B[0]))
            else:
                bm.faces.new((A[i], A[j], B[j], B[i]))
    bm.normal_update()
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, parent=parent, outline=outline)
    if subsurf:
        s = ob.modifiers.new("Subsurf", "SUBSURF")
        s.levels = subsurf
        s.render_levels = subsurf
    return ob
