# Style v2b: Blender flat/toon toward Toca line art

This is round 1's Blender pipeline (`../blender/`) restyled to match the two parent references (`art-ref/`, never copied or committed). The scene is still built entirely from Python scripts and rendered headless, but the output is now flat colour with uniform ink lines. The characters are new, Toca-proportioned and rigged.

```sh
scripts/render_all.sh          # everything: about 30 s wall clock (Blender 5.2.1, EEVEE)
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/characters.py -- boy
```

Deliverables:
- `mockup.png` (2048x1536): the kitchen with its depth layers, three characters and held props.
- `sheet.png`: for each of the 3 characters, all 6 poses plus 5 expressions, followed by the 6 props at @2x.
- `sprites/`: every layer, pose, face part and prop, each with a JSON sidecar. `_render_log.json` has the timings.

## How the look is achieved

| Toca trait | How it's done here (`scripts/toonlib.py`) |
|---|---|
| Flat fills, at most one shade tone | Every material is an **Emission** shader, so it is unlit. A single sun (no cast shadows) goes through a Diffuse BSDF, then **Shader-to-RGB**, then a hard `N·L > 0.18` step. That step picks between the base colour and base × `shade_tint`, which gives each surface one hard-edged shade crescent on the far side of round things. Heads and skin use no band at all, so faces stay perfectly flat. The view transform is **Standard**, so a palette hex renders as exactly that hex. |
| Thin, uniform, warm-dark outline everywhere | **Freestyle** is set to absolute thickness `LINE_PX = 3.0` px in ink `#3A2A26`, with round caps. The line set draws silhouettes, contours, borders (open edges such as the cape or apron), creases (edges sharper than 125°) and edge marks. Furniture is built from **sharp** boxes, so Freestyle draws the top/front edges and every door and drawer panel as interior lines. Round things are subdivided, so they get only clean silhouettes. Objects in a `noline` collection (hair strands, chalk doodles, cords, the glasses) are excluded. Interior hair strokes are thin ink tubes (2.2 px). |
| Front-on dollhouse view | An **orthographic camera looking straight in** (no pitch). The floor and counter tops are shown with a **cabinet-projection shear** (`z += 0.4·y`) that is baked into the room and prop geometry before rendering. Fronts stay undistorted, tops and the floor recede like the references, and characters are rendered **unsheared**, so they are perfectly frontal like Toca kids. |
| Muted, earthy palette | This is the named `PALETTE` in `toonlib.py`: terracotta, sage, dusty rose, oat, warm grey, pinky wood, and a charcoal fridge as the dark anchor. Overrides work the same way as in round 1 (`TOY_PALETTE=pal.json`). |
| Exposed brick, floor boards | Blender's Brick Texture with 2 close tones and soft mortar, and no ink. Floor boards use the same node stretched, with darker seams. |

### Characters (`toonchar.py`, `characters.py`)
- **Proportions follow the reference.** The head is about 40% of a kid's height, with short tube limbs, **mitten hands**, small ovoid shoes and a small 3D nose bump outlined by Freestyle. Hair is one bold shape: a back shell plus a fringe built directly on the head ellipsoid with a **scalloped, pointy-lock edge**, plus bold extras (pigtails, tufts, a curl cloud and bun). Clothes carry the personality:
  - Girl (9): striped tee, blush apron with a heart pocket, auburn pigtails.
  - Boy (5): star tee, shorts, a towel cape with stripes and a knot at the neck, messy tufts.
  - Adult customer: curly bun with a teal band, round glasses, a cardigan over a V-neck top, earrings.
- **Rig.** Rigid parts are bone-parented to a 12-bone armature (root, hips, chest, head, upper arm and forearm ×2, thigh and shin ×2). Poses are a small table of rotations in armature axes (`POSES`). The 6 poses are **stand, wave, hold_up** (arms raised in front holding something), **cheer** (both arms up), **walk** (the body yawed 34° to 3/4 so the stride reads) and **sit**. A pose can also hide parts; the apron's skirt panel is hidden when sitting. Adding a pose is one dict entry, and every character gets it for free. Each pose renders in under 1 s.
- **Faces are swappable 2D layers.** The body renders with a blank face. Eyes (`open, happy, wide, sad, closed`) and mouths (`smile, laugh, oh, frown, flat`) are drawn as anti-aliased signed-distance shapes (black dot or oval eyes, one lash flick for the girl and the adult, tiny mouths), using the same ink and the same line weight. Each pose's sidecar stores `head_px`, and the layers are placed there, so **any expression works on any pose**. A second, **3/4 face set** (features slid round the head) is used for the turned walk pose. Emotions: neutral, happy, surprised, sad, sleepy.
- The sidecars also store `hand_R_px`, `hand_L_px` (where a held prop goes) and `seat_px` (the point that goes on a chair seat). `compose_mockup.py` is the reference implementation for the engine.

### Room (`bg_cafe_kitchen.py`)
The room has 771 objects and is rendered as **4 depth layers** with the same camera: `bg_back`, `bg_island`, `bg_chairs` and `bg_front`. Characters are drawn between them. In the mockup, the girl stands in front of the island and its stools, and the customer sits on a chair *behind* the table, with the table covering her lap. Contents, following the fanmade kitchen's traits:
- Exposed brick with a plaster column around the window.
- Densely stocked open wood shelves on both sides: potted plants, baskets, lanterns, jars, bottles, an egg carton, stacked plates, books, bread, a teapot, a clock, hanging mugs and glasses.
- Trailing hanging plants, pendant bulbs and a fairy-light garland.
- A dark matte fridge with a kid's drawing and magnets, and a doodle-only chalkboard (no text).
- A sage cabinet run with a sink, dish rack and window with café curtains, a cream stove with pot and kettle, a utensil rail, and a stand mixer.
- An island with stools, a runner rug, a dining table with chairs and stools on a round rug, and a big floor plant.

## Render times (this Mac, EEVEE + Freestyle)

| Asset | Time |
|---|---|
| Kitchen: build + shear bake | about 1.5 s |
| Kitchen: `bg_back` render (2048x1536) | 5.3 s |
| Kitchen: island, chairs, front layers | about 1 s each |
| One character: all 6 poses | 3.4–5.3 s |
| One character: all 10 face layers | about 0.08 s (numpy, no render) |
| One prop | 0.2–0.4 s |
| Full `render_all.sh` (bg, 3 chars, 12 prop renders, mockup, sheet) | about 30 s wall clock |

Blender startup adds about 2 s per script, and most of the wall clock is Blender launches. Freestyle turned out to be cheap at this scale.

## File sizes (WebP measured with `cwebp`)

Flat colour and hard lines compress far better than round 1's gradients.

| Asset | PNG | WebP |
|---|---|---|
| `bg_back` 2048x1536 (opaque) | 2.00 MB | **168 KB** (q85) |
| `bg_island`, `bg_chairs`, `bg_front` (full-frame, mostly transparent) | 0.50, 0.40, 0.55 MB | **25, 11, 40 KB** (q85) |
| One character: 6 poses + 20 face layers (26 files) | 350–440 KB | **81–92 KB** (q90, lossless alpha) |
| One pose body (girl stand, 272x421) | 71 KB | 14 KB |
| One face layer | about 1.8 KB | about 0.7 KB |
| All characters + props + faces (96 files) | 1.40 MB | **303 KB** |
| `mockup.png` | 3.1 MB | 223 KB (q85) |

A whole room plus a cast of three with 6 poses each comes to **about 0.55 MB as WebP**. Round 1's background PNG alone was 3.25 MB. Caveat: Safari 16 decodes WebP (including alpha), so it meets the compatibility floor.

## Iterations (each compared side by side with the references)
1. **Freestyle + toon test.** Ink weight and crease lines looked right. Two bugs: bone-parenting put every part at the origin, and faces had a large shade crescent. Fixed the parenting and made skin and hair (nearly) flat.
2. **Characters.** Raised arms disappeared behind the big heads (Toca arms can't reach over the head), so the arm poses were redone. The first fringe (a flat plane cut) read as a helmet, then a row of lock balls read as curls. Replaced it with a smooth parametric fringe with pointy locks, then added hair strand lines. The cardigan got a V-neck.
3. **Mockup v1** already had the fanmade kitchen's density. Problems: the brick read as dashes, a held cake covered the girl's face, a pendant bulb overlapped a shelf, and the boy's wave hit his own ear. Fixed with a proper brick size and mortar, a softer brick palette, hold_up at chest height holding a cupcake, a separate cheer pose, and a moved lamp.
4. **Mockup v2/v3.** Tuned the wave angles, moved the boy clear of the plant, and added a mug and teapot on the customer's table.

## Honest assessment

**Versus the Toca references**
- **Close:** flat fills, one uniform warm ink line on everything, including interior panel lines, a front-on dollhouse floor, and a muted cozy palette. The fanmade kitchen's shelf clutter and depth layers carry over well. The faces (dot eyes, lash flick, tiny nose bump, tiny mouth) and the big-head, mitten-hand proportions read as Toca-style at a glance. I think this is much closer to Toca than either round-1 entry.
- **Still off:**
  - **Lines are too perfect.** Toca linework has slight hand-drawn wobble, rounded corners on furniture and tapering. Ours is CAD-crisp: sharp box corners and constant width. A curve-noise or width-variation Freestyle modifier, or small bevels plus edge marks, could close some of the gap, but it will never quite look hand-inked.
  - **Clothing is simpler.** Toca outfits have collars, cuffs, drawstrings, prints and pockets everywhere. Ours has a few features per outfit. Every extra detail is more scripted modelling.
  - **Bodies are tubes.** Rigid capsule limbs pose well, but the torsos are plain rounded cones. Toca bodies have more drawn shape.
  - **Props are simpler and less varied** than Toca's (no labels or brand-like prints, which is also deliberate, since there is no reading for Ian).
  - **Kid cheer pose:** Toca-proportioned arms can only reach ear height. It reads as "yay, hands up", not arms stretched overhead. That is a limit of the proportions, not the rig.
  - **Contact shadows** are a small flat ellipse added at composite time. Toca uses almost none, so this is a judgement call.

**Versus a pure-vector approach (`../vector/`)**
- **Blender wins on:**
  - **Poses.** One rig gives every character every pose, including 3/4 turns, for free. Each new pose is about 5 lines, versus redrawing arms and legs per character in vector.
  - **Consistency at scale.** The same line weight, palette and camera apply to hundreds of assets automatically, and one command re-renders everything.
  - **Depth layers.** Layers and occlusion come from real geometry: chair backs behind a sitter, stools behind a kid.
  - **Cheap variants.** Palette swaps, resolution (@2x/@3x) and skin or hair variants cost almost nothing.
- **Vector wins on:**
  - **Hand-drawn charm and exact silhouette control.** A clever drawn shape is one path, whereas here it is geometry math.
  - **Resolution-independent output.** A true vector pipeline could ship SVG and skip raster sizes entirely.
  - **No toolchain dependency.** This pipeline needs Blender 5.x.
- **Organic shapes are hard in both.** Hair styles, costumes and animals still take careful scripting here.

**Verdict:** this answers the parent's "make the Blender one look more like Toca" and fixes round 1's biggest weakness, stiff one-pose dolls. If the parent and kids accept the slightly-too-clean line, I'd pick this pipeline. The next steps would be a Freestyle wobble/taper experiment, more outfit detail, and depth layers for more rooms.

## Files
- `scripts/toonlib.py`: palette, toon materials and patterns, Freestyle setup, primitives, the shear bake, framing and export, and numpy image helpers.
- `scripts/toonchar.py`: rig class, pose table, body-part builders, SDF face layers and the character exporter/compositor.
- `scripts/characters.py`: the three characters.
- `scripts/props.py`: prop builders (shared with the room) and the prop sprites (1x and @2x).
- `scripts/bg_cafe_kitchen.py`: the room and its 4 depth layers.
- `scripts/compose_mockup.py`, `scripts/compose_sheet.py`, `scripts/render_all.sh`.
