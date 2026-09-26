# Character rig contract

The contract between the art pipeline (P1.12, `tools/art/characters/`) and the runtime character rig (P1.10). Characters are **live SVG**: a parts rig assembled at runtime, recoloured with CSS custom properties and posed with transforms (why: `docs/STYLE.md` section 9).

| Piece | Where |
|---|---|
| Rig data (generated, don't edit) | `assets/characters/rig.json` (built by `python3 tools/build.py art`) |
| Sources | `tools/art/characters/`: `body.mjs` (body types, limbs), `faces.mjs`, `hair.mjs`, `wear.mjs`, `poses.mjs`, `cast.mjs`, `rig.mjs` (bundles the JSON) |
| Assembler + forward kinematics (pure, no DOM) | `src/engine/rig-svg.js` |
| Dev preview | `tools/rig-preview.html` (serve the repo, open `/tools/rig-preview.html`) |
| Contact sheet | `tools/art/contact-sheet/{poses,faces,outfits,room}.png` |
| Tests | `tests/unit/art-manifest.test.mjs` (every character × pose × expression renders; planted feet stay on the floor) |

## 1. Units and axes

- **Art units**, +y down. The character's local origin is the **feet anchor**: the ground point between the feet. One art unit = `rig.artScale` (0.7) world units. `svgWrap()` sizes the `<svg>` so 1 art unit = 0.7 CSS px, so on the stage 1 CSS px = 1 world unit (before the stage scale), like everything else.
- The outline is baked into `rig.css` for that size (`rig.inkWorld` = 3.15 world units). Insert `rig.css` once per document (a `<style>`), and scale characters only with CSS transforms (the depth scale 0.92–1.08, the drag lift 1.08): never by changing the SVG's `width`, or the lines get thinner or thicker than the room's.
- **L and R are SCREEN left and right.** A front-facing character's own right hand is `handL`.
- Limb angles are **outward-positive**: 0 hangs straight down, + swings the limb away from the body's centre line (up and out), − across the body. The same numbers mean the same thing on both sides, so symmetric poses are symmetric data.

## 2. Skeleton and pivots

`rig.bodies.<body>.skeleton` (art units): `hipY` (pelvis height), `hip` ([x, 0], hip joints at ±x from the pelvis), `thigh`, `shin`, `shoulder` ([x, y] relative to the pelvis), `upper`, `lower` (elbow → hand centre), `chin` (neck pivot relative to the pelvis), `headRy`, `handR`, `legR`, `armR`, `mouth` and `eyes` (head-centre space), `height`, `shadow`, `halfW`.

Body types: `kid5` (~5 years), `kid9` (~9), `adult` (grown-ups and grandparents). Proportions: `docs/STYLE.md` section 4.

**Frames** (each drawn fragment is a `<g data-f="<frame>" transform="matrix(...)">`):

| frame | pivot | parent | rotated by |
|---|---|---|---|
| `root` | pelvis, (0, hipY) | character origin | `pose.root` [dx, dy, deg] |
| `torso` | pelvis | root | `pose.torso` (lean) |
| `legUL`, `legUR` | hip joint | root | leg[0] (hip); scaled along y by leg[3] (thigh foreshortening) |
| `legLL`, `legLR` | knee | thigh | leg[1] (knee) |
| `footL`, `footR` | ankle | shin | leg[2]; `footL` is mirrored (art is authored for the right foot, toe to +x) |
| `armUL`, `armUR` | shoulder | torso | arm[0]; scaled along y by arm[3] |
| `armLL`, `armLR` | elbow | upper arm | arm[1] |
| `handL`, `handR` | hand centre | forearm | arm[2]; `handL` mirrored |
| `head` | head centre; tilts around the chin | torso | `pose.head` |
| `heldL`, `heldR` | hand centre, **upright** (not rotated with the hand) | | a `translate()` only |
| `shadow` | an ellipse at the feet (`cx` follows `anchors.feet`) | | |

`poseFrames(skeleton, pose)` returns `{frames, anchors}`: a matrix per frame and the anchors below. When `pose.ground` is true the root is shifted so the lowest ankle stays at standing height (feet on the floor).

**Anchors** (character local, art units): `feet` (the placement point for standing and walking), `seat` (just under the pelvis: put it on a chair's seat point), `back` (the underside of a lying body: put it on the bed), `handL`/`handR` (hold points), `mouth` (drop food here to eat), `head` (head centre: hats, thought bubbles). `pose.anchor` names which one the runtime aligns with the target (`feet`, `seat` or `back`).

## 3. Parts and draw order

Back to front, as `renderCharacter()` emits them:

1. `shadow` (not for lying poses)
2. `back` slot fragment `back` (a cape) in the torso frame
3. hair back (`data-p="hair-back"`) in the head frame, unless a worn hat `hides: ['top']` and the style's back is a top puff or bun
4. legs, L then R, each: skin limb layer, `bottom` slot leg layer, then the foot (the `shoes` fragment, or the bare foot). **Sitting (`pose.legsFront`) moves the legs to after step 6** so the knees cover the lap.
5. pelvis (skin), then the `bottom` slot `pelvis` fragment (waistband, shorts top, skirt)
6. torso (skin with neck), then `top` `torso`, `over` `torso` (apron), `back` `torso` (cape tie)
7. arms not listed in `pose.front`, L then R, each: skin limb layer, `top` arm layer (sleeve), the held item, the hand
8. head (`data-p="head"`): ears, head, nose, face slots `eyes`, `brows`, `mouth`, `extras`, facial hair, hair front, `face` slot accessory, `hat` slot
9. arms listed in `pose.front` (in front of the head: hands at the mouth, holding a cupcake up close)

**Limb layers** are 3 fragments each (`upper`, `lower`, `patch`): the upper capsule is fully outlined, the lower one has an open top, and the patch (fill only) covers the joint, so bends have no seam (`docs/STYLE.md` section 4). Anything new that wraps a limb (gloves, long socks) must follow the same pattern.

`rig.bodies.<body>` holds all fragments as SVG strings (strokes already scaled): `parts` (`torso`, `pelvis`, `arm`, `leg`, `hand`, `foot`, `ears`, `head`), `face` (atoms per slot, plus `nose` and `lashes`), `hair.<style>` (`front`, `back`, `backKind`), `facialHair`, and `wear.<piece>` (the fragments of every outfit piece for that body).

## 4. Wear slots and colours

| slot | fragments | starter pieces |
|---|---|---|
| `hat` | `head` | `beanie`, `chef-hat`, `crown`, `headband` |
| `face` | `head` | `glasses`, `hero-mask` |
| `top` | `torso`, `arm` | `tee-star`, `tee-stripe`, `cardigan` |
| `over` | `torso` | `apron` |
| `bottom` | `pelvis`, `leg` | `pants`, `leggings`, `shorts`, `skirt` |
| `shoes` | `foot` | `sneakers`, `boots` |
| `back` | `back`, `torso` | `towel-cape`, `hero-cape` |
| held L / R | an SVG string per hand (`opts.held`) | any prop: see below |

`rig.wear.<piece>` = `{slot, label, hides, colors}`. One piece per slot. A worn piece's `colors` are its defaults; the character's `colors` override them.

**Recolour** = CSS custom properties on the character's root `<g>` (set by `charVars()`; change them at runtime with `el.style.setProperty`). No `color-mix()` on Safari 16, so every shade is its own variable:

| variables | used by |
|---|---|
| `--skin --skin-sh` | skin, nose |
| `--hair --hair-sh` | hair, facial hair |
| `--sock` | bare feet / socks |
| `--top --top-sh --top-2` | the top (`-2` = print, stripes, placket) |
| `--bot --bot-sh` | the bottom |
| `--over --over-sh --over-2` | apron |
| `--back --back-sh --back-2` | cape |
| `--shoe --shoe-sh` | shoes |
| `--hat --hat-sh --hat-2` | hat |
| `--face --face-sh` | face accessory |

**Held items**: `renderCharacter(rig, spec, {held: {L: svg, R: svg}})` draws the SVG upright at that hand, *under* the mitten, so the hand overlaps it. The item's own origin goes on the hand centre: for a prop sprite that is `<image href=... x=-(anchor+grip)/artScale y=... width=size/artScale ...>` (props' `grip` is in `assets/art-manifest.json`; see `held()` in `tools/art/contact-sheet/index.html`). At runtime a held prop can also be its own element positioned at `anchors.handL/R` (world = feet position + anchor × artScale × depth scale).

## 5. Faces and expressions

A face is four slots, each showing one **atom**: `eyes` (`dot, wide, happy, content, closed, lid, sad, wink`), `brows` (`none, arch, angry, worried`), `mouth` (`smile, grin, laugh, oh, sing, frown, wobble, flat, small, tongue, yuck`), `extras` (`none, blush, tear, sweat, zzz, hearts, notes`). The nose is always on. Characters with `lashes: true` get lash flicks matching the eye atom; `blush: true` adds blush under any extras.

`rig.expressions`: name → `{eyes, brows, mouth, extras}`:

| expression | eyes | brows | mouth | extras |
|---|---|---|---|---|
| neutral | dot | – | smile | – |
| happy | dot | – | grin | – |
| laughing | happy | – | laugh | blush |
| surprised | wide | arch | oh | – |
| sad | sad | worried | wobble | tear |
| yum | content | – | tongue | blush |
| sleepy | closed | – | small | zzz |
| grumpy | lid | angry | frown | – |
| cheeky | wink | – | tongue | blush |
| singing | content | arch | sing | notes |
| wheee | happy | arch | laugh | blush |
| yuck | lid | worried | yuck | sweat |
| love | content | – | grin | hearts |

Switching expression = replacing the innerHTML of the four `[data-slot]` groups with `faceSlot(rig, spec, slot, atom)` (or pre-render all atoms once and toggle `display`). **Blink** = swap the `eyes` slot to `rig.blink` (`closed`) for about 120 ms every 3–6 s. An expression can also be an object that mixes atoms (`{eyes: 'wide', mouth: 'grin'}`).

## 6. Poses

`rig.poses.<name>` (data in `tools/art/characters/poses.mjs`):

```js
{ armL: [shoulder, elbow, wrist, upperScale?], armR: [...],
  legL: [hip, knee, ankle, thighScale?], legR: [...],
  torso: deg, head: deg, root: [dx, dy, deg],
  ground: true,            // keep the lowest ankle on the floor
  front: ['L', 'R'],       // arms drawn in front of the head
  legsFront: true,         // legs drawn over the body (sitting)
  anchor: 'feet' | 'seat' | 'back' }
```

| pose | notes |
|---|---|
| `stand` | arms slightly out, elbows soft |
| `wave`, `wave2` | the two frames of a wave (screen-right forearm up; alternate every ~300 ms) |
| `hold` | both hands together in front of the chest, drawn in front of the head layer |
| `hold-up` | both arms raised ("ta-da", showing something off) |
| `cheer` | arms up and out, a small hop (`ground: false`, `dy -14`) |
| `sing` | arms open wide |
| `sit` | thighs foreshortened to 0.3 (knees toward the viewer), shins down, hands on the knees; `anchor: 'seat'`, `legsFront` |
| `walk-a`, `walk-b` | the two walk frames: one leg planted, the other foreshortened and lifted; arms swing opposite; slight torso and head sway |
| `lie` | the whole body rotated −90° (head to screen left), `anchor: 'back'`; pair it with `sleepy` |

**Animating**: all pose data is numbers, so a tween interpolates the arrays (and `torso`, `head`, `root`) and applies `poseFrames()` each step with `setAttribute('transform', matrixAttr(m))` on the `[data-f]` groups: transforms only, no re-render. Booleans (`front`, `legsFront`) switch the draw order: re-render once at the target order, then tween (as `tools/rig-preview.html` does). Measured: re-posing 8 characters every frame costs about 1.2 ms of JS and holds 60 fps at a 5x CPU throttle.

Poses mix: e.g. `Object.assign({}, rig.poses.sit, {armR: [20, -96, 0]})` sits and holds a mug up (the contact sheet's grandpa).

## 7. Characters

A character spec (`rig.characters[]`, the starter cast in `tools/art/characters/cast.mjs`):

```js
{ id: 'girl9', body: 'kid9', skin: ['#A8714D', '#8C5A3B'],
  hair: { style: 'puff', color: ['#3A2A2C', '#55403F'] }, facialHair: 'mustache' | undefined,
  lashes: true, blush: false, sock: '#FFFFFF',
  wear: { top: 'tee-stripe', bottom: 'leggings', over: 'apron', shoes: 'sneakers', hat: 'headband' },
  colors: { shoe: '#FBF3E8', ... },   // slot variable overrides
  expr: 'happy' }                     // default expression
```

Starter cast: `girl9` (9-year-old, deep brown skin, curly puff, striped tee + apron), `boy5` (5-year-old, fair, copper tufts, star tee, shorts, towel cape), `grownup` (adult, darkest skin, curly bun, teal tee + butter apron, boots), `grandpa` (adult body, light skin, grey balding hair, mustache, glasses, sage cardigan). Hair styles: `puff, tufts, short, bob, pigtails, bald, bun`. P1.15 builds the 12-character cast and the Character Maker on the same spec (every field is a carousel).

## 8. API (`src/engine/rig-svg.js`)

- `renderCharacter(rig, spec, {pose, expr, blink, held, shadow, id})` → `{svg, anchors, frames, body}`; `svg` is a `<g class="o rig" style="--skin:...">` string.
- `svgWrap(rig, result, {viewBox, css, clip})` → a standalone `<svg>` (viewBox defaults to `bodyBox()`, `overflow: visible`).
- `poseFrames(skeleton, pose)` → `{frames, anchors}`; `matrixAttr(m)`, `applyMatrix(m, x, y)`.
- `charVars(rig, spec)`, `faceSlot(rig, spec, slot, atom)`, `resolveExpr(rig, expr, blink)`, `bodyBox(rig, body)`.

## 9. Extending

- **New pose**: add an entry to `poses.mjs`, rebuild, flip through it in the preview for every body (short kid limbs exaggerate differently from adult ones).
- **New expression**: a combination in `EXPRESSIONS` (`faces.mjs`), or a new atom in `faceAtoms()` (head-centre space from the face metrics, so it fits every body).
- **New outfit piece**: a `WEAR` entry (`wear.mjs`) with `slot`, `colors` and `gen(body)` returning its fragments from the body numbers; anything on a limb uses `limbLayer()`/`capsule()`.
- **New hair style**: `HAIR_STYLES` (`hair.mjs`), drawn around an 80 x 78 head (scaled per body).
- **New body type** (baby, dog): a `BODIES` entry with the same fields; anything non-humanoid (the dog) should get its own small rig rather than bend this one.
- Then run `python3 tools/build.py art precache` and `node --test tests/unit/art-manifest.test.mjs`.
