# Motion — text archetypes, named curves, and scene archetypes

The text-archetype table applies to the default path (it's a config field);
everything below it is needed only on the top rungs of the escalation ladder —
ejected templates and primitive compositions. Built-in templates already carry
this.

## Text archetypes — the `textArchetype` scene field

Six complete text lifecycles (entrance + hold + exit), picked by name on the
scene (scene-level field, never inside `variables`). The implementation ships
inside every text-led item's dependency closure as
`src/lib/scene-templates/text-archetypes.ts` (a path within the registry item,
not a file in this repo). Unset or unknown values fall back to `subtle`.

| Value | Use when | Roles | Canvas |
|---|---|---|---|
| `subtle` | Quiet fade for supporting captions — the visual is the star; the safe default over busy footage | body, closer | tight, open |
| `typewriter` | Char-by-char reveal with blinking cursor — terminal/dev-flavored copy or "typing the prompt" moments | hook, body | tight, open |
| `wordStagger` | Words land one at a time with active-word focus — rhythmic multi-word statements meant to be read in order | body | tight, open |
| `slam` | Squash-and-stretch impact with frame shake — punchy short hooks (≤4 words) that must hit hard | hook, body | tight, open |
| `cinematic` | Trailer fly-in from depth that recedes on exit — dramatic brand statements | hook, body, closer | open only |
| `heroWord` | One oversized word per beat fills the frame — ultra-short declarations where each word is a beat | hook, body, closer | open only |

A template's canvas is in its registry item (`meta.vanillasky.textCanvas`);
`open`-only archetypes look broken on `tight` canvases (cards, mockups).

## Named curves

Every motion choice resolves to one of these. Do not reinvent values.

| Name | Curve | Use for |
|---|---|---|
| `CRISP_ENTER` | `Easing.bezier(0.16, 1, 0.3, 1)` | UI slide-ins, card reveals — tight, decelerates hard at the end |
| `EDITORIAL` | `Easing.bezier(0.45, 0, 0.55, 1)` | Calm holds, photo reveals, chart draws — balanced in-out |
| `POP` | `Easing.bezier(0.34, 1.56, 0.64, 1)` | Stat pops, number emphasis — small overshoot |
| `SNAPPY_SPRING` | `SPRING_SNAPPY` (stiffness ~180, damping ~12) | Card drops, grid reveals — bouncy, not floaty |
| `SOFT_REVEAL` | `SPRING_SMOOTH` (stiffness ~70, damping ~26) | Phone/mockup entrances, quotes — calm, no overshoot |
| `PUNCH` | `spring(t, { damping: 10, stiffness: 200 })` + stagger | Word cascades, text-slam entrances |
| `BOUNCY` | `SPRING_BOUNCY` | Playful bounces, emoji pops — **never** for main titles |

`Easing.bezier`, `spring`, and the `SPRING_*` presets live in the
`@vanillasky/animation-utils` registry item (`src/lib/react-animations/animation-utils.ts`).

## The motion vocabulary

The `@vanillasky/animation-utils` lib item carries the core curves —
`interpolate`, `spring`, `SPRING_SMOOTH` / `SPRING_SNAPPY` / `SPRING_BOUNCY` /
`SPRING_CRISP`, `Easing` (incl. `Easing.bezier`), `stagger`, `cubicBezier`.
Its full source is `files[0].content` of `registry/r/animation-utils.json`
(live: `https://vanillasky.ai/r/animation-utils.json`).

Colors and font stacks come from `@vanillasky/tokens` — resolve them there
rather than hardcoding, so a custom scene picks up the same brand tokens the
built-in templates do.

Every helper is pure, deterministic, progress-driven, and export-safe (no
`filter`, no transitions).

**Law of entrance vs exit:** enter on the ease-OUT family (everything above);
exit on the ease-IN family (reversed curve, or just fade out). An ease-in
entrance always feels wrong — if you want one, you want a different archetype.

## Archetypes — exactly one per scene

Name it in a comment at the top of ejected/custom source: `// archetype: stat-pop`.
Hybrids have no focal point and read flat.

| Archetype | Motion shape |
|---|---|
| `stat-pop` | Hero number counts up and POPs; rest of the scene stays quiet |
| `word-cascade` | Title words drop in one at a time on PUNCH, each taking a slice of progress |
| `card-grid-stagger` | 1×N or 2×2 grid; cards SNAPPY_SPRING in, staggered |
| `mockup-zoom` | Device chrome slides up and scales 130% → 100% on SOFT_REVEAL |
| `reveal-slide` | Card/quote fades + scales in (SOFT_REVEAL); inner content word-by-word |
| `chart-draw` | Bar/ring draws from 0 on EDITORIAL; label appears after |
| `text-slam` | Title hits hard (PUNCH, scale 1.8 → 1) and holds |
| `celebrate-burst` | Particles/emoji radiate outward from center, staggered |

Imitate the built-in template closest to your brief before inventing motion —
their choices are visually tuned.

## Hard constraints for any custom scene

- Inline styles only; no Tailwind, no external CSS, no CSS `filter`.
- Progress-driven: no `requestAnimationFrame`, no CSS transitions. Same
  `progress` + variables = same output (deterministic, no unseeded randomness).
- Size off `dim = Math.min(width, height)` — scenes render at both 1080x1920
  portrait and 1920x1080 landscape; keep critical text inside the middle 75%
  of the frame.
- Exits faster than entrances; stagger siblings by 3–6 frames; at most one
  hero-color element per frame.
