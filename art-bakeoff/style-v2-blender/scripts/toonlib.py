"""toonlib: shared helpers for the FLAT / TOON Blender pipeline (style v2).

Adapted from ../../blender/scripts/toylib.py (same bmesh primitives and sprite
contract), but the look is changed completely:

  * Flat colour. Every material is an unlit Emission shader. A single sun is read
    through Shader-to-RGB and thresholded, so each surface gets its base colour
    plus at most ONE hard-edged shade band (the far side of round things).
    The view transform is "Standard", so a palette hex comes out as that hex.
  * Ink lines from Freestyle: silhouettes, contours, borders, creases (sharp box
    edges) and edge marks, all in one uniform warm-dark ink at LINE_PX pixels.
  * A front-on orthographic camera (no pitch). Rooms get their "dollhouse" floor
    from a cabinet-projection SHEAR (z += SHEAR_K * y) that is baked into the
    geometry, so fronts stay undistorted, tops and floors show, and characters
    (rendered unsheared) stay perfectly frontal like the reference.

Every asset script does:
    import toonlib as T
    T.reset()
    ... build geometry ...
    T.export_sprite("name", shear=True)

Screen mapping for ALL sprites (the engine contract):
    screen_x = (x - cx) * PPM + w/2
    screen_y = h/2 - ((z + SHEAR_K * y) - cy) * PPM
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
PPM = 2048 / 6.4          # pixels per metre (@2x). The kitchen frame is 6.4 m wide.
SHEAR_K = 0.40            # cabinet projection: 1 m of depth shows as 0.4 m of height
LINE_PX = 3.0             # Freestyle ink width in output pixels (all sprites)
CREASE_DEG = 125          # edges sharper than this get an ink line
SAMPLES = 16              # EEVEE AA samples (flat shading needs few)
PAD_PX = 6
SHADE_CUT = 0.18          # N.L below this -> shade band (0 = never, 1 = always)
LIGHT_ROT = (58, 0, -28)  # sun: from upper-left-front

# ----------------------------------------------------------------------------
# Palette (muted, earthy, cozy). Scripts only use names.
# ----------------------------------------------------------------------------
PALETTE = {
    "ink":        "#3A2A26",   # the one line colour: warm near-black brown
    "shade_tint": "#DCCFD6",   # multiplied into a colour for its shade band
    "white":      "#FBF6EE",
    "cream":      "#F3E7D3",
    "oat":        "#E6D6BF",
    "warm_grey":  "#A89C94",
    "grey_dark":  "#6E6661",
    "charcoal":   "#4B4B4F",   # dark matte fridge
    "brick":      "#E2AE9A",
    "brick_b":    "#D69580",
    "brick_c":    "#E8BBA8",
    "mortar":     "#F1E0D4",
    "wood":       "#CC9E82",   # Toca-ish pinky wood
    "wood_light": "#DDB89E",
    "wood_dark":  "#A9785F",
    "floor":      "#DDB4A0",
    "floor_line": "#C0917C",
    "terracotta": "#C8785A",
    "terra_dark": "#A95F45",
    "rust":       "#B8643F",
    "sage":       "#A9BA98",
    "sage_dark":  "#86987A",
    "olive":      "#7E9163",
    "leaf":       "#6E9A62",
    "leaf_dark":  "#4F7A4C",
    "leaf_light": "#93B77E",
    "rose":       "#DDA7A3",
    "blush":      "#EDBFB8",
    "pink":       "#F0B7C0",
    "peach":      "#F2C29E",
    "mustard":    "#DDB05A",
    "butter":     "#F1D98E",
    "teal":       "#6FA3A0",
    "teal_dark":  "#4F7F80",
    "sky":        "#BFDCE6",
    "sky_light":  "#DCEDF1",
    "denim":      "#6F87A8",
    "plum":       "#8E6F8E",
    "lilac":      "#B8A6CB",
    "tomato":     "#D9624E",
    "steel":      "#BDC0C2",
    "basket":     "#D2A46A",
    "basket_dark": "#B38550",
    "bulb":       "#FFF3C9",
    # characters
    "skin_tan":   "#D9A27F",
    "skin_light": "#F1C7A6",
    "skin_deep":  "#8C5B45",
    "hair_brown": "#5B3A2E",
    "hair_auburn": "#8A4B34",
    "hair_black": "#2E2422",
    "mouth":      "#8C3B3E",
    "tongue":     "#E58C8C",
}

_pal_override = os.environ.get("TOY_PALETTE")
if _pal_override and os.path.exists(_pal_override):
    PALETTE.update(json.load(open(_pal_override)))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(name_or_hex):
    h = PALETTE.get(name_or_hex, name_or_hex).lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def col(name_or_hex, a=1.0):
    r, g, b = hex_rgb(name_or_hex)
    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), a)


# ----------------------------------------------------------------------------
# Scene / render setup
# ----------------------------------------------------------------------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = SAMPLES
    sc.render.film_transparent = True
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 90
    sc.view_settings.view_transform = "Standard"
    try:
        sc.view_settings.look = "None"
    except Exception:
        pass
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    w = bpy.data.worlds.new("World")
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0, 0, 0, 1)
    bg.inputs["Strength"].default_value = 0.0
    ld = bpy.data.lights.new("Sun", "SUN")
    ld.energy = math.pi          # so a lit, facing surface reads exactly N.L
    ld.angle = 0.0
    ld.use_shadow = False        # no cast shadows: flat, Toca-like
    try:
        ld.diffuse_factor = 1.0
        ld.specular_factor = 0.0
    except Exception:
        pass
    sun = bpy.data.objects.new("Sun", ld)
    sun.rotation_euler = Euler([math.radians(a) for a in LIGHT_ROT])
    sc.collection.objects.link(sun)
    setup_camera()
    setup_freestyle()
    _materials.clear()


def setup_camera():
    cd = bpy.data.cameras.new("Cam")
    cd.type = "ORTHO"
    cd.clip_start = 0.1
    cd.clip_end = 400
    ob = bpy.data.objects.new("Cam", cd)
    ob.rotation_euler = Euler((math.radians(90), 0, 0))   # looks along +Y
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def noline_collection():
    c = bpy.data.collections.get("noline")
    if c is None:
        c = bpy.data.collections.new("noline")
        bpy.context.scene.collection.children.link(c)
    return c


def setup_freestyle(px=None):
    sc = bpy.context.scene
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.0
    vl = sc.view_layers[0]
    fs = vl.freestyle_settings
    fs.mode = "EDITOR"
    fs.crease_angle = math.radians(CREASE_DEG)
    fs.use_culling = False
    fs.use_smoothness = True
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("ink")
    ls.select_by_visibility = True
    ls.visibility = "VISIBLE"
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_contour = True
    ls.select_external_contour = True
    ls.select_edge_mark = True
    ls.select_material_boundary = False
    ls.select_by_collection = True
    ls.collection = noline_collection()
    ls.collection_negation = "EXCLUSIVE"
    st = ls.linestyle
    if st is None:
        st = bpy.data.linestyles.new("ink")
        ls.linestyle = st
    st.color = col("ink")[:3]
    st.thickness = px or LINE_PX
    st.thickness_position = "CENTER"
    st.caps = "ROUND"
    st.use_chaining = True
    st.chaining = "PLAIN"
    st.use_same_object = True
    return ls


# ----------------------------------------------------------------------------
# Materials: unlit flat colour + one hard shade band
# ----------------------------------------------------------------------------
_materials = {}


def _new_mat(key):
    m = bpy.data.materials.new(key)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return m, nt


def _shade_factor(nt, cut):
    """0 in the shade band, 1 elsewhere (hard edge)."""
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    dif.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    nt.links.new(dif.outputs[0], s2r.inputs[0])
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(s2r.outputs["Color"], bw.inputs[0])
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    nt.links.new(bw.outputs[0], gt.inputs[0])
    gt.inputs[1].default_value = cut
    return gt.outputs[0]


def _finish(nt, color_sock, cut, shade=True):
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    if shade and cut > 0:
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(color_sock, mul.inputs["A"])
        mul.inputs["B"].default_value = col("shade_tint")
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        nt.links.new(_shade_factor(nt, cut), mix.inputs["Factor"])
        nt.links.new(mul.outputs["Result"], mix.inputs["A"])
        nt.links.new(color_sock, mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], em.inputs["Color"])
    else:
        nt.links.new(color_sock, em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])


def toon(color, cut=None, shade=True, key=None):
    """Flat colour with one hard shade band."""
    cut = SHADE_CUT if cut is None else cut
    key = key or f"toon_{color}_{cut}_{shade}"
    if key in _materials:
        return _materials[key]
    m, nt = _new_mat(key)
    rgb = nt.nodes.new("ShaderNodeRGB")
    rgb.outputs[0].default_value = col(color)
    _finish(nt, rgb.outputs[0], cut, shade)
    m.diffuse_color = col(color)
    _materials[key] = m
    return m


def flat(color, key=None):
    """Pure unlit colour, no shade band (face decals, sky, lamp glow)."""
    return toon(color, shade=False, key=key or f"flat_{color}")


def pattern(key, build, cut=None, shade=True):
    """Toon material whose colour comes from build(nt, coord) -> colour socket.
    coord is Object-space texture coordinates."""
    cut = SHADE_CUT if cut is None else cut
    if key in _materials:
        return _materials[key]
    m, nt = _new_mat(key)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sock = build(nt, tc.outputs["Object"])
    _finish(nt, sock, cut, shade)
    _materials[key] = m
    return m


def _mix_col(nt, fac, a, b):
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(fac, mix.inputs["Factor"])
    mix.inputs["A"].default_value = col(a)
    mix.inputs["B"].default_value = col(b)
    return mix.outputs["Result"]


def _axis(nt, coord, axis):
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord, sep.inputs[0])
    return sep.outputs["XYZ".index(axis.upper())]


def math_(nt, op, a, b=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if hasattr(v, "links") or hasattr(v, "is_linked"):
            nt.links.new(v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n.outputs[0]


def _xz(nt, co):
    """(x, y, z) -> (x, z, 0) so 2D textures lie in the wall (XZ) plane."""
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(co, sep.inputs[0])
    cmb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(sep.outputs[0], cmb.inputs[0])
    nt.links.new(sep.outputs[2], cmb.inputs[1])
    return cmb.outputs[0]


def stripes(c1, c2, period, axis="z", duty=0.5, offset=0.0):
    """Hard stripes along an object axis (period in metres)."""
    def b(nt, co):
        v = math_(nt, "ADD", _axis(nt, co, axis), offset)
        v = math_(nt, "DIVIDE", v, period)
        fr = math_(nt, "FRACT", v)
        f = math_(nt, "GREATER_THAN", fr, duty)
        return _mix_col(nt, f, c1, c2)
    return pattern(f"stripes_{c1}_{c2}_{period}_{axis}_{duty}_{offset}", b)


def dots(c_bg, c_dot, spacing, radius, axes="xz"):
    """Polka dots on a staggered grid in the plane of two object axes."""
    def b(nt, co):
        u = _axis(nt, co, axes[0])
        v = _axis(nt, co, axes[1])
        row = math_(nt, "FLOOR", math_(nt, "DIVIDE", v, spacing))
        u2 = math_(nt, "ADD", u, math_(nt, "MULTIPLY", math_(nt, "MODULO", row, 2.0),
                                          spacing * 0.5))
        fu = math_(nt, "SUBTRACT", math_(nt, "FRACT", math_(nt, "DIVIDE", u2, spacing)), 0.5)
        fv = math_(nt, "SUBTRACT", math_(nt, "FRACT", math_(nt, "DIVIDE", v, spacing)), 0.5)
        d = math_(nt, "ADD", math_(nt, "MULTIPLY", fu, fu), math_(nt, "MULTIPLY", fv, fv))
        f = math_(nt, "LESS_THAN", d, (radius / spacing) ** 2)
        return _mix_col(nt, f, c_bg, c_dot)
    return pattern(f"dots_{c_bg}_{c_dot}_{spacing}_{radius}_{axes}", b)


def checks(c1, c2, size, axes="xz"):
    def b(nt, co):
        u = math_(nt, "FLOOR", math_(nt, "DIVIDE", _axis(nt, co, axes[0]), size))
        v = math_(nt, "FLOOR", math_(nt, "DIVIDE", _axis(nt, co, axes[1]), size))
        f = math_(nt, "MODULO", math_(nt, "ADD", math_(nt, "ADD", u, v), 1000.0), 2.0)
        return _mix_col(nt, f, c1, c2)
    return pattern(f"checks_{c1}_{c2}_{size}_{axes}", b)


def bricks(scale=1.0):
    """Exposed brick: flat bricks in 3 close tones, soft warm mortar, no ink."""
    def b(nt, co):
        br = nt.nodes.new("ShaderNodeTexBrick")
        nt.links.new(_xz(nt, co), br.inputs["Vector"])
        br.offset = 0.5
        br.squash = 1.0
        br.inputs["Color1"].default_value = col("brick")
        br.inputs["Color2"].default_value = col("brick_c")
        br.inputs["Mortar"].default_value = col("mortar")
        br.inputs["Scale"].default_value = scale
        br.inputs["Mortar Size"].default_value = 0.013
        br.inputs["Mortar Smooth"].default_value = 0.0
        br.inputs["Bias"].default_value = 0.0
        br.inputs["Brick Width"].default_value = 0.30
        br.inputs["Row Height"].default_value = 0.105
        # swap axes so bricks lie in the XZ wall plane
        return br.outputs["Color"]
    return pattern(f"bricks_{scale}", b, shade=False)


def planks(c_wood, c_line, width=0.24, length=1.3):
    """Floor boards: long planks with thin darker seams (no ink)."""
    def b(nt, co):
        br = nt.nodes.new("ShaderNodeTexBrick")
        nt.links.new(co, br.inputs["Vector"])
        br.offset = 0.37
        br.inputs["Color1"].default_value = col(c_wood)
        br.inputs["Color2"].default_value = col(c_wood)
        br.inputs["Mortar"].default_value = col(c_line)
        br.inputs["Scale"].default_value = 1.0
        br.inputs["Mortar Size"].default_value = 0.012
        br.inputs["Mortar Smooth"].default_value = 0.0
        br.inputs["Brick Width"].default_value = length
        br.inputs["Row Height"].default_value = width
        return br.outputs["Color"]
    return pattern(f"planks_{c_wood}_{c_line}_{width}_{length}", b, shade=False)


# ----------------------------------------------------------------------------
# Geometry helpers (bmesh, context free). Furniture boxes default to SHARP
# edges so Freestyle draws their creases; round things use subsurf.
# ----------------------------------------------------------------------------
def link(ob, parent=None, line=True):
    bpy.context.scene.collection.objects.link(ob)
    if not line:
        noline_collection().objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def set_line(ob, line):
    if not line and ob.name not in noline_collection().objects:
        noline_collection().objects.link(ob)
    return ob


def empty(name, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    return link(ob)


def _rot(rot):
    if rot is None:
        return None
    if isinstance(rot, Matrix):
        return rot.to_euler()
    return Euler([math.radians(a) for a in rot])


def mesh_obj(name, bm, mat=None, smooth=True, loc=(0, 0, 0), rot=None, line=True,
             scale=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    if rot is not None:
        ob.rotation_euler = _rot(rot)
    if scale is not None:
        ob.scale = scale
    if mat is not None:
        me.materials.append(mat)
    return link(ob, line=line)


def _subsurf(ob, levels=1):
    s = ob.modifiers.new("Subsurf", "SUBSURF")
    s.levels = levels
    s.render_levels = levels
    return s


def sphere(name, loc, radius, mat, rot=None, segs=32, rings=18, line=True):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    r = radius if isinstance(radius, (tuple, list)) else (radius,) * 3
    bmesh.ops.scale(bm, vec=r, verts=bm.verts)
    return mesh_obj(name, bm, mat, loc=loc, rot=rot, line=line)


def box(name, loc, size, mat, rot=None, line=True, round_=0.0):
    """Box centred at loc with full size (x, y, z). Sharp by default (crease ink).
    round_>0 gives a soft pillow box (no crease lines, only silhouettes)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, line=line, smooth=round_ > 0)
    if round_ > 0:
        m = ob.modifiers.new("Bevel", "BEVEL")
        m.width = min(round_, min(size) * 0.49)
        m.segments = 3
        _subsurf(ob, 1)
    return ob


def slab(name, x0, x1, y0, y1, z0, z1, mat, **kw):
    """Box from min/max corners (handy for furniture)."""
    return box(name, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
               (x1 - x0, y1 - y0, z1 - z0), mat, **kw)


def cylinder(name, loc, radius, depth, mat, rot=None, segs=40, radius2=None, line=True):
    """Cylinder/cone along Z centred at loc. Cap rims get crease ink."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=radius, radius2=radius if radius2 is None else radius2,
                          depth=depth)
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, line=line, smooth=True)
    # keep caps flat-shaded so the rim stays a crease
    for p in ob.data.polygons:
        if abs(p.normal.z) > 0.99:
            p.use_smooth = False
    return ob


def torus(name, loc, R, r, mat, rot=None, segs=40, tube_segs=14, line=True, arc=None):
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
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, loc=loc, rot=rot, line=line)


def capsule(name, p0, p1, radius, mat, r1=None, line=True, segs=24):
    """Rounded limb from p0 to p1 (optionally tapering to r1)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    r1 = radius if r1 is None else r1
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=14, radius=1.0)
    for v in bm.verts:
        z = v.co.z
        rad = radius if z < 0 else r1
        v.co.x *= rad
        v.co.y *= rad
        v.co.z = z * rad + (L if z >= 0 else 0.0)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
    return mesh_obj(name, bm, mat, loc=p0, rot=rot.to_4x4(), line=line)


def tube(name, pts, radius, mat, line=False, caps=True, res=12):
    """Round tube along a smooth curve through pts (meshed)."""
    cu = bpy.data.curves.new(name + "_cu", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.use_fill_caps = caps
    sp = cu.splines.new("NURBS" if len(pts) > 2 else "POLY")
    sp.points.add(len(pts) - 1)
    for p, pt in zip(sp.points, pts):
        p.co = (pt[0], pt[1], pt[2], 1.0)
    if sp.type == "NURBS":
        sp.use_endpoint_u = True
        sp.order_u = min(3, len(pts))
        sp.resolution_u = res
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.clear()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    return link(ob, line=line)


def shell_cut(name, loc, radius, mat, plane_co, plane_no, thickness=0.0, rot=None,
              segs=40, rings=24, line=True, keep_positive=False):
    """Ellipsoid with everything on one side of a plane removed (hair, bowls...)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    r = radius if isinstance(radius, (tuple, list)) else (radius,) * 3
    bmesh.ops.scale(bm, vec=r, verts=bm.verts)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=plane_co, plane_no=plane_no,
                           clear_outer=not keep_positive, clear_inner=keep_positive)
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, line=line)
    if thickness:
        s = ob.modifiers.new("Thick", "SOLIDIFY")
        s.thickness = thickness
        s.offset = -1
        s.use_rim = True
        s.use_even_offset = True
    return ob


def lathe(name, profile, mat, loc=(0, 0, 0), rot=None, segs=40, radial_fn=None, subsurf=0,
          line=True, scale=None, smooth=True):
    """Surface of revolution around Z from (radius, z) pairs."""
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
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, mat, loc=loc, rot=rot, line=line, scale=scale, smooth=smooth)
    if subsurf:
        _subsurf(ob, subsurf)
    return ob


def prism(name, pts2d, depth, mat, loc=(0, 0, 0), rot=None, line=True, axis="y"):
    """Extrude a 2D polygon (x, z) by depth along Y (flat decals: stars, hearts, signs)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, -depth / 2, z)) for x, z in pts2d]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in ext["geom"]:
        if isinstance(v, bmesh.types.BMVert):
            v.co.y += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, loc=loc, rot=rot, line=line, smooth=False)


def star_pts(r_out, r_in, n=5, rot_deg=90):
    pts = []
    for i in range(n * 2):
        a = math.radians(rot_deg) + math.pi * i / n
        r = r_out if i % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def heart_pts(s, n=36):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * s / 17, z * s / 17))
    return pts


def mark_all_edges(ob):
    """Freestyle edge-mark every edge (for hard-edged decals, doors, drawers)."""
    for e in ob.data.edges:
        e.use_freestyle_mark = True


# ----------------------------------------------------------------------------
# Shear bake (cabinet projection) and framing
# ----------------------------------------------------------------------------
def shear_matrix(k=SHEAR_K):
    m = Matrix.Identity(4)
    m[2][1] = k          # z' = z + k*y
    return m


def bake_shear(k=SHEAR_K, objs=None):
    """Bake modifiers + world transforms + shear into every renderable mesh."""
    S = shear_matrix(k)
    dg = bpy.context.evaluated_depsgraph_get()
    obs = [o for o in (objs or bpy.context.scene.objects) if o.type == "MESH"]
    baked = []
    for ob in obs:
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        baked.append((ob, me, ob.matrix_world.copy()))
    for ob, me, mw in baked:
        me.transform(S @ mw)
        ob.parent = None
        ob.modifiers.clear()
        ob.data = me
        ob.matrix_world = Matrix.Identity(4)


def cam_bbox(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    xs, zs = [], []
    for ob in (objs or renderable()):
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ob.matrix_world
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        if len(co):
            M = np.array(mw)
            w = co @ M[:3, :3].T + M[:3, 3]
            xs += [w[:, 0].min(), w[:, 0].max()]
            zs += [w[:, 2].min(), w[:, 2].max()]
        ev.to_mesh_clear()
    return min(xs), max(xs), min(zs), max(zs)


def renderable():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_render]


def frame(cx, cy, w_px, h_px):
    sc = bpy.context.scene
    cam = sc.camera
    sc.render.resolution_x = w_px
    sc.render.resolution_y = h_px
    cam.data.ortho_scale = max(w_px, h_px) / PPM
    cam.location = (cx, -100.0, cy)


def auto_frame(objs=None, pad_px=PAD_PX):
    x0, x1, y0, y1 = cam_bbox(objs)
    pad = (pad_px + LINE_PX) / PPM
    x0, x1, y0, y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
    w = int(math.ceil((x1 - x0) * PPM))
    h = int(math.ceil((y1 - y0) * PPM))
    cx = x0 + w / PPM / 2
    cy = y0 + h / PPM / 2
    frame(cx, cy, w, h)
    return cx, cy, w, h


def screen_px(cx, cy, w, h, world=(0, 0, 0), shear=True):
    x, y, z = world
    zz = z + (SHEAR_K * y if shear else 0.0)
    return [round(w / 2 + (x - cx) * PPM, 2), round(h / 2 - (zz - cy) * PPM, 2)]


def render_to(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t


def log_timing(name, seconds, extra=None):
    p = os.path.join(SPRITES, "_render_log.json")
    data = json.load(open(p)) if os.path.exists(p) else {}
    data[name] = {"seconds": round(seconds, 2), **(extra or {})}
    json.dump(data, open(p, "w"), indent=2, sort_keys=True)


def write_meta(name, meta):
    json.dump(meta, open(os.path.join(SPRITES, name + ".json"), "w"), indent=2)


def export_sprite(name, shear=True, anchor=(0, 0, 0), extra_meta=None):
    """Bake shear (props/backgrounds), frame tightly, render, write sidecar."""
    t0 = time.time()
    if shear:
        bake_shear()
    cx, cy, w, h = auto_frame()
    path = os.path.join(SPRITES, name + ".png")
    rt = render_to(path)
    meta = {"file": name + ".png", "w": w, "h": h, "ppm": PPM, "shear_k": SHEAR_K if shear else 0,
            "anchor_px": screen_px(cx, cy, w, h, anchor, shear), "cam_center": [cx, cy]}
    meta.update(extra_meta or {})
    write_meta(name, meta)
    log_timing(name, time.time() - t0, {"render_only": round(rt, 2), "px": [w, h]})
    print(f"[toonlib] {name}: {w}x{h} in {time.time() - t0:.1f}s")
    return meta


# ----------------------------------------------------------------------------
# Image helpers (numpy via bpy.data.images; PIL is not installed)
# ----------------------------------------------------------------------------
def load_rgba(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1].copy()


def save_rgba(arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new("tmp_save", w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.ascontiguousarray(np.clip(arr[::-1], 0, 1),
                                                dtype=np.float32).ravel())
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


def srgb(name):
    return np.array(hex_rgb(name), dtype=np.float32)
