# Bake-off A: Blender "toy / clay" sprites

Everything here comes from Python scripts in `scripts/`. There are no downloaded assets.
Rebuilding everything takes about 45 s wall clock on this Mac (Blender 5.2.1, EEVEE, 64 samples):

```sh
scripts/render_all.sh                               # all sprites + mockup.png
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/prop_cupcake.py   # one asset
```

## What's here

| Path | What |
|---|---|
| `scripts/toylib.py` | Shared library: palette, clay/gloss materials, bmesh primitives (rounded box, capsule, lathe, torus, tube, cut shells), inverted-hull outlines, 3-sun lighting, ortho camera, sprite export and JSON sidecars, and numpy image helpers (PIL is not installed, so compositing uses `bpy.data.images` + numpy). |
| `scripts/charlib.py` | Kid builder helpers and the **face-layer system** (eyes/mouth variants and emotion presets). |
| `scripts/bg_cafe_kitchen.py` | Kitchen background: fridge, counters, stove + oven, hood, shelves, window, curtains, clock, lamp, bunting. |
| `scripts/char_big_kid.py`, `char_little_kid.py` | The two kids. |
| `scripts/prop_*.py` | Frying pan, tomato (whole + sliced), cupcake, mixing bowl. |
| `scripts/compose_mockup.py` | Builds `mockup.png` by placing sprites at **world coordinates**. Each character is assembled from body + eye layer + mouth layer, the same way the game would do it. |
| `scripts/contact_sheet.py` | Debug sheet for review. |
| `sprites/` | Transparent PNGs, one `.json` sidecar per sprite, and `_render_log.json` (timings). |
| `mockup.png` | 2048x1536 in-game composite. |
| `expressions.png` | 5 emotions x 2 kids, each assembled from layers. |

### Sprite contract (important for the engine)
- One camera for everything: orthographic, pitched down 14°, at a fixed **393.8 px per metre** (@2x). Any sprite can be dropped on the background at 1:1 scale with no fudge factors.
- Each sidecar has `anchor_px`, the pixel where the object's world origin lands (feet of a character, bottom-centre of a prop). The pixel position of a world point in the background is `toylib.origin_px(cam_center..., world)`. `compose_mockup.py` is the reference implementation.
- Characters: `char_X.png` is the body with a blank face (nose and blush kept). There are 5 eye layers (`open, wide, happy, closed, sad`, with brows where needed) and 5 mouth layers (`smile, laugh, oh, frown, yum`). Each layer is cropped and has an `offset` relative to the body. Layers are rendered with the body as a **holdout**, so hair that overlaps the eyes is already cut out correctly. The `emotions` map in the JSON pairs them (`happy = eyes_happy + mouth_laugh`, etc.). `char_X__<emotion>.png` are pre-composited previews only; the game does not need them.

## Render times and file sizes

| Asset | Size (px) | Render time | PNG size |
|---|---|---|---|
| bg_cafe_kitchen | 2048x1536 | 12.3 s | 3.25 MB (opaque, detailed; see below) |
| char_big_kid body + 10 face layers | 434x636 | 1.2 s body, 9.6 s layers, 11.0 s total | body 228 KB, layers 2–16 KB each |
| char_little_kid body + 10 face layers | 327x574 | 1.1 s body, 8.5 s layers, 9.8 s total | body 181 KB, layers 2–19 KB each |
| prop_frying_pan | 279x114 | 0.9 s | 27 KB |
| prop_tomato_whole | 121x111 | 0.5 s | 14 KB |
| prop_tomato_sliced | 190x141 | 1.3 s | 28 KB |
| prop_cupcake | 122x165 | 3.4 s (34 sprinkle objects) | 22 KB |
| prop_mixing_bowl | 207x208 | 1.1 s | 44 KB |

Blender's startup adds about 2–3 s per script invocation. The whole `sprites/` folder is 7.6 MB, but about 2.6 MB of that is the preview composites (`__happy.png` etc.), which ship-time builds would drop. The background PNG is large because of lighting gradients and procedural textures. As a lossy WebP/AVIF at q≈85 it should come in around 300–500 KB (not measured). Character bodies would also shrink a lot with pngquant-style palette quantisation (not measured).

## Changing the look

- **Palette**: every colour is a named entry in `PALETTE` at the top of `toylib.py`. Scripts refer only to names (`"coral"`, `"mint"`, `"skin"`, ...), so editing one hex value recolours every asset that uses it on the next render. To try an alternative palette without editing code, write a JSON file of overrides, e.g. `{"coral": "#E86A92", "mint": "#B5E3F2"}`, and run `TOY_PALETTE=/path/to/pal.json scripts/render_all.sh`. Skin and hair tones are palette entries too, so kid variants are cheap.
- **Global knobs** (top of `toylib.py`): `PITCH_DEG` (camera angle), `PPM` (resolution / scale), `OUTLINE_PX` (line weight, kept constant in screen pixels across all sprites), `EXPOSURE`, `SAMPLES`, `CHAR_SCALE` (the kids are 1.3x "real" size next to furniture so they read and make big touch targets).
- **Lighting**: `setup_lights()` holds three suns: warm key, cool fill and a rim. Because they are suns, lighting is identical regardless of object position or size, which keeps sprites consistent.

## Honest assessment

**Strengths**
- **Charm and polish per hour of work is high.** Soft subsurface clay, glossy eyes with catch-lights, blush and a warm ink outline give a real "vinyl toy" read. The face system gives 25 expression combinations per kid, each costing about 1 s to render.
- **Consistency comes for free.** Same camera, lights, outline width and palette for every asset, all enforced in code. A new prop is typically 20–60 lines built from `sphere / box / capsule / lathe`, and it automatically matches everything else. This is the biggest advantage for a game with hundreds of sprites.
- **Repeatable and re-targetable.** One command re-renders everything. The resolution (e.g. @3x, or 1x for a lighter build), palette and outline weight are one-line changes. Swapping or recolouring outfits and hair is parametric.
- **Engine-friendly.** Metric anchors mean props land on counters and kids stand on the floor with correct scale. Face layers are tiny, so emotion swaps are cheap.
- **Fast.** Props render in about 1 s, a kid with all face layers in about 10 s, and the full background in about 12 s.

**Weaknesses and risks**
- **Characters are stiff dolls.** They have one fixed pose each. Toca-style play needs arms that hold things, sitting and walking poses, squish reactions and so on. Options: render each limb as its own layer (the holdout trick used for faces works the same way) and animate them as 2D puppets, or rig them in Blender and render pose sheets. Either is real extra work, and it is the main thing still open for this style. The big kid's straight arms and apron-covered dress also make her body read a bit plain.
- **The "3D rendered" look can drift toward generic mobile-game.** It is soft and cute but less distinctive than hand-drawn art. Fine detail such as sprinkles, seeds and knob rims becomes mush at 1x.
- **Scripted modelling has a ceiling.** Primitives are great for food, furniture and appliances, but organic shapes (clothing folds, animals, hair styles) get hard. Hair here is built from sphere clumps and cut shells. Anything like a costume closet full of capes and masks will need more complex scripting or hand modelling in Blender (still reproducible if the .blend files are kept).
- **Backgrounds are baked flat.** The mockup puts characters in front of the counters. For kids to stand *behind* a counter, or for props to go *into* the oven or fridge, the background needs splitting into depth layers (easy: render with `hide_render` groups), plus open-door variants.
- **Asset weight.** Rendered gradients compress worse than flat vector art. Plan on WebP/AVIF for backgrounds and quantised PNG for sprites to keep an offline PWA cache small. Hundreds of character poses plus layers could run to tens of MB.
- **Contact shadows** are fake 2D blobs added in the compositor. That is simple and consistent, but not as grounded as a baked shadow.
- **Toolchain dependency.** The pipeline needs Blender 5.x (API names change between versions, e.g. EEVEE Next and Principled BSDF sockets). This is fine for one Mac, but it is a dependency to pin.

**Verdict:** very strong for props and environments, and characters are appealing in stills. Choosing this style means committing to a limb-layer or pose-sheet pipeline for the characters early.
