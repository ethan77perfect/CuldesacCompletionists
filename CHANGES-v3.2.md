# v3.2 — light mode

Apply: copy over repo, commit, push. No migration.

Every theme now has a hand-tuned LIGHT variant — Dark/Light toggle in
Settings, above the theme list (per device, combines with surfaces).
Light palettes lean into each game's real identity: Hornet = crimson
on silk white, Jimbo = white card face, Inkwell = vintage cream,
Aperture = clinical white lab, Campfire = warm parchment.

Under the hood: mode-aware theme application, chart axes/grids read
live theme colors, rarity-tier and difficulty-dial text auto-darkens
on light backgrounds (--sem-darken + color-mix), softer light-mode
shadows, all 12 light palettes verified ≥4.5:1 accent contrast and
≥10:1 body-text contrast.
