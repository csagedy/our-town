"""charlib: chunky toy kid builder + swappable face layers.

A character = body (everything except eyes/brows/mouth) + face parts.
export_character() renders:
  <name>.png                    body with a blank face (blush + nose kept)
  <name>__eyes_<variant>.png    eye layer, cropped, occluded by hair/body
  <name>__mouth_<variant>.png   mouth layer, cropped
  <name>__<emotion>.png         pre-composited full expressions (for previews)
  <name>.json                   anchor + per-layer offsets relative to body
"""
import os, math, json, time
import bpy, bmesh
from mathutils import Vector, Matrix
import toylib as T


# ----------------------------------------------------------------------------
# Face parts. Each builder returns a list of objects; all are built relative to
# the head (centre c, radius r) facing -Y, and parented to the character root.
# ----------------------------------------------------------------------------
EYE_YAW = 24
EYE_PITCH = 4


def _eye_open(c, r, root, scale=1.0, look=(0, 0), tag="open"):
    objs = []
    ink = T.gloss("eye", 0.15)
    hi = T.flat("white", 1.0)
    for side in (-1, 1):
        p, d = T.on_sphere(c, r, side * EYE_YAW + look[0], EYE_PITCH + look[1], extra=-0.012)
        e = T.sphere(f"eye_{tag}_{side}", p, (0.052 * r / 0.26 * scale, 0.03,
                     0.068 * r / 0.26 * scale), ink, rot=T.face_rot(d), parent=root,
                     outline=False)
        objs.append(e)
        # two catch-lights: big upper-left, small lower-right
        for k, (dy, dp, rad) in enumerate(((-5.5, 5.5, 0.021), (4.5, -5.0, 0.010))):
            hp, hd = T.on_sphere(c, r, side * EYE_YAW + look[0] + dy * scale,
                                 EYE_PITCH + look[1] + dp * scale, extra=0.012)
            objs.append(T.sphere(f"eyehi_{tag}_{side}_{k}", hp, rad * r / 0.26 * scale, hi,
                                 segs=20, rings=12, parent=root, outline=False))
    return objs


def _arc_on_head(name, c, r, yaw0, pitch0, width, bend, thick, mat, root, n=9, roll=0.0,
                 extra=0.004):
    """Curved stroke painted on the head. bend>0 = ends up (smile / 'u'),
    bend<0 = ends down (happy closed eye '^' / frown)."""
    pts = []
    for i in range(n):
        x = -1 + 2 * i / (n - 1)
        yaw = yaw0 + x * width
        pitch = pitch0 + bend * (x * x) + roll * x
        p, _ = T.on_sphere(c, r, yaw, pitch, extra=extra)
        pts.append(tuple(p))
    return T.tube(name, pts, thick, mat, parent=root)


def _eye_happy(c, r, root):
    ink = T.gloss("eye", 0.2)
    return [_arc_on_head(f"eyehappy{s}", c, r, s * EYE_YAW, EYE_PITCH + 3, 8, -6, 0.011, ink,
                         root) for s in (-1, 1)]


def _eye_closed(c, r, root):
    ink = T.gloss("eye", 0.2)
    return [_arc_on_head(f"eyeclosed{s}", c, r, s * EYE_YAW, EYE_PITCH - 2, 8, 4, 0.010,
                         ink, root) for s in (-1, 1)]


def _brows(c, r, root, tilt, lift=0.0, tag="b"):
    """tilt>0: inner ends up (sad/worried); tilt<0: inner ends down (cross)."""
    ink = T.clay("hair_brown", rough=0.5)
    objs = []
    for s in (-1, 1):
        objs.append(_arc_on_head(f"brow_{tag}{s}", c, r, s * (EYE_YAW + 1), EYE_PITCH + 17 + lift,
                                 7, -1.5, 0.008, ink, root, n=5, roll=-s * tilt))
    return objs


def _mouth_smile(c, r, root, width=10, bend=5, tag="smile"):
    return [_arc_on_head(f"mouth_{tag}", c, r, 0, -20, width, bend, 0.009,
                         T.gloss("mouth", 0.3), root)]


def _mouth_open(c, r, root, w=0.07, h=0.06, tongue=True, tag="open", pitch=-22):
    """'D' shaped open mouth (flat top, round bottom) with a tongue."""
    objs = []
    p, d = T.on_sphere(c, r, 0, pitch, extra=-0.022)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    bmesh.ops.scale(bm, vec=(w, 0.03, h), verts=bm.verts)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=(0, 0, 0), plane_no=(0, 0, 1),
                           clear_outer=True)
    m = T.mesh_obj(f"mouth_{tag}", bm, T.gloss("mouth", 0.35), loc=p,
                   rot=T.face_rot(d) @ Matrix.Translation((0, 0, h * 0.35)), parent=root,
                   outline=False)
    objs.append(m)
    if tongue:
        tp, td = T.on_sphere(c, r, 0, pitch - 5.5, extra=-0.005)
        objs.append(T.sphere(f"tongue_{tag}", tp, (w * 0.55, 0.02, h * 0.32),
                             T.gloss("tongue", 0.35), rot=T.face_rot(td), parent=root,
                             outline=False))
    return objs


def _mouth_oh(c, r, root):
    p, d = T.on_sphere(c, r, 0, -21, extra=-0.012)
    return [T.sphere("mouth_oh", p, (0.028, 0.025, 0.036), T.gloss("mouth", 0.35),
                     rot=T.face_rot(d), parent=root, outline=False)]


def _mouth_yum(c, r, root):
    objs = _mouth_smile(c, r, root, width=9, bend=5, tag="yum")
    tp, td = T.on_sphere(c, r, 4, -26.5, extra=-0.004)
    objs.append(T.sphere("tongue_yum", tp, (0.024, 0.02, 0.022), T.gloss("tongue", 0.35),
                         rot=T.face_rot(td), parent=root, outline=False))
    return objs


def build_face_parts(c, r, root):
    """Returns ({'eyes': {variant: [objs]}, 'mouth': {variant: [objs]}})."""
    eyes = {
        "open": _eye_open(c, r, root),
        "wide": _eye_open(c, r, root, scale=1.18, tag="wide") + _brows(c, r, root, 0, 4, "wide"),
        "happy": _eye_happy(c, r, root),
        "closed": _eye_closed(c, r, root),
        "sad": _eye_open(c, r, root, scale=0.92, look=(0, -2), tag="sad") + _brows(c, r, root, 5, 0, "sad"),
    }
    mouth = {
        "smile": _mouth_smile(c, r, root),
        "laugh": _mouth_open(c, r, root, tag="laugh"),
        "oh": _mouth_oh(c, r, root),
        "frown": _mouth_smile(c, r, root, width=7, bend=-4, tag="frown"),
        "yum": _mouth_yum(c, r, root),
    }
    return {"eyes": eyes, "mouth": mouth}


EMOTIONS = {
    "neutral": ("open", "smile"),
    "happy": ("happy", "laugh"),
    "surprised": ("wide", "oh"),
    "sad": ("sad", "frown"),
    "yum": ("closed", "yum"),
}


# ----------------------------------------------------------------------------
# Head furniture shared by both kids
# ----------------------------------------------------------------------------
def head_base(c, r, root, skin):
    T.sphere("head", c, r, skin, parent=root)
    for s in (-1, 1):
        T.sphere(f"ear{s}", Vector(c) + Vector((s * r * 0.97, 0.01, -0.02)),
                 (r * 0.16, r * 0.1, r * 0.2), skin, parent=root)
    p, d = T.on_sphere(c, r, 0, -8, extra=-0.006)
    T.sphere("nose", p, (r * 0.085, r * 0.07, r * 0.065), T.clay("skin_shade", rough=0.5),
             rot=T.face_rot(d), parent=root, outline=False)
    for s in (-1, 1):
        p, d = T.on_sphere(c, r, s * 38, -12, extra=-0.009)
        T.sphere(f"blush{s}", p, (r * 0.17, 0.012, r * 0.1), T.clay("blush", rough=0.8, sss=0.0),
                 rot=T.face_rot(d), parent=root, outline=False)


# ----------------------------------------------------------------------------
# Export
# ----------------------------------------------------------------------------
def _set_visible(objs, vis):
    for o in objs:
        o.hide_render = not vis
        for ch in o.children_recursive:
            ch.hide_render = not vis


def export_character(name, face):
    """Render body + every face layer with identical framing."""
    t_start = time.time()
    face_objs = set()
    for group in face.values():
        for lst in group.values():
            for o in lst:
                face_objs.add(o)
                face_objs.update(o.children_recursive)
    # tube caps are separate spheres parented to root; collect by name prefix
    for o in bpy.context.scene.objects:
        if any(o.name.startswith(f.name + "_cap") for f in list(face_objs)):
            face_objs.add(o)
    body = [o for o in bpy.context.scene.objects if o.type == "MESH" and o not in face_objs]

    def parts(lst):
        out = set(lst)
        for o in lst:
            for q in bpy.context.scene.objects:
                if q.name.startswith(o.name + "_cap"):
                    out.add(q)
        return list(out)

    T.add_outlines(objs=body)
    # frame on body with all face parts visible (they never stick out)
    cx, cy, w, h = T.auto_frame(objs=body)
    anchor = T.origin_px(cx, cy, w, h)
    meta = {"file": name + ".png", "w": w, "h": h, "ppm": T.PPM, "anchor_px": anchor,
            "layers": {}, "emotions": {k: {"eyes": v[0], "mouth": v[1]} for k, v in EMOTIONS.items()}}

    all_face = list(face_objs)
    # 1) body with blank face
    for o in all_face:
        o.hide_render = True
    rt = T.render_to(os.path.join(T.SPRITES, name + ".png"))
    T.log_timing(name, rt, {"px": [w, h], "layer": "body"})

    # 2) face layers: body becomes a holdout so hair/hands correctly occlude
    for o in body:
        o.is_holdout = True
    layer_time = 0.0
    for group, variants in face.items():
        for var, lst in variants.items():
            show = parts(lst)
            for o in all_face:
                o.hide_render = o not in show
            lname = f"{name}__{group}_{var}"
            path = os.path.join(T.SPRITES, lname + ".png")
            layer_time += T.render_to(path)
            arr = T.load_rgba(path)
            x0, y0, x1, y1 = T.alpha_bbox(arr)
            x0, y0 = max(0, x0 - 2), max(0, y0 - 2)
            x1, y1 = min(w, x1 + 2), min(h, y1 + 2)
            T.save_rgba(arr[y0:y1, x0:x1], path)
            meta["layers"][f"{group}_{var}"] = {"file": lname + ".png", "offset": [x0, y0],
                                                "w": x1 - x0, "h": y1 - y0}
    T.log_timing(name + "__face_layers", layer_time,
                 {"count": sum(len(v) for v in face.values())})
    for o in body:
        o.is_holdout = False

    # 3) pre-composited expressions (proves the layers line up)
    base = T.load_rgba(os.path.join(T.SPRITES, name + ".png"))
    for emo, (ev, mv) in EMOTIONS.items():
        img = base.copy()
        for key in (f"eyes_{ev}", f"mouth_{mv}"):
            L = meta["layers"][key]
            T.over(img, T.load_rgba(os.path.join(T.SPRITES, L["file"])), *L["offset"])
        T.save_rgba(img, os.path.join(T.SPRITES, f"{name}__{emo}.png"))
    T.write_meta(name, meta)
    T.log_timing(name + "__total", time.time() - t_start)
    print(f"[charlib] {name} done in {time.time() - t_start:.1f}s")
    return meta
