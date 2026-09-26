# Attic — the retired isometric direction

The first art direction: risograph halftone, six inks, 2:1 isometric cutaway
rooms. Superseded 2026-09-19 by front elevation + the warm lamplight palette,
which reads closer to Toca Boca and puts the characters forward.

Kept because it works and because the hybrid (isometric geometry, warm
palette) is one import swap away if we ever want it back.

```bash
python3 tools/attic/render.py            # riso isometric, as it shipped
python3 tools/attic/render.py --warm     # isometric geometry, warm palette
```

`palette_riso.py` is a complete drop-in for `palette.py`: same names, riso
values. Every sprite renders in either without modification.
