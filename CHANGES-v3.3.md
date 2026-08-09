# v3.3 — the wheel, perfected + True-to-game mode

Apply: copy over repo, commit, push. No migration.

## Wheel
- Labels now CURVE along the rim (SVG textPath), auto-flipped below the
  equator, truncated by real arc length — no more diagonal text.
- Spin is JS-driven with a friction curve (fast launch, long real-wheel
  decay, randomized 4.6–5.8s + landing point). Same feel as before, but
  the angle is now known every frame, which powers:
- The DRUM READOUT: a Price-is-Right perspective ticker beside the wheel
  showing the slice under the pointer big and lit, neighbors curving
  away, names flickering past in sync — the readability answer for the
  80-slice public wheel.
- The pointer physically kicks on every slice boundary
  (respects prefers-reduced-motion).

## True-to-game mode (🎮)
Third color mode beside Dark/Light: each theme's FULL game palette —
colored surfaces, not neutral + accent — with a second accent
(--accent2) feeding a two-color header gradient and section labels.
Highlights: Balatro's green felt with red AND blue, Portal's white
chamber with both portal colors, Cuphead's aged paper, Minecraft's
sunlit grass, Hollow Knight's lumafly blue, Undertale's void with SOUL
yellow + magic blue. All 12 verified: ink ≥8:1, accents ≥4.2:1.
