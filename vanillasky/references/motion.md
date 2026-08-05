# Motion — how to choreograph a scene

The factual surface — spring constants, easing names, every function in scope —
is [motion-api.md](motion-api.md), generated from source. This file is the part
you have to think about: what happens over time, and why.

Read it before writing a `custom_*` scene. Skim the phase grammar and the
reading-time rule even when you're only picking templates, because they decide
whether a scene's duration is right.

## The timebase

Three clocks, and mixing them up is the most common way a custom scene comes
out wrong.

| What you get | Units | Use it for |
|---|---|---|
| `progress` | 0→1 across the scene | Everything positional. Resolution- and duration-independent. |
| `sceneDuration` | seconds | Deciding whether there's *time* for a beat. `progress * sceneDuration` = seconds elapsed. |
| `beatIntensity` | 0→1 pulse | Accent hits only. Never drive layout from it — it isn't monotonic. |

At 30fps one frame is `1 / (30 * sceneDuration)` of progress. A 2.5s scene has
75 frames, so a "3-frame stagger" is 0.04 progress. Anything expressed in
frames has to be converted through `sceneDuration` or it silently changes
meaning when the scene length changes.

**Duration adapts, choreography doesn't scale.** A 1.5s scene and a 6s scene
cannot use the same normalized timings. At 1.5s an entrance over 0.3 progress
is 0.45s — fine. At 6s it's 1.8s — sluggish. Express entrances in seconds
(convert to progress via `sceneDuration`) and keep only holds in progress.

## Phase grammar

Every scene reads as five phases. The built-in text archetypes implement
exactly this — `ENTRANCE_START = 0.02`, with entrance and exit each capped at
`0.4` of the scene so a short scene can't spend its whole life animating.

| Phase | Typical share | What it's for |
|---|---|---|
| Anticipation | 0 → 0.02 | A beat of stillness. Starting on frame 0 reads as a jump cut into motion. |
| Entrance | 0.02 → 0.3 | Focal element arrives. Ease-**out** family, always. |
| Readable hold | 0.3 → 0.75 | **The point of the scene.** Nothing moves except ambient drift. |
| Emphasis | ~0.5, optional | One accent — a number landing, a word hitting. |
| Exit | 0.75 → 1 | Faster than the entrance. Usually just opacity. |

The hold is the phase that gets cut by accident. A scene that animates in, sits
for four frames and animates out has no hold — the viewer never reads it.

## Reading time is a hard constraint

`minDurationFor(archetype, text)` computes the real minimum from the copy, and
it isn't a guess — the implementation is per-archetype:

- **typewriter** — `chars × per-char-rate + 0.3 + exit`. Long copy gets long fast.
- **wordStagger** — `(words − 1) × 0.28 + 0.5 + hold + exit`.
- **heroWord** — `words × per-word-slot + exit`. Every word needs its own beat.

Two consequences. A nine-word line on `heroWord` needs roughly nine slots — put
it on `subtle` or `wordStagger`, or cut the copy. And when a template's
`preferredDuration` is shorter than the copy needs, the copy is wrong, not the
duration.

## One focal action per scene

Rank everything that moves:

- **Focal** — one per scene. The thing the viewer is meant to watch.
- **Supporting** — enters earlier or later than the focal element, never together, and moves less.
- **Ambient** — slow, continuous, never resolves: background drift, grain, a slow zoom. Should still be moving during the hold.

Two elements springing in simultaneously on the same curve is the signature of
a scene with no focal point. Stagger siblings; give the focal element the
strongest curve.

## Cuts

Scenes are cut together, so the last frame of one and the first of the next are
a pair.

- **Direction carries.** If a scene exits leftward, the next entering from the left reads as continuous; entering from the right reads as a bounce.
- **Don't land and immediately leave.** Settling at 0.7 leaves a 0.3 hold — fine. Settling at 0.95 means the cut eats the payoff.
- **Ambient motion shouldn't stop at the boundary.** A slow zoom ending exactly on the cut draws attention to the cut.
- **Match energy to the track.** `vanillasky tracks` reports each track's energy; a high-energy bed under scenes that all fade gently reads as a mismatch.

## The law of entrance vs exit

Enter on ease-**out** (decelerating — `outExpo`, `outCubic`, `outBack`, or a
spring). Exit on ease-**in** or a plain fade. An ease-in entrance always feels
wrong; if you want one, you want a different archetype.

## Text archetypes (scene-level `textArchetype`)

Six complete text lifecycles — entrance, hold and exit — picked by name on the
scene, never inside `variables`. The highest-leverage single choice on a
text-led scene. Unset falls back to `subtle`.

| Value | Use when | Roles | Canvas |
|---|---|---|---|
| `subtle` | Quiet fade for supporting captions — the visual is the star; the safe default over busy footage | body, closer | tight, open |
| `typewriter` | Char-by-char with a cursor — terminal/dev copy, or "typing the prompt" | hook, body | tight, open |
| `wordStagger` | Words land in order with active-word focus — rhythmic statements read in sequence | body | tight, open |
| `slam` | Squash-and-stretch impact with frame shake — punchy hooks (≤4 words) that must hit | hook, body | tight, open |
| `cinematic` | Trailer fly-in from depth, recedes on exit — dramatic brand statements | hook, body, closer | open only |
| `heroWord` | One oversized word per beat — ultra-short declarations where each word is a beat | hook, body, closer | open only |

A template's canvas is in its registry item (`meta.vanillasky.textCanvas`).
`open`-only archetypes look broken on `tight` canvases (cards, mockups).

## Scene archetypes

Name one in a comment at the top of custom source: `// archetype: stat-pop`.
Hybrids have no focal point and read flat.

| Archetype | Motion shape |
|---|---|
| `stat-pop` | Hero number counts up and POPs; everything else stays quiet |
| `word-cascade` | Title words drop in one at a time, each taking a slice of progress |
| `card-grid-stagger` | 1×N or 2×2 grid; cards spring in, staggered |
| `mockup-zoom` | Device chrome slides up and scales 130% → 100% |
| `reveal-slide` | Card fades + scales in; inner content word-by-word |
| `chart-draw` | Bar or ring draws from 0; label appears after |
| `text-slam` | Title hits hard (scale 1.8 → 1) and holds |
| `celebrate-burst` | Particles radiate from centre, staggered |
| `transformation` | Two states, one contrast, resolved by a wipe or a cut |

## Writing the scene

The full contract — exact signature, what's in scope, what's banned — is in
SKILL.md. What matters here is the shape:

```js
// archetype: stat-pop
function Component({ progress, width, height, sceneDuration, tokens }) {
  const dim = Math.min(width, height);
  const sec = (s) => s / sceneDuration;              // seconds → progress
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const seg = (a, b) => clamp((progress - a) / (b - a));

  // Entrance in SECONDS, so it doesn't stretch on a longer scene.
  const enter = spring(seg(0.02, 0.02 + sec(0.45)), SPRING_CRISP);
  // Hold: nothing moves. One emphasis lands mid-hold.
  const hit = punch(seg(0.5, 0.5 + sec(0.25)));
  // Exit is faster than the entrance, and only opacity.
  const out = 1 - seg(0.82, 1);

  return createElement("div", {
    style: {
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      // tokens, never literals — the frame around this body uses them too
      color: tokens.content,
      fontFamily: tokens.font,
      fontSize: dim * 0.18,
      opacity: enter * out,
      transform: `scale(${1 + 0.06 * hit})`,
    },
  }, "42%");
}
```

Three things that demonstrates: entrance expressed in seconds, a hold where
nothing moves, and colours from `tokens` rather than hardcoded hex.

## Checking it

A contact sheet catches overflow and unreadable type. It cannot catch velocity,
a mistimed hit, a dead hold, or motion fighting the cut. For a custom scene,
watch it move — `vanillasky studio <config>` plays it back, and the config
reloads live while you tune. Look for: does the entrance settle or overshoot
awkwardly; is there a hold long enough to read; does anything move during the
hold that shouldn't; does the exit collide with the next scene's entrance.
