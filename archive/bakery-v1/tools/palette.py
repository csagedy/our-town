"""ALTERNATE ART DIRECTION -- "warm lamplight", front elevation.

This is the direction I had before the reference screenshots arrived. It is a
complete drop-in replacement for palette.py: same names, different values, so
every existing sprite renders in it unchanged. tools/preview_warm.py swaps it
in via sys.modules.

Direction: late-afternoon light through a shop window. Soft organic shapes,
flat fills with one gentle highlight, no hard black, no harsh saturation,
a little paper grain over everything. Rooms are seen head-on and sliced open,
the way a dollhouse is -- which is the Toca Boca reading.
"""

# ---------------------------------------------------------------- core

INK        = "#3F332C"   # darkest value in the game. Never pure black.
INK_SOFT   = "#6B5A4E"
INK_FAINT  = "#A89687"

PAPER      = "#F6EDDF"
PAPER_PALE = "#FBF4E8"
PAPER_WARM = "#FBF4E8"
PAPER_DEEP = "#E8DAC5"

# warm / bake family
BUTTER     = "#F3C97C"
CRUST      = "#DDA061"
CARAMEL    = "#BE7A45"
COCOA      = "#7A4F35"
COCOA_DARK = "#5A3927"
DOUGH      = "#F0DDBC"
DOUGH_DEEP = "#DFC69C"

# fruit / sweet
JAM        = "#C2606C"
BERRY      = "#8E5A86"
ROSE       = "#EBA9AB"
ROSE_DEEP  = "#D98C90"
CHERRY     = "#C4524F"
LEMON      = "#F0D877"
PUMPKIN    = "#E39154"
PINK       = "#EBA9AB"

# cool
SAGE       = "#93AC8C"
GREEN      = "#62815E"
GREEN_DEEP = "#47603F"
MOSS       = "#5A7A52"
SKY        = "#AFCADA"
SEA        = "#7FA3B8"
DUSK       = "#52657C"
NAVY       = "#52657C"
NAVY_DEEP  = "#3A4A5C"
NAVY_PALE  = "#A9BCC9"
PLUM       = "#7C5C7A"
TEAL       = "#6E9A99"
TEAL_DEEP  = "#4E7574"
TEAL_PALE  = "#A9C6C5"
ORANGE     = "#E39154"
OLIVE      = "#A8A24C"
YELLOW     = "#F3C97C"
YELLOW_PALE = "#F8E3B4"
CORAL      = "#E08A70"
CORAL_PALE = "#F0B7A3"
PINK_PALE  = "#F5D2D3"
GREEN_PALE = "#BCCFB6"

# light
GLOW       = "#FFD9A2"
GLOW_SOFT  = "#FFE9C6"
EMBER      = "#F0A15C"

WHITE      = "#FFFDF8"
CREAM      = "#F7EBD6"

SHADOW_HEX = "#3F332C"
SHADOW     = "rgba(63,51,44,0.14)"

# ----------------------------------------------------------- characters
# Naturalistic here, unlike the riso version -- the warm palette can carry it.
SKINS = {
    "a": ("#F2D3B6", "#E0B694"),
    "b": ("#E7BC92", "#D19E71"),
    "c": ("#C98F62", "#B0764B"),
    "d": ("#8D5A3B", "#734427"),
    "e": ("#5E3A26", "#472A1A"),
}

HAIRS = {
    "navy":   "#2E2723",
    "teal":   "#4E7574",
    "coral":  "#8A452A",
    "yellow": "#DFB369",
    "pink":   "#D98CA6",
    "green":  "#5A7A52",
    "plum":   "#7C5C7A",
    "pale":   "#C9BFB2",
    "black":  "#2E2723",
    "brown":  "#5C3B25",
}

CLOTHES = [JAM, SAGE, SKY, BUTTER, PLUM, TEAL, PUMPKIN, DUSK, ROSE, GREEN]

# --------------------------------------------------------------- rooms
# (back wall, wall trim, floor, accent)
ROOM_WARM = {
    "kitchen":  ("#EFE2CE", "#DCC9AD", "#C99A6A", TEAL),
    "shop":     ("#F5E6D2", "#E3CBA9", "#B9814F", JAM),
    "garden":   ("#CFE0DF", "#A8C6D8", "#8FA982", PUMPKIN),
    "upstairs": ("#E4DCE6", "#C7BBCD", "#A2795A", GLOW),
}

# ------------------------------------------------------------- geometry
STROKE   = 2.0
STROKE_F = 1.2
RADIUS   = 6
WOBBLE   = 1.05

GRAIN_ALPHA = 14

# halftone is not part of this direction, but iso.py imports these names
DOT_PITCH = 4.0
DOT_MAX = 1.55
SCREEN_ANGLE = {}
TILE = 62.0
Z_UNIT = 36.0
