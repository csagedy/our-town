# Bake-off B: flat vector (SVG)

- `mockup.png` / `mockup.svg`: the 2048x1536 cafe kitchen composite.
- `sheet.png` / `sheet.svg`: both characters in all 3 expressions and poses, plus the props.

## What's here

| File | Raw | gzip |
|---|---|---|
| svg/kitchen-bg.svg (counter, stove+oven, fridge, hood, shelves, window, chalkboard) | 25.3 KB | 6.0 KB |
| svg/zoe.svg (full rig, all 3 faces inside) | 9.4 KB | 2.8 KB |
| svg/ian.svg (full rig, all 3 faces inside) | 8.4 KB | 2.4 KB |
| svg/zoe-expressions.svg / ian-expressions.svg (preview sheets) | 22.6 / 19.2 KB | 3.1 / 2.6 KB |
| svg/prop-frying-pan.svg | 0.8 KB | 0.4 KB |
| svg/prop-tomato.svg | 0.7 KB | 0.4 KB |
| svg/prop-tomato-sliced.svg | 4.5 KB | 0.9 KB |
| svg/prop-cupcake.svg | 1.5 KB | 0.7 KB |
| svg/prop-mixing-bowl.svg | 1.5 KB | 0.6 KB |
| mockup.svg (whole scene) | 52.7 KB | 11.9 KB |
| mockup.png | 453 KB | n/a |

The whole scene is about 12 KB gzipped and stays sharp at any iPad resolution. A PNG of the same scene is about 450 KB.

## How it's made

- `build.mjs` is the source. I wrote every shape as SVG path data by hand in JS template strings. The script only assembles parts and writes the files. The one exception is the `scallop()` helper, which generates bumpy outlines for Zoe's curly hair. Run `node build.mjs` to rebuild, then `./render.sh mockup.svg mockup.png` to rasterize with headless Chrome.
- **Palette.** There is one shared palette (`C`) of about 12 colour families. Each family has a base, a shade (`Sh`) and a highlight (`Hi`), for example teal / tealSh / tealHi. The style uses no outlines. Form comes from one flat shade shape on the side away from the light (top-left), plus a highlight sliver or glint. A faint dot-grain pattern over the room adds a little texture. Every prop and the room come from the same families, so new assets match automatically.
- **Parts rig.** Each character is a `<g>` with separate named groups: `legs`, `body`, `arm-l-pivot`/`arm-r-pivot` (each holds one arm drawn hanging straight down from its shoulder at the origin, so a pose is just `rotate(deg)`), `head` (which rotates around the neck point), and inside the head `hair-back`, `headshape`, `face` and `hair-front`. Ian also has a `cape` layer behind his body. The feet sit at (0,0).
- **Expressions.** Each face (eyes, brows and mouth) is its own group: `zoe-face-happy|surprised|yum` and `ian-face-happy|surprised|grumpy`. The rig files contain all three faces, with the unused ones hidden by `display:none`. Swapping a face means toggling one attribute. There are no morphs.
- **Recolouring.** Character shapes don't store colours. They use classes (`skin`, `skin-sh`, `hair`, `top`, `acc`, `bottom`, `shoe`...) that read CSS custom properties (`--skin`, `--hair`, `--top`...) set on the character's root group. One rig plus a different set of variables gives a new NPC: skin tone, hair colour and outfit colour in about 10 lines, with no new art.
- **Holding things.** `handPos(def, side, angle)` returns the hand position for any arm angle. The mockup uses it to put the pan handle in Zoe's hand and the cupcake in Ian's. An arm can be drawn in front of or behind the head (`armLFront`).

## Honest assessment

**Strengths**
- Clean, bright, and readable at a glance. The room holds up at iPad size and the palette is cohesive. It is clearly a step above the archived riso/iso prototype.
- Tiny and resolution-independent. Hundreds of sprites would cost well under a megabyte. That is a real plus for an offline PWA precache.
- The parts system is exactly what Toca-style play needs: face swaps on tap, arms that rotate to grab things, and recolourable NPCs. It animates with transform only, which fits the performance rule.
- Every file is plain text, so changes are easy to make and review, including by an agent.

**Weaknesses**
- **Character appeal is "good kids'-app vector", not Toca Boca.** Toca's charm comes from quirkier silhouettes: odd head shapes, tiny noses, and more attitude in the proportions. My kids are cute but a bit symmetrical and stiff. The poses come only from rotating arms. The legs are straight tubes, there is no contrapposto, and there is no 3/4 turn. Getting more personality needs a hand-tuned silhouette pass, ideally with a human illustrator's eye.
- **Same-y risk at scale.** A small palette and one shading rule keep hundreds of sprites consistent, but they can also look generic. Distinctive details (patterns, hand-drawn wobble, texture) have to be added deliberately to each asset.
- **Authoring cost.** Writing paths in code is slow for organic shapes (hair, hands, cloth) and quick for geometric ones (cabinets, jars). Expect roughly 5–15 iterations per character. Props are cheap.
- **No perspective system.** The room is a flat front elevation. Floor tiles fake depth, but props on counters have no consistent vanishing point. Fine for Toca-style, but a limit.
- **Performance caveat.** Many complex SVG nodes in the DOM can be slow on old iPads. For the game, rasterize each sprite once to a canvas/bitmap at load time (or at build time to @2x PNG/WebP atlases) and keep the SVG as the source of truth. The rig would then be built from per-part bitmaps.
- Minor issues in the mockup: the oven glow shows through near Zoe's shoulder, the tomato slices on the board are partly hidden, and the small ground shadows are simple ellipses.
