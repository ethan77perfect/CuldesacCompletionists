---
type: feature
status: live
files: [src/lib/themes.js, src/components/ui.jsx, src/App.jsx]
---
# Themes & Surfaces

**What it does** — 12 game-inspired dark palettes × 3 surfaces (Solid / Glass / Neon), picked per device in Settings. Glass = frosted panels via backdrop-blur over an ambient accent glow; Neon = accent halo.

**How it works** — every UI color is a CSS variable; a theme is a var set applied to `<html>`. Surfaces are CSS rules keyed off `data-surface` on `<html>`, targeting the `.panel` class. Add a theme = one entry in themes.js; add a surface = one CSS block + one SURFACES entry.

**Naming note** — the original navy+gold is "Campfire · Outer Wilds" (default); "House of Hades" is now actually red.

## Tweak ideas
- [ ] More surfaces: scanlines/CRT, paper grain
- [ ] A true light theme (requires auditing charts + rarity tier colors)
