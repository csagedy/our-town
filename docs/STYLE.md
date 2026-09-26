# "our town" art style guide

Every asset follows this guide: characters, props, rooms and UI. The direction was decided in bead `dollhouse-game-b1d.6`: **all vector**, based on the style v2 bake-off (`art-bakeoff/style-v2/`), plus two ideas from the Blender version: **rooms split into depth layers**, and **2-segment limbs** (elbow and knee).

The source of truth is the code in `tools/art/`:

| Module | What it holds |
|---|---|
| `palette.mjs` | the palette `P`, skin and hair pairs, UI colours, `ART_SCALE`, and the outline CSS `css(k)` |
| `ink.mjs` | drawing primitives: `at`, `tl` (tone line), `scallop`, `star`, `heart`, `leaf`, `rrect`, `steam` |
| `props/household.mjs` | the style-v2 kitchen props (mug, jar, pot, plants, lamps, shelves' contents, stools...) |
| `props/starter.mjs` | the 22 starter props and their tap/bite variants |
| `rooms/kitchen.mjs` | the kitchen room, split into depth layers, with surfaces and seats |
| `rooms/city.mjs` | the city map (home screen): back/front layers plus tappable pieces and moving parts, each with a night variant |
| `characters/*.mjs` | body types, limbs, faces, hair, outfit pieces, poses and the starter cast (contract: `docs/rig.md`) |
| `build.mjs` | the build (`python3 tools/build.py art`): rig data, rasters, `assets/art-manifest.json`, contact sheet |

Reuse those helpers before you draw anything new. `tools/art/contact-sheet/*.png` shows the whole starter set, and `tools/rig-preview.html` flips through every pose, expression and outfit. The copyrighted references in `art-ref/` are for style only: never trace or copy them.

The look is a cozy, front-on dollhouse. Everything is a flat fill with a thin, dark, warm outline. Rooms are dense with small collectible things. Characters have big round heads with tiny dot eyes.

## 1. Line

- **Every shape gets the same outline**: `#3D2C29` (ink), round joins and caps. You get it for free by putting the art inside `<g class="o">`. The CSS strokes every path, rect, circle and ellipse with `vector-effect: non-scaling-stroke`, so the weight stays uniform whatever the scale. Never set `stroke-width` by hand on normal shapes.
- **Units.** Art is authored in **art units** (the style-v2 scene scale, where the outline is 4.5). One art unit is `ART_SCALE` = **0.7 world units** (the 1440 x 1000 stage, where 1 CSS px = 1 world unit before the stage scale). So the outline is **3.15 world units** everywhere: `css(k)` and `scaleStrokes(svg, k)` multiply every stroke width by `k` = output pixels per art unit (0.7 for live SVG, 0.7 x R for a raster at R px per world unit). Author with style-v2 numbers; the build converts. Non-scaling strokes scale with CSS transforms and zoom on ancestors (checked in Chrome), so live characters and rasters match at any stage scale.
- **Interior detail lines** (leaf midribs, seams, curls, the mouth) use `class="d"`: 3 art units, no fill. Use `class="thin"` for a small filled shape that needs a lighter edge (nose, egg, yolk, labels).
- **Tone lines** (`tl(color)`) are lines in a darker tone of the surface, not ink: wallpaper, brick, floor planks, wood grain, stripes, glints and chalk. They sit *on* a surface; they never define a shape's edge.
- `class="n"` means no outline: soft shadows, lamp glow, blush, tiny pattern dots, the sky through a window. `class="fo"` (fill only) is for the rig's joint patches (section 4).
- UI buttons are the one exception: they have no ink outline (section 7).

## 2. Fill and shading

- Flat fills only. No gradients, gloss or drop shadows on objects.
- At most **one flat shade tone** per object, from the same colour family (`sage` → `sageDeep`), for recesses: cabinet toe-kicks, the inside of a mug, a waistband, a shelf bracket.
- Glass and gloss get one or two white strokes (a glint), never a gradient.
- Ground shadows under characters are a flat ink ellipse at 12% opacity. Lamp glow is a cream ellipse at about 45% opacity with no outline.

## 3. Palette

Muted, warm and earthy. Never use pure saturated primaries in the world; saturated colour belongs to UI buttons only. The full list is `P` in `tools/art/palette.mjs`; the families:

| Name | Hex | Use |
|---|---|---|
| ink | `#3D2C29` | all outlines, eyes, detail lines |
| white / cream / oat | `#FFFFFF` / `#FBF3E8` / `#EFE4D6` | frames, sneakers / plates, cups / rugs, sacks |
| warmGrey / warmGreyDeep | `#C9BDB3` / `#9E918A` | egg cartons, rug stitching |
| brick / brickDeep / mortar | `#EECAB8` / `#E7BBA7` / `#F6E3D8` | brick wall pattern |
| floor / floorLine | `#E7BFA3` / `#D2A184` | wood plank floor |
| woodLight / wood / woodDeep / woodDark | `#EDCBA9` / `#DDAF87` / `#C39068` / `#9C6C4C` | shelves, furniture, handles |
| blush / rose / roseDeep | `#F6D3CF` / `#E9AFAE` / `#D48C8E` | aprons, frosting, pink cabinets |
| peach / terra / terraDeep | `#F4C7A6` / `#D98B64` / `#BC6E4C` | pots, cat, teddy, towel cape |
| butter / mustard / mustardDeep | `#F4DC98` / `#DFB050` / `#C4933A` | stars, cardigan, crown |
| sage / sageDeep | `#B9CDA4` / `#93AE85` | cabinets, tees |
| leafLight / leaf / leafDeep | `#A3C98F` / `#79A86D` / `#55875A` | plants (alternate leaf and leafDeep) |
| mint / teal / tealDeep | `#CFE5DA` / `#8CBDB8` / `#679E9C` | tiles, pots, beanie, teapot |
| sky / skyDeep, blue / blueDeep | `#CBE6F1` / `#A5D0E3`, `#A3BEDC` / `#7F9FC4` | window sky; tees, china |
| lav / plum / plumDeep | `#D5C8E3` / `#9A7A98` / `#7E6180` | leggings, hero mask |
| denim / denimDeep, brown / brownDeep | `#7F9FC4` / `#6886AE`, `#8C6E5C` / `#735746` | trousers |
| charHi / char / charDeep | `#6C6670` / `#57515A` / `#433E46` | the one dark appliance per room, pans |
| steel / steelDeep, glass | `#D8DADC` / `#B2B6BA`, `#E9F4F1` | taps, rails; jars, display case |
| food | crust `#E2A860`, toast `#F1D19B`, choc `#8A5B45`, berry `#DC6B6E`, lemon `#F3D46A`, egg `#FFFDF6`, banana `#F5DB7A` | |
| mouth / tongue | `#9C4852` / `#EE9A9C` | open mouths only |
| toasty / toastyDeep | `#C98A55` / `#A96F45` | "extra toasty" food (cafe doneness 3): warm caramel plus grill stripes and a steam curl, never black |
| nori / noriDeep | `#4F6A58` / `#3F5748` | seaweed (sushi) |
| nightSky / nightSkyDeep | `#3A4170` / `#2E3460` | the city map's night sky (everything else at night is the day art through the NIGHT filter) |

**Skin tones** (`SKINS`, `--skin` / `--skin-sh`), light to dark (`SKIN_ORDER`): `#FAE3D2/#EBC0A5`, `#F3D0B5/#E2AB8E`, `#EDC3A2/#D9A07F`, `#E5B98F/#CC9A70`, `#D39A6E/#B97E55`, `#C68A5E/#A96F47`, `#A8714D/#8C5A3B`, `#93603F/#7A4C30`, `#7E5236/#65402A`, `#5E3B29/#4A2D1F`.
**Hair** (`HAIRS`, `--hair` / `--hair-sh`): near-black `#3A2A2C`, brown `#6A4A3A`, auburn `#8E3F2C`, copper `#C9713F`, honey `#E0B872`, blonde `#F0D597`, grey `#B8B0AA`, white `#EEE9E3`, and three play colours from the palette (rose, teal, lavender).
**UI only**: tangerine `#F79A4B`, grass `#62B96B`, sky `#4AA6E0`, sun `#FFD552`, grape `#A77BD6`.

Each room keeps one dark anchor (a charcoal fridge or oven). Everything else stays mid-to-light so characters pop.

## 4. Characters

Characters are a **parts rig drawn as live SVG** at runtime; the contract (parts, pivots, draw order, wear slots, colour variables, expressions, poses, anchors) is **`docs/rig.md`**. Style rules:

**Proportions** (feet at y=0, art units; world = x 0.7):

| body | total height | head rx × ry | head centre y | shoulders | arm (upper + lower) | leg (thigh + shin) |
|---|---|---|---|---|---|---|
| `kid5` (~5) | 328 | 80 × 76 | -252 | ±42, -168 | 36 + 36 | 28 + 28 |
| `kid9` (~9) | 380 | 82 × 80 | -300 | ±46, -206 | 42 + 42 | 54 + 50 |
| `teen` | 468 | 78 × 78 | -390 | ±50, -290 | 56 + 58 | 76 + 72 |
| `adult` | 530 | 74 × 78 | -452 | ±56, -352 | 68 + 70 | 96 + 92 |
| `elder` | 504 | 76 × 78 | -426 | ±56, -330 | 64 + 66 | 88 + 84 |

- The **head is huge**, 40–50% of a child's height and about 30% of an adult's, always wider than the shoulders (`headShape(rx, ry)`, a soft squircle). Ears are small ellipses behind the head.
- **The body is a simple rounded trapezoid**; feet are small rounded shoes pointing slightly outward. No necks to speak of.
- **Limbs have two segments** (upper arm + forearm, thigh + shin) so sitting, walking, holding and waving bend naturally. They are drawn as **smooth capsules with no visible joint**: each limb layer is three fragments (`limbLayer()` in `characters/body.mjs`): the upper capsule with a full outline, the lower capsule with an *open* top (outline on the sides and far end only), then a fill-only patch (`class="fo"`) over the joint end of the upper segment, inset by half the ink width, which hides the lower segment's outline stubs. The result reads as one bent tube, never as two sticks with a crease. Sleeves and trouser legs use the same three fragments in their own colour. A thigh (or upper arm) may be **foreshortened** (scaled along its length) to show a knee pointing at the viewer: that is how sitting and the raised walking leg read front-on.
- **Hands are mittens**: a circle with one tiny detail line for the thumb. No fingers, no visible elbow or knee bumps.
- **The clothes carry the personality**: patterns (stripes, a star, polka dots), one fun accessory (headband, cape, beanie, glasses, crown), a print on a pocket.

**Face.** Positions are relative to the head centre; `rx` is the head's half-width.
- **Eyes**: solid ink ovals, about 8.5 × 11, **no white highlight**, about 0.38·rx either side of centre and slightly *below* the centre line. Wide apart and low.
- **Lashes** (optional per character): one short flick at the outer top corner of each eye, pointing out and up; never reads as a brow.
- **Nose**: a tiny oval in the skin shade. **Mouth**: a tiny curve; open mouths are small D shapes in `mouth` with a `tongue` blob.
- **Brows**: hidden by default; shown only for an expression (arches for surprise, inner-end-low for grumpy, inner-end-high for sad).
- **Blush**: optional per character, rose at 45% with no outline.
- **Expression vocabulary**: dot eyes (neutral, happy), `^ ^` (laughing, wheee), `‿ ‿` (yum, singing, love), a wink (cheeky), big dots + arches + "o" (surprised), half-lids + angled brows + frown (grumpy), a wobbly mouth + tear (sad), closed lines + "z" (sleepy).

**Hair** is one bold shape in front and optionally one behind the head (a puff or bun on top, pigtails at the sides, or a bob hanging behind the shoulders), with 2–4 detail curls. Not strands. Curly hair uses `scallop()`.

## 5. How to draw a new prop

1. **Origin at the bottom centre**, the point where it rests on a shelf. Author in art units: a mug is about 50 tall, a jar 60–100, a plant 100–130, an appliance 150–200. Hand-held food stays small (an apple about 50).
2. **Silhouette first**: 2–6 simple rounded shapes, front-on with at most a hint of top surface. Round every corner.
3. **Fill** each shape with one palette colour; one shade tone only for a recess.
4. **Add 1–3 details**: a detail line, a small pattern, a label with a *picture* on it. **Never use words**: the game needs zero reading.
5. **A glint** (one white tone line) only on glass or ceramic.
6. **Variants**: draw every obvious tap state (open/closed, full/empty, bud/bloom) and, for food, the bites (`whole`, `bite1`, ... and what is left, or nothing). A bitten edge is a scalloped notch in the silhouette.
7. Add it to `PROPS` in `props/starter.mjs` (or a location's own list) with `tags`, `taps`/`bites`, a `grip` if the hand should hold it off-centre, and a `surface` if things sit on or in it. Run `python3 tools/build.py art` and check it in `tools/art/contact-sheet/props.png` next to the others: it should look like a sticker from the same sheet.

## 6. Rooms

- **Front-on dollhouse view.** The back wall is flat; the floor is below `WALL_Y`. Floor planks are horizontal tone lines whose spacing grows toward the viewer, with a few seam ticks aimed at a vanishing point near the top centre.
- **Wall surfaces are patterns in tone colours**, no ink lines inside: soft brick, tiles, wallpaper motifs.
- **Depth layers.** A room is drawn as separate layers so characters can stand *between* furniture:
  1. `back`: wall, floor, window, wall shelves, lamps, rugs. Opaque, full canvas. Everything is behind it.
  2. `counter`: furniture against the wall (fridge, back counter, display case).
  3. `mid`: free-standing furniture in the room (an island, stools, chair backs).
  4. `front`: foreground furniture (a table top that covers a seated lap, a big floor plant).
  Each layer has a **baseline** (world y of its front edge). A character or loose prop whose feet are at `y >= baseline` draws in front of that layer and behind the next one. So a grown-up at y 800 stands *behind* the island (mid baseline 820) and in front of the back counter (720). Seats (`seats`) hold the sit anchor; chair backs go in `mid`, the table in `front`, so a seated character is between them.
- **Surfaces** are `[x0, x1, y]` segments (shelves, counter tops, table tops) with the layer they belong to; a prop resting on one draws with that layer.
- The room canvas covers the stage plus the **100-unit bleed** on every side (`canvas` in the manifest); keep walls and floor going to the edges and the interesting things inside 0..1440 x 0..1000.
- **Density is the point.** Every shelf is full: plants, jars, baskets, bottles, bowls, books, mugs, lanterns. Alternate tall and short items and vary the colours along a shelf. Add trailing plants and pendant lamps. Leave the floor centre open for play.
- Each room has one "story" prop (the cafe cat, a kid's drawing on the fridge, a picture-only menu board).

## 7. UI

- Big round buttons, at least 132px across at 2048 wide, in the corners only. A saturated fill (UI colours), a 12px white ring, a soft drop shadow (black at 16%), and a subtle darker lower half. Icons are white, solid and simple, with no outline and no text.
- The UI floats above the art. It never uses ink outlines, so it reads as a separate layer.

## 8. Dos and don'ts

**Do**: keep the outline uniform (`class="o"`); keep eyes tiny, solid and low; let patterns and accessories characterise; reuse the helpers and palette names; add colours to `P` (and this table) only if a family is truly missing; stay original.

**Don't**: gradients, gloss, 3D shading, drop shadows on objects, glow except lamps; big anime eyes, highlights or irises; saturated primaries in the world or pure black lines; varied line weight; unlined shapes except as listed in section 1; text on props or signs; logos, brands or real-world IP (no Marvel or Disney: capes are towels or plain hero capes, masks are generic); realistic anatomy (fingers, knee or elbow bumps, necks); empty shelves.

## 9. Runtime delivery format (older iPads)

Decision for the A9X iPad Pro on Safari 16 (2–4 GB RAM) and the M1 iPad Air. Measured with `node tools/art/measure.mjs` (results in `tools/art/measurements.json`): headless Chrome on the build Mac (Apple M4) with **CPU throttling x5** as a stand-in for the A9X, median of 5 decodes, each into a fresh blob URL. It's Blink with software raster, not WebKit, so read the times as A-vs-B, not as iPad numbers; re-check on the real iPad.

| Asset | Format | Why |
|---|---|---|
| **Room layers** | **WebP, 1.5 px per world unit**, built by headless Chrome (`<img>` of the SVG → canvas → `toDataURL('image/webp', 0.9)`). `back` is opaque and full canvas; the other layers are cropped to their content with an `x, y, w, h` placement box. | See the numbers below: the dense back layer decodes about 2x faster as WebP than it rasterizes as SVG, decoding happens off the main thread (`img.decode()`), and a raster never re-rasterizes when the stage scale changes. 1.5 px/unit matches the 9.7" A9X (1.42 device px per unit) and the Air (1.64); the 12.9" (1.9) upscales 1.27x, which the soft line art tolerates. 2 px/unit would cost +78% decoded memory (30 vs 17 MB for the back layer alone) on 2 GB devices. |
| **Props** | **WebP sprites, 2 px per world unit**, one file per variant, cropped with 5 art units of padding. The manifest gives each variant's world `size` and `anchor` (the resting point, measured from the image's top-left). | One DOM node per prop; tap-state and bite changes are an `src` swap (pre-decode the variants with `img.decode()`). Props are small, dragged at 1.08x and shown up close, so they get the higher density; all 41 variants are only 142 KB. |
| **Characters** | **Live inline SVG** assembled at runtime from `assets/characters/rig.json` by `src/engine/rig-svg.js`. Colours are CSS custom properties; poses are `transform` attributes on part groups. | Recolouring, outfit swaps (18 pieces in 7 slots), 13 expressions and 11 poses multiply to hundreds of thousands of combinations per character: pre-rendering is impossible. Live SVG is 120 nodes and 9.6 KB per character, and re-posing all 8 characters every frame still held 60 fps at x5 throttle (1.2 ms of JS per frame). Cached rasterization (drawing an idle character to a canvas) stays a later optimization if the iPad disagrees. |

Kitchen numbers (display comparison at 1.9 px/unit for SVG, the densest target):

| layer | SVG size / elements | SVG raster (ms) | WebP 1.5x: KB, px, decoded MB, decode ms | WebP 2x: KB, decoded MB, decode ms | PNG 1.5x KB |
|---|---|---|---|---|---|
| back | 54 KB / 637 | 194–215 | 211 KB, 2460x1800, 16.9 MB, 102–109 | 284 KB, 30.0 MB, 134–158 | 469 |
| counter | 19 KB / 216 | 26–38 | 56 KB, 1546x816, 4.8 MB, 32–44 | 76 KB, 8.5 MB, 52–60 | 116 |
| mid | 11 KB / 115 | 10–19 | 27 KB, 1281x523, 2.6 MB, 18–27 | 35 KB, 4.5 MB, 26–39 | 49 |
| front | 7 KB / 82 | 11–17 | 27 KB, 2048x578, 4.5 MB, 36–48 | 35 KB, 8.0 MB, 66–82 | 63 |
| **room total** | 91 KB | ~250 | **320 KB, 28.8 MB** | 430 KB, 51.0 MB | 697 |

Props (41 variants): WebP 142 KB total, 175 ms total decode (about 4 ms each) vs SVG 65 KB, 150–250 ms total raster. Characters: 8 on screen = 916 DOM nodes, mount and first paint 30 ms, pose or expression change on all 8 per frame = 16.9 ms frame interval.

Notes:
- The small layers are a wash between SVG and WebP in Blink; they are WebP anyway for one code path, predictable memory and no main-thread SVG raster in WebKit. PNG is 2–2.5x bigger than WebP for the same pixels; Safari 16 decodes WebP, so there is no PNG fallback.
- Memory: one room (four layers) is about 29 MB decoded plus its GPU copy. Load one room at a time and drop the last room's `<img>`s on travel.
- Bytes: the whole starter set (rig 76 KB, kitchen 320 KB, props 142 KB) is well inside the 3 MB first-load budget.

### The city map (P1.13)

`tools/art/rooms/city.mjs` draws the map like a room (art units, 1.5 px per world unit) but ships it as a `back` layer (opaque), a `front` layer and **pieces**: every thing that reacts to a tap (the four buildings, the sun and the moon, the birds, the bus, the lots, the Lost & Found box) and every moving part (the cafe door, the theater curtains, the crane's jib, the school bell) is its own cropped WebP with a world box, a draw-order `depth` and, for moving parts, a `pivot`. The six lots are one image placed at six `copies`.

**Night** is built, never computed at runtime: each layer and piece is rasterized a second time through an SVG `feColorMatrix` (NIGHT in `city.mjs`, a cool blue dim), with the sky swapped for `nightSky` and stars, and the `lit()` extras drawn on top unfiltered (warm window glass, lamp glows at 30–45%, bulbs, headlights). Draw functions call `lit()` next to the shape they light, so the two variants always line up; day and night share one crop box (the union), so the runtime swaps them in place with an opacity cross-fade and then drops the unused file (only one set is decoded at a time: about 30 MB for the whole map).

Rules for adding to the map: buildings must read by silhouette alone (no words on signs: a cup, a star, a crane, a bell); anything tappable gets its own piece; keep it dense (trees, lamps, little distant houses in every gap).

### The cafe strip (P2a.1)

`tools/art/rooms/cafe.mjs` is one 2880-wide room (kitchen, order counter, dining) in the usual four depth layers, plus **pieces**: every fixture that changes state (fridge and oven doors, burner flames and knobs, sink tap, toaster lever, blender fills, coffee pours, register drawer, counter bell, menu board blank/pictures, front door, door bell) is its own WebP per variant. All variants of a piece share one box, so a state change is an in-place `src` swap; the static layers never draw a piece. The room also records `slots` (burner rests, oven interior, sink basin, cutting board, toaster, blender, coffee spout, register drawer and keys, ice-cream tubs, door, order spot), `spawners` (fridge, pantry, freezer, cups, plates) and camera `zones`. Food and cookware live in `tools/art/props/cafe.mjs`: prep states are variants and `prep.cut` / `prep.cook` name them (cook = the variant at doneness 0..3). Dish bites use `bitten()`, which masks a scalloped notch out of the food only (the plate stays) and inks the notch edge. The Mystery Dish is a plate + blob per colour, with eyes, mouth and topper as separate sprites placed at `manifest.cafe.mystery.at`.

### Files and manifest

`python3 tools/build.py art` writes:
- `assets/characters/rig.json`: the rig data (`docs/rig.md`).
- `assets/rooms/<room>/<layer>.webp` and `assets/sprites/props/<prop>[-<variant>].webp`.
- `assets/art-manifest.json`, all in world units:
  - `rooms.<id>`: `width`, `canvas` (the bleed box), `pxPerUnit`, `layers[]` (`id, file, x, y, w, h, px, bytes, baseline, opaque`), `surfaces[]` (`id, layer, x0, x1, y`), `seats[]` (`id, layer, at`), `floor` (`y0, y1`).
  - `map`: the city map: `width`, `canvas`, `backdrop.{day,night}`, `layers[]` and `pieces.<id>` (`file, x, y, w, h, px, bytes, night: {file, bytes} | null, depth, pivot | null, copies | null`).
  - `props.<id>`: `label, tags, default, variants.<name>` (`file, px, bytes, size, anchor`), `taps, oneWay, bites, grip, surface`, `set` (`starter` or `cafe`), `prep`, `leaves` (what a finished dish leaves behind).
  - `rooms.cafe` adds `pieces.<id>` (`layer, default, variants.<name>.{file, bytes}, x, y, w, h, px, taps, pivot`, and `textArea` on the menu board), `slots[]` (`id, kind, layer, at, box, piece`), `spawners[]`, `zones[]` (`id, x0, x1, camera`), and `inside` on surfaces that only exist while a door is open.
  - `cafe`: ingredient, dish and cookware lists, doneness levels and fallback tints, and the Mystery Dish kit. `grip` and `surface` are relative to the anchor.
  - `characters`: `rig` (file), `cast`, `bodies.<id>` (`height`, `anchor` = the feet point), `poses`, `expressions`, `wear` (piece → slot).
- `tools/art/contact-sheet/*.png`: screenshots of `tools/art/contact-sheet/index.html`, which composes the shipped files through the runtime assembler (so it also checks the format).

Mapping to the view layer (`src/engine/room.js`, `sprites.js`): `back` → `layer: 'back'`; `counter` and `mid` → `layer: 'mid'` with `depth` = the layer baseline; `front` → `layer: 'mid'` with its baseline (or `'front'` if nothing should ever pass in front of it). A prop sprite's draw offset is `-anchor` (not the bottom centre of its box: padding and asymmetric props like the pan move it).
