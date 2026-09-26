"""toonchar: rigged Toca-proportioned characters + 2D face layers.

A character is a set of rigid, rounded parts (head, torso, upper arm, forearm +
mitten hand, thigh, shin + shoe) bone-parented to a tiny armature:

    root - hips - chest - head
                       - upper_arm.L/R - forearm.L/R
                - thigh.L/R - shin.L/R

Rigid parts on a skeleton are exactly how Toca-style puppets move, and they keep
Freestyle's ink clean (no skin-deformation artefacts). Poses are a table of
rotations in ARMATURE axes (x = screen right, y = away from camera, z = up),
each relative to the parent bone, plus a root yaw.

Faces are NOT modelled. The body renders with a blank face (the 3D nose is part
of the body) and each pose's sidecar stores head_px, the head centre in the
sprite. Eye / mouth / brow layers are drawn as crisp 2D shapes (numpy signed
distance fields, same ink colour and weight as Freestyle) and composited at
head_px, so any expression works with any pose. A 3/4 set is drawn for turned
poses (walk).
"""
import os, math, json, time
import bpy
import numpy as np
from mathutils import Vector, Matrix, Euler
import toonlib as T

S = T.SPRITES


# ----------------------------------------------------------------------------
# Rig
# ----------------------------------------------------------------------------
class Rig:
    def __init__(self, name, *, hip_z, hip_x, knee_z, ankle_z, sh_x, sh_z, elbow, wrist,
                 neck_z, head_c, head_r):
        self.name = name
        self.head_c = Vector(head_c)
        self.head_r = head_r
        ad = bpy.data.armatures.new(name + "_arm")
        arm = bpy.data.objects.new(name + "_rig", ad)
        bpy.context.scene.collection.objects.link(arm)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        eb = ad.edit_bones

        def bone(n, h, t, parent=None):
            b = eb.new(n)
            b.head, b.tail = Vector(h), Vector(t)
            b.roll = 0
            if parent:
                b.parent = eb[parent]
                b.use_connect = False
            return b

        bone("root", (0, 0, 0), (0, 0, 0.08))
        bone("hips", (0, 0, hip_z - 0.02), (0, 0, hip_z + 0.12), "root")
        bone("chest", (0, 0, hip_z + 0.12), (0, 0, neck_z), "hips")
        bone("head", (0, 0, neck_z), (0, 0, neck_z + 0.2), "chest")
        for s, sx in (("R", 1), ("L", -1)):
            bone(f"upper_arm.{s}", (sx * sh_x, 0, sh_z), (sx * elbow[0], 0, elbow[1]), "chest")
            bone(f"forearm.{s}", (sx * elbow[0], 0, elbow[1]), (sx * wrist[0], 0, wrist[1]),
                 f"upper_arm.{s}")
            bone(f"thigh.{s}", (sx * hip_x, 0, hip_z), (sx * hip_x, 0, knee_z), "hips")
            bone(f"shin.{s}", (sx * hip_x, 0, knee_z), (sx * hip_x, 0, ankle_z), f"thigh.{s}")
        bpy.ops.object.mode_set(mode="OBJECT")
        self.arm = arm
        self.P = dict(hip_z=hip_z, hip_x=hip_x, knee_z=knee_z, ankle_z=ankle_z, sh_x=sh_x,
                      sh_z=sh_z, elbow=elbow, wrist=wrist, neck_z=neck_z)
        # locator empties (read back after posing)
        self.loc = {}
        self.locator("head_c", head_c, "head")
        for s, sx in (("R", 1), ("L", -1)):
            self.locator(f"hand.{s}", (sx * wrist[0], 0, wrist[1] - 0.02), f"forearm.{s}")
        self.locator("seat", (0, 0.02, hip_z - 0.07), "hips")

    def attach(self, ob, bone):
        """Bone-parent an object, keeping its current world transform."""
        b = self.arm.data.bones[bone]
        pm = self.arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))
        mw = ob.matrix_basis.copy()   # unparented: basis == intended world
        ob.parent = self.arm
        ob.parent_type = "BONE"
        ob.parent_bone = bone
        ob.matrix_parent_inverse = pm.inverted()
        ob.matrix_basis = mw
        return ob

    def locator(self, name, loc, bone):
        e = bpy.data.objects.new(f"{self.name}_{name}", None)
        e.location = loc
        bpy.context.scene.collection.objects.link(e)
        bpy.context.view_layer.update()
        self.attach(e, bone)
        self.loc[name] = e
        return e

    def pose(self, spec):
        """spec: {bone: (rx, ry, rz) degrees in armature axes, relative to parent},
        plus optional 'yaw' (deg, whole body) and 'lift' (m, root z offset)."""
        for pb in self.arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        for bn, rot in spec.items():
            if bn in ("yaw", "lift", "hide"):
                continue
            pb = self.arm.pose.bones[bn]
            B = pb.bone.matrix_local.to_3x3()
            R = Euler([math.radians(a) for a in rot], "XYZ").to_matrix()
            pb.rotation_quaternion = (B.inverted() @ R @ B).to_quaternion()
        hide = spec.get("hide", [])
        for ob in bpy.context.scene.objects:
            if ob.type == "MESH":
                ob.hide_render = any(h in ob.name for h in hide)
        self.arm.rotation_euler = (0, 0, math.radians(spec.get("yaw", 0)))
        self.arm.location = (0, 0, spec.get("lift", 0.0))
        bpy.context.view_layer.update()

    def world(self, name):
        return tuple(self.loc[name].matrix_world.translation)


# Pose library (armature axes; +x screen right). "R" = screen-right arm/leg.
# Arm Y-rotation: negative swings the R arm outward/up; positive the L arm.
# Arm/leg X-rotation: negative brings the limb toward the camera.
POSES = {
    "stand": {"upper_arm.R": (0, -4, 0), "upper_arm.L": (0, 4, 0)},
    "wave": {
        "upper_arm.R": (-15, -84, 0), "forearm.R": (0, -42, 0),
        "upper_arm.L": (0, 6, 0),
    },
    "hold_up": {   # both arms raised in front, holding something up (a cake, a tray)
        "upper_arm.R": (-42, -16, 0), "forearm.R": (-58, 0, 0),
        "upper_arm.L": (-42, 16, 0), "forearm.L": (-58, 0, 0),
    },
    "cheer": {     # "ta-da!": both arms thrown up high
        "upper_arm.R": (-25, -122, 0), "forearm.R": (0, -32, 0),
        "upper_arm.L": (-25, 122, 0), "forearm.L": (0, 32, 0),
    },
    "walk": {
        "yaw": 34,
        "thigh.R": (-28, 0, 0), "shin.R": (12, 0, 0),
        "thigh.L": (26, 0, 0), "shin.L": (30, 0, 0),
        "upper_arm.R": (30, 0, 0), "forearm.R": (-15, 0, 0),
        "upper_arm.L": (-32, 0, 0), "forearm.L": (-30, 0, 0),
        "lift": 0.012,
    },
    "sit": {
        "hide": ["skirt"],
        "thigh.R": (-88, 0, -5), "shin.R": (84, 0, 5),
        "thigh.L": (-88, 0, 5), "shin.L": (84, 0, -5),
        "upper_arm.R": (-24, 6, 0), "forearm.R": (-55, 0, 0),
        "upper_arm.L": (-24, -6, 0), "forearm.L": (-55, 0, 0),
    },
}
POSE_ORDER = ["stand", "wave", "hold_up", "cheer", "walk", "sit"]


# ----------------------------------------------------------------------------
# Common body builders
# ----------------------------------------------------------------------------
def head(rig, skin, ears=True):
    c, (rx, ry, rz) = rig.head_c, rig.head_r
    h = T.sphere(f"{rig.name}_head", c, (rx, ry, rz), T.toon(skin, cut=0.0), segs=40, rings=24)
    T._subsurf(h)
    rig.attach(h, "head")
    # small Toca nose: a little rounded bump, slightly below centre
    n = T.sphere(f"{rig.name}_nose", (c.x, c.y - ry * 0.99, c.z - rz * 0.2),
                 (rx * 0.085, ry * 0.08, rz * 0.075), T.toon(skin, cut=0.0), segs=20, rings=12)
    rig.attach(n, "head")
    if ears:
        for s in (1, -1):
            e = T.sphere(f"{rig.name}_ear{s}", (c.x + s * rx * 0.97, c.y + 0.01, c.z - rz * 0.12),
                         (rx * 0.13, ry * 0.08, rz * 0.17), T.toon(skin, cut=0.0), segs=20, rings=12)
            rig.attach(e, "head")
    neck = T.capsule(f"{rig.name}_neck", (0, 0, rig.P["neck_z"] - 0.06),
                     (0, 0, rig.P["neck_z"] + 0.05), rx * 0.2, T.toon(skin))
    rig.attach(neck, "chest")
    return h


def torso(rig, mat, bottom_r, top_r, z0, z1, depth_scale=0.72, flare=0.0, name="torso"):
    """Rounded trapezoid body. flare widens the bottom into a skirt/dress hem."""
    zm = (z0 + z1) / 2
    prof = [(0.0, z0), (bottom_r * 0.85 + flare, z0), (bottom_r + flare, z0 + 0.03),
            (bottom_r * 0.98 + flare * 0.5, z0 + (z1 - z0) * 0.3),
            ((bottom_r + top_r) / 2, zm), (top_r, z1 - 0.07), (top_r * 0.8, z1 - 0.02),
            (top_r * 0.45, z1), (0.0, z1 + 0.004)]
    ob = T.lathe(f"{rig.name}_{name}", prof, mat, segs=40, subsurf=1,
                 scale=(1, depth_scale, 1))
    rig.attach(ob, "chest")
    return ob


def arm(rig, s, sleeve, skin, r=0.045, sleeve_len=0.55, cuff=None, hand_r=None):
    """Upper arm (sleeve colour), forearm (skin or sleeve), mitten hand."""
    P = rig.P
    sx = 1 if s == "R" else -1
    sh = Vector((sx * P["sh_x"], 0, P["sh_z"]))
    el = Vector((sx * P["elbow"][0], 0, P["elbow"][1]))
    wr = Vector((sx * P["wrist"][0], 0, P["wrist"][1]))
    up = T.capsule(f"{rig.name}_uarm{s}", sh, el, r * 1.12, T.toon(sleeve))
    rig.attach(up, f"upper_arm.{s}")
    fore_col = sleeve if sleeve_len > 1 else skin
    fa = T.capsule(f"{rig.name}_farm{s}", el, wr, r, T.toon(fore_col))
    rig.attach(fa, f"forearm.{s}")
    if cuff:
        cf = T.capsule(f"{rig.name}_cuff{s}", wr + (el - wr) * 0.25, wr + (el - wr) * 0.05,
                       r * 1.12, T.toon(cuff))
        rig.attach(cf, f"forearm.{s}")
    hr = hand_r or r * 1.22
    d = (wr - el).normalized()
    hand = T.sphere(f"{rig.name}_hand{s}", wr + d * hr * 0.55, (hr * 0.95, hr * 0.8, hr),
                    T.toon(skin), segs=24, rings=14)
    rig.attach(hand, f"forearm.{s}")
    return up, fa, hand


def leg(rig, s, thigh_col, shin_col, shoe_col, r=0.05, shoe=(0.075, 0.1, 0.05),
        shin_r=None, sole=None):
    P = rig.P
    sx = 1 if s == "R" else -1
    hip = Vector((sx * P["hip_x"], 0, P["hip_z"]))
    kn = Vector((sx * P["hip_x"], 0, P["knee_z"]))
    an = Vector((sx * P["hip_x"], 0, P["ankle_z"]))
    th = T.capsule(f"{rig.name}_thigh{s}", hip, kn, r, T.toon(thigh_col))
    rig.attach(th, f"thigh.{s}")
    sh = T.capsule(f"{rig.name}_shin{s}", kn, an, shin_r or r * 0.92, T.toon(shin_col))
    rig.attach(sh, f"shin.{s}")
    ft = T.sphere(f"{rig.name}_shoe{s}", (an.x + sx * 0.008, an.y - shoe[1] * 0.25, shoe[2] * 0.95),
                  shoe, T.toon(shoe_col), segs=28, rings=14)
    rig.attach(ft, f"shin.{s}")
    if sole:
        so = T.sphere(f"{rig.name}_sole{s}", (an.x + sx * 0.008, an.y - shoe[1] * 0.25, shoe[2] * 0.45),
                      (shoe[0] * 1.02, shoe[1] * 1.02, shoe[2] * 0.5), T.toon(sole), segs=28,
                      rings=12)
        rig.attach(so, f"shin.{s}")
    return th, sh, ft


# ----------------------------------------------------------------------------
# 2D face layers (signed-distance drawing, anti-aliased)
# ----------------------------------------------------------------------------
INK = T.srgb("ink")


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), np.float32)
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        self.x, self.y = xx + 0.5, yy + 0.5

    def fill(self, d, color):
        """Paint where signed distance d < 0 (1 px AA)."""
        cov = np.clip(0.5 - d, 0, 1)[..., None]
        c = np.array(color, np.float32)
        a = self.a
        oa = cov + a[..., 3:4] * (1 - cov)
        a[..., :3] = (c * cov + a[..., :3] * a[..., 3:4] * (1 - cov)) / np.maximum(oa, 1e-6)
        a[..., 3:4] = oa

    def ellipse(self, cx, cy, rx, ry, color, rot=0.0):
        x, y = self.x - cx, self.y - cy
        if rot:
            c, s = math.cos(rot), math.sin(rot)
            x, y = x * c + y * s, -x * s + y * c
        k = np.sqrt((x / rx) ** 2 + (y / ry) ** 2)
        d = (k - 1) * min(rx, ry)
        self.fill(d, color)

    def polyline_dist(self, pts):
        d = np.full(self.x.shape, 1e9, np.float32)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            vx, vy = x1 - x0, y1 - y0
            L2 = vx * vx + vy * vy + 1e-9
            t = np.clip(((self.x - x0) * vx + (self.y - y0) * vy) / L2, 0, 1)
            dx, dy = self.x - (x0 + t * vx), self.y - (y0 + t * vy)
            d = np.minimum(d, np.sqrt(dx * dx + dy * dy))
        return d

    def stroke(self, pts, width, color):
        self.fill(self.polyline_dist(pts) - width / 2, color)

    def polygon(self, pts, color):
        """Filled polygon (even-odd) with AA edges."""
        inside = np.zeros(self.x.shape, bool)
        n = len(pts)
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            cond = ((y0 > self.y) != (y1 > self.y))
            xi = x0 + (self.y - y0) * (x1 - x0) / ((y1 - y0) + 1e-9)
            inside ^= cond & (self.x < xi)
        d = self.polyline_dist(list(pts) + [pts[0]])
        self.fill(np.where(inside, -d, d), color)


def _arc(cx, cy, w, bend, n=14, tilt=0.0):
    """Parabolic arc; bend>0 = smile (ends up, dips down in screen space)."""
    pts = []
    for i in range(n):
        u = -1 + 2 * i / (n - 1)
        pts.append((cx + u * w / 2, cy + bend * (1 - u * u) + tilt * u))
    return pts


def face_layers(name, rig, style, yaw=0.0, suffix=""):
    """Draw eye / mouth / brow variants for a character; returns metadata.
    style: dict(eye=(w, h) m, eye_dx, eye_z, mouth_z, lash, mouth_w) in metres
    relative to head centre. yaw (deg) slides features around the head (3/4)."""
    ppm = T.PPM
    rx = rig.head_r[0]
    W = H = int(rx * 2 * ppm) + 8
    c0 = W / 2

    def px(mx, mz, depth_r=None):
        # position on the head, rotated by yaw around the vertical axis
        R = depth_r or rx
        a = math.asin(max(-0.99, min(0.99, mx / R))) + math.radians(yaw)
        return c0 + R * math.sin(a) * ppm, c0 - mz * ppm, math.cos(a)

    ew, eh = style["eye"]
    lw = T.LINE_PX + 0.6
    layers = {}

    def save(key, cv):
        fn = f"{name}__{key}{suffix}.png"
        T.save_rgba(cv.a, os.path.join(S, fn))
        layers[key] = {"file": fn, "center_px": [c0, c0]}

    for variant in ("open", "happy", "wide", "sad", "closed"):
        cv = Canvas(W, H)
        for s in (-1, 1):
            x, y, k = px(s * style["eye_dx"], style["eye_z"])
            if variant in ("open", "sad", "wide"):
                sc = 1.22 if variant == "wide" else 1.0
                cv.ellipse(x, y, ew / 2 * ppm * k * sc, eh / 2 * ppm * sc, INK)
                if variant == "wide":
                    cv.ellipse(x - ew * 0.15 * ppm * k, y - eh * 0.2 * ppm, ew * 0.14 * ppm,
                               ew * 0.14 * ppm, T.srgb("white"))
                if style.get("lash") and variant != "wide":
                    # one little flick on the outer top corner
                    ox = x + s * ew * 0.42 * ppm * k
                    oy = y - eh * 0.32 * ppm
                    cv.stroke([(ox, oy), (ox + s * ew * 0.32 * ppm * k, oy - eh * 0.2 * ppm)],
                              lw * 0.9, INK)
                if variant == "sad":
                    bx, by = x, y - eh * 1.05 * ppm
                    cv.stroke([(bx - s * ew * 0.6 * ppm * k, by - eh * 0.3 * ppm),
                               (bx + s * ew * 0.55 * ppm * k, by + eh * 0.05 * ppm)], lw, INK)
            elif variant == "happy":
                cv.stroke(_arc(x, y + eh * 0.12 * ppm, ew * 1.3 * ppm * k, -eh * 0.38 * ppm),
                          lw + 0.6, INK)
            elif variant == "closed":
                cv.stroke(_arc(x, y - eh * 0.05 * ppm, ew * 1.25 * ppm * k, eh * 0.28 * ppm),
                          lw + 0.4, INK)
        save(f"eyes_{variant}", cv)

    mw = style["mouth_w"]
    for variant in ("smile", "laugh", "oh", "frown", "flat"):
        cv = Canvas(W, H)
        x, y, k = px(0, style["mouth_z"])
        w = mw * ppm * k
        if variant == "smile":
            cv.stroke(_arc(x, y, w, w * 0.28), lw, INK)
        elif variant == "flat":
            cv.stroke(_arc(x, y, w * 0.8, w * 0.06), lw, INK)
        elif variant == "frown":
            cv.stroke(_arc(x, y + w * 0.12, w * 0.9, -w * 0.25), lw, INK)
        elif variant == "laugh":
            pts = [(x - w * 0.62, y - w * 0.1)]
            for i in range(1, 16):
                a = math.pi * i / 16
                pts.append((x - w * 0.62 * math.cos(a), y - w * 0.1 + w * 0.55 * math.sin(a)))
            pts.append((x + w * 0.62, y - w * 0.1))
            cv.polygon(pts, T.srgb("mouth"))
            cv.ellipse(x, y + w * 0.3, w * 0.3, w * 0.15, T.srgb("tongue"))
            cv.stroke(pts + [pts[0]], lw, INK)
            # clip tongue to mouth by redrawing outline only; small overhang is hidden
        elif variant == "oh":
            cv.ellipse(x, y + w * 0.08, w * 0.24, w * 0.3, T.srgb("mouth"))
            d = np.abs(np.sqrt(((cv.x - x) / (w * 0.24)) ** 2 + ((cv.y - y - w * 0.08) /
                                                                    (w * 0.3)) ** 2) - 1) * w * 0.24
            cv.fill(d - lw / 2, INK)
        save(f"mouth_{variant}", cv)
    return layers


EMOTIONS = {
    "neutral": ("eyes_open", "mouth_smile"),
    "happy": ("eyes_happy", "mouth_laugh"),
    "surprised": ("eyes_wide", "mouth_oh"),
    "sad": ("eyes_sad", "mouth_frown"),
    "sleepy": ("eyes_closed", "mouth_flat"),
}


# ----------------------------------------------------------------------------
# Export: every pose + face layers + sidecar
# ----------------------------------------------------------------------------
def export_character(name, rig, style, poses=POSE_ORDER):
    t_all = time.time()
    meta = {"name": name, "ppm": T.PPM, "poses": {}, "emotions": EMOTIONS}
    # Fixed frame per character: union of all poses, so pose swaps don't jump.
    for pn in poses:
        t0 = time.time()
        rig.pose(POSES[pn])
        cx, cy, w, h = T.auto_frame()
        fn = f"{name}__{pn}.png"
        rt = T.render_to(os.path.join(S, fn))
        P = lambda wp: T.screen_px(cx, cy, w, h, wp, shear=False)
        meta["poses"][pn] = {
            "file": fn, "w": w, "h": h,
            "anchor_px": P((0, 0, 0)),
            "head_px": P(rig.world("head_c")),
            "hand_R_px": P(rig.world("hand.R")),
            "hand_L_px": P(rig.world("hand.L")),
            "seat_px": P(rig.world("seat")),
            "face": "3q" if POSES[pn].get("yaw") else "front",
            "yaw": POSES[pn].get("yaw", 0),
        }
        T.log_timing(f"{name}__{pn}", time.time() - t0, {"render_only": round(rt, 2),
                                                          "px": [w, h]})
        print(f"[toonchar] {name} {pn}: {w}x{h} in {time.time() - t0:.1f}s")
    t0 = time.time()
    meta["face_front"] = face_layers(name, rig, style)
    meta["face_3q"] = face_layers(name, rig, style, yaw=POSES["walk"]["yaw"] * 0.9,
                                  suffix="_3q")
    T.log_timing(f"{name}__faces", time.time() - t0)
    json.dump(meta, open(os.path.join(S, name + ".json"), "w"), indent=2)
    print(f"[toonchar] {name}: all poses + faces in {time.time() - t_all:.1f}s")
    return meta


def compose_character(meta, pose, emotion, faces_dir=S):
    """Body + eyes + mouth for one pose/emotion (reference for the engine)."""
    p = meta["poses"][pose]
    img = T.load_rgba(os.path.join(faces_dir, p["file"]))
    fs = meta["face_3q" if p["face"] == "3q" else "face_front"]
    for key in meta["emotions"][emotion]:
        L = fs[key]
        lay = T.load_rgba(os.path.join(faces_dir, L["file"]))
        T.over(img, lay, int(round(p["head_px"][0] - L["center_px"][0])),
               int(round(p["head_px"][1] - L["center_px"][1])))
    return img
