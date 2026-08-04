# Visual rules for custom scenes

The contract in SKILL.md says what a `custom_*` body may *do*. This says what
it should *look like*. Templates are already built to these rules — a custom
scene that ignores them will read as the odd one out in its own video.

## Typography

Video is watched on a phone at arm's length. Text must be far larger than web
UI text. Scale every size with `Math.min(width, height) / 1080`.

- Body **≥40px**, card labels **≥44px**, headlines **60–86px** at 1080p.
- Weight **600–700** for anything that must be read at a glance; thin weights
  vanish against motion. Lighter weights (300–500) are legitimate as a
  deliberate register, but only at display sizes — never for body copy.
- Letter-spacing `-0.3` to `-1` on display text; line-height 1.1 display,
  1.2–1.25 for labels. Max ~30 characters per line.
- Add `textShadow: "0 1px 6px rgba(0,0,0,0.35)"` over any gradient or footage.
- Fixed-width container? Use `fitTextSize(text, base, maxWidth)`. Never eyeball
  it — the export rasteriser shapes text a few percent wider than the preview,
  so anything tuned by eye can overflow on export but not in your frame check.
- Quote multi-word font names: `'DM Sans', sans-serif`. Unquoted multi-word
  names fall back to a system serif in some renderers.

## Orientation is a layout problem, not a scale problem

Sizing off the short edge keeps elements the right *size* in both frames. It
does nothing about *where they sit*. A composition that assumes portrait's tall
empty lower third will collide with its own subject in 16:9.

- Never hardcode a caption at a percentage that only works in one frame.
  Branch the layout: portrait stacks (subject above, copy below); landscape
  splits (subject in one column, copy in the other).
- Constrain content to a centred column on landscape — roughly
  `width * 0.72` — so lines don't run frame-wide and unreadable.
- Cap particle/emoji spread on landscape (~0.36–0.38 of width) or they trickle
  off the sides.
- **Render both orientations before claiming a scene supports both.** A frame
  check in one orientation says nothing about the other.

## Colour and light

- The frame already paints the brand background. Don't paint your own
  full-bleed backdrop — build *inside* the focal area.
- Derive a second colour with `shiftHue(accent, n)` rather than inventing one.
  Read tokens off `style.brandKit`; don't hardcode hexes that ignore the brand.
- Build glows with `glow()` and layer two or three at different sizes for
  depth. A large blurred `box-shadow` standing in for a bloom bands into a
  visible rectangle at scale.
- Writing a radial gradient by hand? Use `closest-side`. The default
  (farthest-corner) only reaches transparent at the box edge, so the shape of
  the element shows through the glow.
- Flattened element (an ellipse, a light band)? `radial-gradient(ellipse
  closest-side, …)`. A `circle` gradient in a non-square box collapses to the
  short side and renders as a dot.

## Composition

- Keep critical text inside the middle ~75% of the frame. Platform UI covers
  the top and bottom of a portrait feed and the lower edge of a landscape
  embed.
- Size containers to their content. A fixed height with less content in it
  reads as a mistake, not as space.
- Deriving a camera from a bounding box? Floor the modelled extent. As the
  content approaches zero size the fit divides by ~0 and explodes a tiny object
  to fill the frame.
- Spread scattered elements with a golden-angle spiral, not repeated random
  draws — random angles clump into visible arcs and rings.

## Motion

- Every value comes from `progress`. No timers, no `Math.random` — seed with
  `rand01`.
- Use `phase()` for beats and `staggerWindow()` for groups. A hand-written
  `start + i * step` silently pushes late items past 1.0, and they never
  animate at all.
- A scene has to keep giving for its whole duration. A burst that flies away by
  40% leaves the rest of the beat inert — recycle emitters on a phase offset so
  motion sustains.
- Interpolating across a cut? Keep it linear inside the scene. Easing within
  each scene changes velocity at the boundary and makes the seam visible.

## Before you ship a scene

- `--sheet` it and actually look. Every visual defect worth catching is
  invisible in the config and obvious in a contact sheet.
- Contact sheets are silent: they cannot show you an audio problem. Check the
  render's own warnings rather than trusting your eyes for sound.
