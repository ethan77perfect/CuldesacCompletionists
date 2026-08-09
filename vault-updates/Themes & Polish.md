---
type: feature
status: live
files: [src/lib/themes.js, src/components/ui.jsx]
---
# Themes & Polish

**What it does** — five game-inspired dark palettes, picked per device in Settings: House of Hades, Pale Court, Golden Berry, Junimo Grove, Aperture. Card hover lift, gradient header rule, themed scrollbars.

**How it works** — every UI color is a CSS variable; a theme = a var set applied to `<html>`. Semantic colors (difficulty scale, rarity tiers, member colors) stay fixed. Add a theme = add an entry in themes.js.

**Limitation** — all-dark on purpose; a true light theme means auditing charts/tiers.
