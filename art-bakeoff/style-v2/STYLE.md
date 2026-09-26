# "our town" art style v2: style guide

Every asset follows this guide: characters, props, rooms and UI. The source of truth is `build.mjs`: the palette `P`, the `CSS` block, and the helpers `character()`, `leaf()`, `jar()`, `pot()`, `basket()`, `shelfBoard()`, `cabinets()` and `button()`. Reuse those helpers before you draw anything new. `mockup.png` and `sheet.png` show the target.

The look is a cozy, front-on dollhouse. Everything is a flat fill with a thin, dark, warm outline. Rooms are dense with small collectible things. Characters have big round heads with tiny dot eyes.

## 1. Line

- **Every shape gets the same outline**: 4.5px `#3D2C29` (ink) at 2048x1536 scene resolution, with round joins and round caps. You get it for free by putting the art inside `<g class="o">`. The CSS strokes every path, rect, circle and ellipse with `vector-effect: non-scaling-stroke`, so the weight stays uniform at any scale. Never set `stroke-width` by hand on normal shapes.
- **Interior detail lines** (leaf midribs, seams, curls, fingers, pockets, the mouth) use `class="d"`: 3px ink with no fill. Use `class="thin"` for a small filled shape that needs a lighter edge (nose, egg, yolk, labels).
- **Tone lines** (`tl(color)`) are lines in a darker tone of the surface, not ink. Use them for wallpaper, brick, floor planks, wood grain, fabric stripes, rib knit, glints and chalk. They sit *on* a surface; they never define a shape's edge.
- `class="n"` means no outline. Use it only for soft shadows, lamp glow, blush, tiny dots in a pattern, and the sky or hills seen through a window.
- UI buttons are the one exception: they have no ink outline (see section 7).

## 2. Fill and shading

- Flat fills only. No gradients, gloss or drop shadows on objects.
- You may add **at most one flat shade tone** per object, from the same colour family (`sage` → `sageDeep`). Use it for recesses: cabinet toe-kicks, the inside of a mug, a waistband, a shelf bracket.
- Glass and gloss get one or two white strokes (a glint), never a gradient.
- Ground shadows under characters are a flat ink ellipse at 12% opacity.
- Lamp glow is a cream ellipse at about 45% opacity with no outline.

## 3. Palette

These colours are muted, warm and earthy. Never use pure saturated primaries in the world; saturated colour belongs to UI buttons only.

| Name | Hex | Use |
|---|---|---|
| ink | `#3D2C29` | all outlines, eyes, detail lines |
| white | `#FFFFFF` | window frames, glints, sneakers |
| cream | `#FBF3E8` | plates, cups, baseboard, collars |
| oat | `#EFE4D6` | rugs, sacks, stool seats |
| warmGrey / warmGreyDeep | `#C9BDB3` / `#9E918A` | egg cartons, rug stitching |
| brick / brickDeep / mortar | `#EECAB8` / `#E7BBA7` / `#F6E3D8` | brick wall pattern |
| floor / floorLine | `#E7BFA3` / `#D2A184` | wood plank floor |
| woodLight / wood / woodDeep / woodDark | `#EDCBA9` / `#DDAF87` / `#C39068` / `#9C6C4C` | shelves, furniture, handles |
| blush / rose / roseDeep | `#F6D3CF` / `#E9AFAE` / `#D48C8E` | aprons, frosting, pink cabinets |
| peach / terra / terraDeep | `#F4C7A6` / `#D98B64` / `#BC6E4C` | pots, cat, cake sponge, towel |
| butter / mustard / mustardDeep | `#F4DC98` / `#DFB050` / `#C4933A` | stars, cardigan, lanterns |
| sage / sageDeep | `#B9CDA4` / `#93AE85` | cabinets, tees |
| leafLight / leaf / leafDeep | `#A3C98F` / `#79A86D` / `#55875A` | plants (alternate leaf and leafDeep) |
| mint / teal / tealDeep | `#CFE5DA` / `#8CBDB8` / `#679E9C` | tiles, pots, beanie, teapot |
| sky / skyDeep | `#CBE6F1` / `#A5D0E3` | window sky |
| blue / blueDeep | `#A3BEDC` / `#7F9FC4` | tees, china pattern |
| lav / plum | `#D5C8E3` / `#9A7A98` | leggings, accents |
| charHi / char / charDeep | `#6C6670` / `#57515A` / `#433E46` | the one dark appliance (fridge, oven), pans |
| steel / steelDeep | `#D8DADC` / `#B2B6BA` | taps, rails, utensils |
| glass | `#E9F4F1` | jars, display case |
| chalk | `#56645D` | chalkboards |
| food | crust `#E2A860`, toast `#F1D19B`, choc `#8A5B45`, berry `#DC6B6E`, lemon `#F3D46A`, egg `#FFFDF6` | |
| mouth / tongue | `#9C4852` / `#EE9A9C` | open mouths only |

**Skin tones**, each as a `--skin` / `--skin-sh` pair: `#F3D0B5/#E2AB8E`, `#EDC3A2/#D9A07F`, `#D39A6E/#B97E55`, `#A8714D/#8C5A3B`, `#7E5236/#65402A`.
**Hair**: near-black `#3A2A2C`, brown `#6A4A3A`, copper `#C9713F`, honey `#E0B872`, grey `#B8B0AA`.

**UI only**: tangerine `#F79A4B`, grass `#62B96B`, sky `#4AA6E0`, sun `#FFD552`, grape `#A77BD6`.

Each room keeps one dark anchor (a charcoal fridge or oven). Everything else stays mid-to-light so characters pop.

## 4. Characters

**Proportions** (feet at y=0, units at scene scale 1.0):

| | total height | head rx × ry | head centre y | shoulders | arm length |
|---|---|---|---|---|---|
| child ~5 | ~345 | 80 × 76 | -252 | ±42, -168 | 72 |
| child ~9 | ~440 | 82 × 80 | -300 | ±46, -206 | 84 |
| adult | ~600 | 74 × 78 | -452 | ±56, -352 | 138 |

- The **head is huge**, 40–50% of a child's height and about 30% of an adult's. It is always wider than the shoulders. Use `headShape(rx, ry)`, a soft squircle with full cheeks and a wide, rounded chin. Ears are small ellipses behind the head.
- **The body is a simple rounded trapezoid.** Legs are straight rounded tubes. Feet are small rounded shoes pointing slightly outward. No knees, elbows or necks to speak of.
- **Arms** are one straight tube hanging from a shoulder pivot. A sleeve cap covers the top, and the hand is a **mitten**: a circle r=16 with one tiny detail line for the thumb. Poses come from rotating arms, tilting the head (±6°), and holding props.
- **The clothes carry the personality**: patterns (polka dots, stripes, a star), one fun accessory (headband, towel cape, beanie, glasses), and a print on a pocket.

**Face.** Positions are relative to the head centre. `rx` means the head's half-width.
- **Eyes**: solid ink ovals, about 8.5 × 11, with **no white highlight**. They sit about 0.38·rx either side of centre, slightly *below* the centre line (about +0.13·ry). They are wide apart and low.
- **Lashes** (optional): one short 3.5px flick at the outer top corner of each eye. They must point outward and up, and never read as a brow.
- **Nose**: a tiny oval (7 × 5.5) in the skin shade with a thin outline, at +0.35·ry.
- **Mouth**: a tiny curve, 18–22 wide, at +0.55·ry. Open mouths are small D shapes in `mouth` with a `tongue` blob.
- **Brows**: hidden by default. Show them only for an expression: arches for surprise, angled lines for grumpy (inner end low).
- **Blush**: optional, rose at 45% opacity with no outline. Kids get it; most adults don't.
- **Expression vocabulary**: dot eyes (neutral or happy), `^ ^` closed arcs (laughing), `‿ ‿` closed arcs (content, "yum"), a one-eye wink (cheeky), bigger dots plus arched brows plus an "o" mouth (surprised), half-lidded eyes plus angled brows plus a frown (grumpy).

**Hair** is one bold shape in front (`hairFront`) and optionally one behind the head (`hairBack`), with 2–4 detail curls inside. It is not strands. Curly hair uses `scallop()`.

**Rig contract.** Every character exports named groups:
`<id>`, `<id>-arm-l-pivot`, `<id>-arm-r-pivot`, `<id>-head` (it rotates around the chin), `<id>-face` containing one `<id>-face-<expr>` group per expression (the extras are `display:none`), and optionally a `back` layer (cape, long hair). Colours come only from CSS variables (`--skin --skin-sh --hair --hair-sh --top --top-sh --acc --acc-sh --bot --shoe --sock`), so one rig plus a new variable set gives a new NPC. A held prop is drawn *before* the arm, so the mitten overlaps it.

## 5. How to draw a new prop

1. **Origin at bottom centre**, the point where it rests on a shelf. Author at scene scale: a mug is about 50 tall, a jar 60–100, a plant 100–130, an appliance 150–200.
2. **Silhouette first.** Build it from 2–6 simple rounded shapes (rounded rects, ellipses, simple curves), front-on with at most a hint of top surface. Round every corner (rx 4–12).
3. **Fill** each shape with one palette colour. Add one shade tone only if the object has a recess.
4. **Add 1–3 details**: a detail line (seam, handle, midrib), a small pattern (dots, stripes, a heart), a label with a *picture* on it. **Never use words**, because the game needs zero reading.
5. **Add a glint** (one white tone line) only if it's glass or ceramic.
6. Put it in a `<g class="o">` and check it next to `sheet.png` at 100% zoom. It should look like a sticker from the same sheet.
7. Keep it small. A prop is typically under 2 KB of SVG.

## 6. Rooms

- **Front-on dollhouse view.** The back wall is flat. The floor is below `WALL_Y` (about 2/3 down the canvas). Floor planks are horizontal tone lines whose spacing grows toward the viewer, with a few seam ticks aimed at a vanishing point near the top-centre. White dollhouse posts on the left and right edges have diagonal floor dividers.
- **Wall surfaces are patterns in tone colours**, with no ink lines inside: soft brick, tiles, wallpaper motifs.
- **Depth layers**: back wall furniture (shelves, fridge, counter), then a mid layer (an island or display case, with stools), then a foreground (a table on a round rug, a big potted plant). Characters stand between the layers.
- **Density is the point.** Every shelf is full: plants, jars, baskets, bottles, bowls, books, mugs, egg cartons, lanterns. Alternate tall and short items and vary the colours along a shelf. Add trailing hanging plants and bulb or pendant lamps from the ceiling. Leave the floor centre fairly open for play.
- Each room has one "story" prop (the cafe cat, a kid's drawing on the fridge, a picture-only menu board).

## 7. UI

- Big round buttons, at least 132px across at 2048 wide, in the corners only. A saturated fill (UI colours), a 12px white ring, a soft drop shadow (black at 16%), and a subtle darker lower half. Icons are white, solid and simple, with no outline and no text.
- The UI floats above the art. It never uses ink outlines, so it reads as a separate layer.

## 8. Dos and don'ts

**Do**
- Keep the outline uniform everywhere by using `class="o"`. It's the single strongest part of the look.
- Keep eyes tiny, solid and low-set. Keep noses and mouths tiny.
- Let patterns and accessories do the characterising.
- Reuse the helpers and palette names. Add new colours to `P` (and this table) only if a family is truly missing.
- Stay original. Invent designs; never trace or copy a reference, a brand, or a Toca asset.

**Don't**
- Use gradients, gloss, 3D shading, drop shadows on objects, or glow except lamps.
- Draw big anime eyes, white eye highlights, or visible irises.
- Use saturated primaries in the world, or pure black (#000) lines.
- Vary the line weight for "expressiveness", or leave shapes unlined, except as listed in section 1.
- Put text on props or signs, or any logos, brands or real-world IP (no Marvel or Disney: capes are towels, stars are generic).
- Draw realistic anatomy: elbows, fingers, knees, necks.
- Leave empty shelves.
