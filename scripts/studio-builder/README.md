# Studio builder (one-time, already done)

These scripts built `public/studio/` from:
- a frame of the original BuzzBytes video (studio background, anchors removed: `plate.py`)
- the Gemini character sets (base / eh / ah / laugh / blink per anchor): `align.py` lines up the edits,
  `cut.py` removes the background, `build2.py` places the anchors and writes the mouth/blink sprites.

You only need these again if you change the anchors or the studio.
