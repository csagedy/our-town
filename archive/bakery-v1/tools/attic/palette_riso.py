"""Art direction for Little Lantern Bakery.

EVERYTHING about how the game looks is decided here. The sprite and room
generators only ever refer to these names, never to raw hex. To re-skin the
whole game, change this file and re-run `python3 tools/build.py`.

Direction: RISOGRAPH. Six inks on warm cream paper, every fill broken into a
halftone dot screen, hairline navy linework, isometric cutaway rooms floating
on the bare paper. Warm starburst glows are the one light source -- the
"small light" the reference site is named for.

The discipline that makes riso look like riso: you may only use the six inks
below. No blends, no gradients, no midtones. Depth comes from overprint
(two inks on top of each other) and from dot density, never from a new colour.
"""

# ============================================================== the six inks

PAPER      = "#F3EDE0"   # the substrate. Everything sits on this.
PAPER_PALE = "#FAF6EC"
PAPER_DEEP = "#E7DFCD"

NAVY       = "#33467A"   # ink 1 -- linework, shadow, night
TEAL       = "#2E8C80"   # ink 2
CORAL      = "#E4705E"   # ink 3
YELLOW     = "#F2C34B"   # ink 4
PINK       = "#EBA0A8"   # ink 5 (fluorescent pink, the riso classic)
GREEN      = "#7FA956"   # ink 6

# overprints -- what you get when two inks land on the same spot. These are
# the ONLY legal extra colours.
NAVY_DEEP  = "#25325A"   # navy x navy
ORANGE     = "#EC9550"   # coral x yellow
TEAL_DEEP  = "#1F6B66"   # teal x navy
PLUM       = "#8A5F7E"   # coral x navy
OLIVE      = "#A8A24C"   # green x yellow
BERRY      = "#C4566E"   # coral x pink
SEA        = "#4E7E95"   # teal x navy (lighter)
MOSS       = "#5A8158"   # green x navy

# tints -- the same ink at a lower dot density. Used for large flat areas.
NAVY_PALE  = "#9BA8C6"
TEAL_PALE  = "#9BC6BE"
CORAL_PALE = "#F2AEA2"
YELLOW_PALE = "#F8DFA0"
PINK_PALE  = "#F5CDD1"
GREEN_PALE = "#BACF9E"

# ------------------------------------------------------- semantic aliases
# Sprite code refers to these, so a re-skin never touches a sprite file.

INK        = NAVY_DEEP     # outlines and the darkest value. Never pure black.
INK_SOFT   = NAVY          # secondary linework
INK_FAINT  = NAVY_PALE

WHITE      = PAPER_PALE
CREAM      = PAPER

# bake family
BUTTER     = YELLOW
CRUST      = ORANGE
CARAMEL    = CORAL
COCOA      = PLUM
COCOA_DARK = NAVY
DOUGH      = YELLOW_PALE
DOUGH_DEEP = "#EBCB84"

# fruit / sweet family
JAM        = CORAL
ROSE       = PINK
ROSE_DEEP  = BERRY
CHERRY     = CORAL
LEMON      = YELLOW
PUMPKIN    = ORANGE

# cool family
SAGE       = GREEN_PALE
GREEN_DEEP = MOSS
SKY        = TEAL_PALE
DUSK       = NAVY
GLOW       = YELLOW
GLOW_SOFT  = YELLOW_PALE
EMBER      = ORANGE

SHADOW_HEX = NAVY
SHADOW     = "rgba(51,70,122,0.16)"

# ------------------------------------------------------------ character tones
# Riso can't do naturalistic skin, and shouldn't try. These are ink tints --
# the whole cast reads as printed, and nobody is the "default" colour.
SKINS = {
    "a": (YELLOW_PALE, YELLOW),
    "b": (CORAL_PALE, CORAL),
    "c": (ORANGE, CORAL),
    "d": (PLUM, NAVY),
    "e": (TEAL_PALE, TEAL),
}

HAIRS = {
    "navy":   NAVY_DEEP,
    "teal":   TEAL_DEEP,
    "coral":  CORAL,
    "yellow": YELLOW,
    "pink":   PINK,
    "green":  MOSS,
    "plum":   PLUM,
    "pale":   NAVY_PALE,
}

CLOTHES = [CORAL, TEAL, YELLOW, NAVY, PINK, GREEN, ORANGE, PLUM, SEA, BERRY]

# ------------------------------------------------------------------- rooms
# (floor ink, left wall ink, right wall ink, accent)
ROOM_INK = {
    "kitchen":  (NAVY,   PAPER_PALE, PAPER_PALE, TEAL),
    "shop":     (YELLOW, PAPER_PALE, TEAL,       CORAL),
    "garden":   (TEAL,   GREEN_PALE, GREEN_PALE, CORAL),
    "upstairs": (NAVY,   NAVY,       NAVY,       YELLOW),
}

# ------------------------------------------------------------------- geometry
STROKE   = 1.6
STROKE_F = 1.0
RADIUS   = 4
WOBBLE   = 0.9

# ------------------------------------------------------------------- halftone
DOT_PITCH   = 4.0    # distance between dot centres, in SVG user units
DOT_MAX     = 1.55   # radius of a 100%-coverage dot
SCREEN_ANGLE = {     # each ink gets its own screen angle, like real riso
    NAVY: 45, NAVY_DEEP: 45, TEAL: 15, CORAL: 75, YELLOW: 0,
    PINK: 75, GREEN: 15, ORANGE: 75, PLUM: 45, TEAL_DEEP: 15,
}

GRAIN_ALPHA = 10

# --------------------------------------------------------------- isometric
# 2:1 isometric. One floor tile is TILE wide and TILE/2 tall on screen.
TILE   = 34.0
Z_UNIT = 19.0   # screen pixels per unit of height

# back-compat aliases used by sprite code
PAPER_WARM = PAPER_PALE
