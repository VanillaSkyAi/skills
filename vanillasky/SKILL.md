---
name: vanillasky
description: "Make finished social videos (MP4, vertical 9:16 or landscape 16:9 — your choice) from a prompt: launch videos, milestone posts, product updates, customer reviews. Includes curated scene templates, music tracks, and motion/composition rules. Renders via local Chrome or a zero-install browser link."
---

# VanillaSky — finished social videos from a config

A video is a `VideoConfig` JSON: an ordered list of scenes, each referencing a
scene template by camelCase id with variables. You compose the JSON; the
`vanillasky` CLI validates and renders it deterministically (same config =
same MP4). You never write animation code for the default path — templates
carry the motion.

## The catalog is live — never guess

Template ids, variables, durations, and use-when guidance live in the live
index: **https://vanillasky.ai/llms-components.txt** (working from a repo
checkout: `registry/llms-components.txt`, or the `registry/` directory of the
standalone bundle). Read it before composing. It also catalogues the
the shared libs you compose custom scenes from.
Full per-item detail — source, complete variable schema, defaults — is at
`https://vanillasky.ai/r/<name>.json` (repo and standalone bundle:
`registry/r/<name>.json`).

**Offline rule:** if the index is unreachable and no local copy exists, say so
and stop. Never invent template names or variables — a stale guess renders a
broken scene, and the validator will reject ids/variables it doesn't know.
The standalone bundle ships the full snapshot in its `registry/` directory;
its `registry/r/<id>.json` files are the offline equivalent of
`npx shadcn add @vanillasky/<id>` — everything the network path provides,
including template source for ejecting.

## Staying current

`vanillasky update` pulls the latest release into this install: fast-forwards
the checkout, reinstalls dependencies when they moved, and re-copies the agent
skill (`~/.claude/skills/vanillasky` is a plain copy that tracks nothing, so it
is the part that silently goes stale — a CLI with flags its own documentation
doesn't mention). `vanillasky update --check` reports without changing
anything. If a flag documented here doesn't exist in your CLI, you are on an
older release; that is the command to run.

## First run

Before the first video in a session, run `vanillasky setup --check` — it
prints the current state (config, Pexels key, default orientation, music
mood, DESIGN.md) without prompting. If the Pexels key is missing, mention
once that stock footage needs a free key from pexels.com/api (set
`PEXELS_API_KEY` or run `vanillasky setup`), then move on. If the repo has
no DESIGN.md and the video is for this repo's product, offer to generate
one via `vanillasky setup`. Do not block on any of it — a missing key
falls back to brand gradients and a missing DESIGN.md just means no
auto-branding.

## Brief intake

Derive first, ask only the gaps — never ask what the prompt, repo, or
DESIGN.md already answers; max 3 questions per video; a complete brief gets
zero questions.

The three gap questions, each asked only when the material genuinely
doesn't answer it:

1. **Goal → format** — what should the viewer do or feel after watching?
   (Launch hype, milestone, review, update — this picks the format and the
   closer.)
2. **Audience + proof** — who is it for, and what is the one concrete,
   provable thing to show (a real number, quote, or screenshot)? The
   anti-boring gates need real material; never invent it.
3. **Assets** — any screenshots, logos, clips, or URLs to include?

**Orientation** is a derive-or-ask item too: derive it from the target
platform when the brief names one (TikTok/Reels/Shorts → portrait 9:16; a
YouTube video or a landscape X/LinkedIn post → landscape 16:9), or from the
default orientation in `setup --check`. When neither answers it, spend one
of the ≤3 questions on it or default to portrait and say so when delivering.
Both orientations are first-class — every template renders at 1080x1920 and
1920x1080.

Persist the answers to `video-brief.md` beside the config, and on
iteration re-read it instead of re-asking. Update it when new answers
change the brief.

## Workflow

1. **Compose** `video.json` — slot contract below, templates from the index.
2. **Validate**: `vanillasky validate video.json --format launch` — fix every
   error before rendering.
3. **Inspect before any full render** (cheap, ~2s/frame):
   - `vanillasky render video.json --frame 1.2 --out check.png` — one frame
     (pick a mid-scene time; scene boundaries catch transition blends)
   - `vanillasky render video.json --sheet --out ./sheet` — 5 PNGs per scene
     plus a composited `sheet.png`
   Actually look at the images: text overflow, template-default-looking values
   you forgot to set, unreadable sizes, critical text outside the middle 75%
   of the frame (platform UI covers the edges — top/bottom of a portrait
   feed, player controls on a landscape embed).
4. **Full render**: `vanillasky render video.json` → `./video.mp4`. Watch it.
5. **Deliver**: open the finished video for the user — pass `--open` on the
   render, or use the platform opener (macOS `open video.mp4`, Linux
   `xdg-open video.mp4`) — and include BOTH links from the render's completion
   block in your delivery message: "Watch in browser" (zero-install playback
   for anyone without local Chrome) and "Open in Studio" (iteration on the
   exact rendered config). `vanillasky link video.json` reprints them on
   demand.

   Nothing here talks to a server: the links carry the config in the URL
   fragment, and the render itself is entirely local. The one limit is size —
   media inlined as a `data:` URL (a base64 screenshot or logo) makes the
   fragment far too long to be a URL, and the CLI then prints no links and
   says why. **Prefer a real https URL or a local file path for media over
   embedding base64**, and the links keep working.

   **`vanillasky studio video.json` is how you hand off.** It opens the bundled
   editor — scene list, per-scene variables, template swap, motion, live
   preview — served from localhost, saving straight back to the file. From
   there the user edits and presses **Export MP4**, which runs this same
   renderer and writes `video.mp4` next to the config — and opens it when it's
   done.

   It opens in whatever browser the OS has registered for `http://`, which is
   not always the one the user is looking at: a machine whose default is Arc
   while the user works in Chrome opens the Studio somewhere they never see,
   and the report you get is "it didn't open". Pass
   `--browser "Google Chrome"` (a macOS app name; an executable elsewhere), or
   persist it as `"browser"` in `~/.vanillasky/config.json`. `setup --check`
   shows which it will use.

   Two things this changes for you:
   - **A full render is no longer a precondition for delivering.** The preview
     is instant; a render is 25s. Compose, inspect with `--sheet`, open the
     Studio, and let the user look. Render yourself only when they ask for the
     file or there's no browser (CI, remote shell).
   - **Keep editing the config while they watch.** The Studio follows the file
     live, so when the user asks you for a change, write it and it appears in
     their preview. If they have unsaved edits of their own, your write is
     surfaced as a conflict rather than silently overwriting them.

**Never deliver an uninspected video.** The frame/sheet step is mandatory, not
optional — validation catches schema errors, only your eyes catch a bad frame.

Four things your eyes cannot catch on a contact sheet, so check them explicitly:
- **Audio.** Contact sheets are silent. The renderer warns if the muxed audio
  stops before the video ends — read its output rather than assuming.
- **The other orientation.** A portrait frame check says nothing about
  landscape. If a config declares one and you claim both work, render both.
- **Footage judder.** Every frame can be correct while the motion between them
  stutters — see "Match the render fps to the footage" below. Still frames can
  never show this; compare the clip's fps against the render fps instead.
- **Total length.** The render banner prints it (`5 scene(s), 17.5s`). If it
  doesn't match the durations you set, a timing field didn't apply.

## Config skeleton

```json
{
  "format": "launch",
  "orientation": "portrait",
  "style": {
    "font": "Inter",
    "preset": "bold",
    "brandKit": { "accent": "#6D5EF8", "secondary": "#F8B45E" }
  },
  "scenes": [
    { "id": "s0", "templateId": "media", "variables": { "texts": "Ship it today" }, "timing": {} }
  ]
}
```

**`brandKit` lives inside `style`.** A top-level `brandKit` is not read — the
brand silently never applies and you find out by looking at a rendered frame.
The validator now errors on it, but the nesting is the thing to remember.

`orientation` picks the frame: `"portrait"` (9:16, 1080x1920) or
`"landscape"` (16:9, 1920x1080). Both are first-class — every template is
responsive to either — and a config that omits it renders portrait.

`style.preset` picks the frame-level look — background family, headline type
treatment, and default title placement, moved together by one token. It's the
main lever against every video looking the same, so **choose one deliberately
per video** from the preset table in the index rather than leaving it unset by
habit. Set it once on `style`, never per scene; unset resolves to the default,
which is the original look. The validator rejects an unknown name instead of
letting it silently fall back.

`style` is required by the renderer — the validator warns when it's missing
and `vanillasky render` injects a minimal default (`{ "font": "Inter" }`), but
a config shared via `vanillasky link` gets no such safety net, so always set
it explicitly.

`textArchetype` and `backgroundEffect` are scene-level fields, NOT entries in
`variables` — the validator rejects them inside `variables`. The six
`textArchetype` values (`subtle`, `typewriter`, `wordStagger`, `slam`,
`cinematic`, `heroWord`) are documented with use-when guidance in
[references/motion.md](references/motion.md).

`backgroundEffect` is one of exactly nine values — `static`, `slow-zoom-in`,
`slow-zoom-out`, `ken-burns`, `drift`, `pulse`, `breathe`, `slow-tilt`,
`camera-shake` — and only templates whose registry item sets
`usesGlobalBackgroundEffect` consume it. Setting it on a template that ignores
it is an error, not a silent no-op.

**Scene duration is `timing.startTime` + `timing.endTime`, in seconds.**
There is no `timing.duration` — a config that sets one gets the template's
`preferredDuration` instead, and the only symptom is a video that isn't the
length you asked for. Set both fields, and make them contiguous across scenes
(scene N's `endTime` is scene N+1's `startTime`); `timing: {}` falls back to
`preferredDuration`. A whole-video length check after rendering (`17.5s` in the
render banner) is the cheapest way to catch a timing field that didn't apply.

A Pexels key is worth setting up front: it powers both `mediaKeyword`
resolution here AND stock search inside `vanillasky studio`, so without one the
user's media picker is empty. It's free at pexels.com/api.

`mediaKeyword` resolves to stock footage automatically when `PEXELS_API_KEY`
is set (free at pexels.com/api; env var, or `~/.vanillasky/config.json`
`{ "pexelsApiKey": "..." }` — env wins; `--no-pexels` opts out). Without a
key, set a direct `mediaUrl` or the scene falls back to its brand gradient
(the validator warns about this).

**Keyword resolution is not deterministic.** Every render re-queries Pexels and
can return a different clip, so "same config = same MP4" holds only once the
resolved URL is in the config. The render log prints what it picked — paste
those URLs into `mediaUrl` before you share or re-render a config you're happy
with. While you're there, prefer the 1080x1920 (portrait) or 1920x1080
(landscape) rendition: the picker often lands on a 720p file that then gets
upscaled to the render size.

### Match the render fps to the footage

Stock footage is frequently **25fps** while `render` defaults to **30fps**.
That ratio isn't an integer, so one output frame in six is a duplicate and the
footage visibly stutters — the video reads as cheap without any single frame
looking wrong, and a contact sheet cannot show it. Check the clip
(`ffprobe -show_entries stream=r_frame_rate <url>`) and either pick a rendition
whose fps divides the render rate, or render at the footage rate:
`vanillasky render video.json --fps 25`. The Studio's **Export MP4** takes the
same flag — `vanillasky studio video.json --fps 25` — and defaults to 30 like
`render` does, so a config that needs 25 needs it on both commands. 25fps is a
standard delivery rate and every social platform accepts it. Mixing 25fps and
30fps clips in one video means one of them will judder whatever you choose —
prefer a consistent set.

## Audio

Silence is allowed but discouraged for social — a beat under the cut is most
of the perceived production value. Pick a bundled track whose mood/energy
matches the brief: `vanillasky tracks` lists the library (ids, moods, energy,
durations, descriptions), then reference it as
`"audio": { "trackId": "<id>" }`. Prefer high-energy tracks for launches and
hype moments, calmer ones for review/update formats, and a track at least as
long as the video (shorter tracks loop). `audio.audioUrl` also works with a
direct https URL or a local file path.

## DESIGN.md

Repos that carry a [DESIGN.md](https://github.com/google-labs-code/design.md)
get on-brand videos automatically: `render` and `validate` walk up from the
config file's directory to the repo root and merge its front-matter tokens
into the config — `colors.primary` → `brandKit.accent`, `colors.secondary` →
`secondary`, `colors.background`/`surface` → `bg`, first typography
`fontFamily` → `style.font`. Config-explicit values always win, so override a
token by setting it in the config; skip ingestion entirely with
`--no-design-md`. `vanillasky brand` shows what would be applied.

The cwd is only a fallback: it applies only when the config's own directory
tree has no DESIGN.md AND the config declares no `brandKit` of its own, and
the CLI calls it out loudly — so an unrelated repo's brand never silently
bleeds into a branded config.

Tradeoff: `colors.background`/`surface` → `brandKit.bg` collapses gradient-led
templates to a flat brand backdrop — prefer omitting `background`/`surface`
from DESIGN.md (or leaving `bg` unset) when scenes should keep their generated
brand gradients. **This is a property of `brandKit.bg` itself, not of DESIGN.md
ingestion:** setting `bg` by hand flattens every scene in the video the same
way. Set `accent` and `secondary` and let the preset generate the background;
reach for `bg` only when a flat backdrop is the intent.

## Slot contract (formats)

Four formats ship. Declare one with `"format": "<id>"` and the validator
enforces its slot contract mechanically. Pick by what the video IS, not by
which is most familiar — they differ in body roles, scene budget and hook bans:

| Format | Use for | Bodies cover | Scenes |
|---|---|---|---|
| `launch` | A product or feature going live | framing, comprehension, proof | 3–8, default 5 |
| `review` | A real customer quote | the quote, who said it, what changed | 4–7, default 5 |
| `milestone` | A number worth celebrating | the number, the context, the thanks | 3–6, default 4 |
| `update` | A changelog / shipped-something post | what changed, what it looks like, why it matters | 4–7, default 5 |

`review` additionally bans `testimonial` and `reviewStack` as the hook, and
`milestone` bans `milestone` and `bigNumber` — opening on the payoff spends it
in the first two seconds and leaves the bodies nothing to reveal. `milestone`
is deliberately the shortest: it outstays its welcome faster than a launch.

Exact bounds, banned hook templates and the category map are in
[references/formats.md](references/formats.md), generated from the same
definitions the validator uses. The judgment part is the body roles — and the
closer is always the address (brand / URL / action).

## Anti-boring rules (hard negatives)

- Never invent numbers, names, quotes, or stats. `{needs stat/quote/screenshot}`
  gates mean the input must contain the material. Never ship template defaults
  like `1000`, `10K`, `99.9%`, `<50ms` — if the exact value isn't in the input,
  use a different template.
- Banned staccato copy: `[brand, category, noun]`, three category words, three
  verbs. Three synonyms is not rhythm; staccato must carry tension and a twist.
- Never close on `ctaMedia` by reflex — prefer `ctaLogo` when a real logo
  exists or 2+ scenes already ran full-frame footage.
- No numbers in the closer. If a body already proved the stat, the closer
  stamping it again reads as boring, not emphatic.
- Never place same-template or same-category scenes adjacent (`media` is exempt
  only for multiple distinct user-provided assets). Category is not guessable
  from a template's name — `beforeAfter` and `cardList` are both `explainer`.
  The category column in the index is the only source; check it before ordering
  scenes rather than discovering the clash at validate time.
- A `media` scene without a `backgroundEffect` is a static stock photo, not a
  scene — and don't repeat one effect across every footage scene; vary it.
- Give footage scenes at least 3s. `media`'s 2s `preferredDuration` is a floor
  for a bridge beat, not a shot: at 2s a clip registers as a flash, and pairing
  it with a moving `backgroundEffect` and staggered text makes the cut read as
  rushed even though nothing is technically wrong.
- `ctaLogo`'s `cta` renders ONLY when `url` is empty. Setting both ships the
  CTA as dead config that never appears on screen — pick one: the URL as the
  address, or `cta` for a "Coming soon" / "Available now" stamp.
- Card templates silently drop items that don't fit their duration —
  `cardList` at its 3.5s preferred shows three. Count what actually appears in
  the contact sheet rather than assuming every item you wrote made it in.
- Never ship a gradient-only scene when the template has a `mediaKeyword`
  slot; `mediaKeyword` must be a standalone English noun, never derived from
  the copy text.
- Don't let `notification` / `incomingCall` / `tweet` / `bigNumber` /
  `milestone` be the only explanatory body — they frame or prove; they don't
  explain the product.
- Never put a portrait screenshot in `webMockup` or a landscape one in
  `phoneMockup`; never synthesize a `terminal` / `codeEditor` when a real
  screenshot of the same surface exists; never leave a provided screenshot
  unused.
- Don't make every body a card — at least two bodies should be non-card-led
  registers. Copy limits: hook ≤7 words, CTA ≤4 (command verbs only), and at
  least one body must name concrete category/audience/outcome nouns.

## Escalation ladder

Escalate only when the previous rung genuinely can't express the brief:

1. **Template as-is** — defaults plus your copy.
2. **Adjust variables** — the full schema with types, options, and defaults is
   in the per-item JSON (`registry/r/<id>.json`, `meta.vanillasky.variableSchema`).
3. **Eject** — write your own scene body as `componentSource` on a scene whose
   `templateId` starts `custom_`. **Record where it came from** in
   `scene.origin` (`{ item, version, sourceHash, ejectedAt }`) — that's what
   makes `vanillasky diff <config>` able to tell the user later that the item
   they started from has changed upstream. An ejected scene without it is an
   anonymous blob nobody can maintain. Read the registry item's source
   (`files[0].content`) as the reference for how the built-in does it, then
   write a body that satisfies the contract below. Ejected scenes travel
   inside the config and render everywhere, including the browser link.
4. **Compose from what's in scope** — same mechanism as rung 3, but instead of
   writing every element yourself, reach for the scene components already in
   the sandbox (`CountUpNumber`, `TweetCard`, `PhoneFrame`, …). `vanillasky
   scope` prints the exact list with call shapes. These are not a catalog
   layer and are not installable: **most take the whole frame**, so use one
   per scene and build the rest around it. If you want two things side by
   side, lay them out yourself.

### The custom-scene contract (rungs 3 and 4)

Both upper rungs produce the same thing: a `componentSource` string. It is
**not** a module — it's a body compiled in a sandbox with every helper already
in lexical scope.

- **Exactly one `function Component({ ... })`**, destructuring from this prop
  set — all of it is passed on every frame:

  | Prop | What it is |
  |---|---|
  | `progress` | 0→1 across the scene. Drive everything positional off this. |
  | `width`, `height` | 1080x1920 portrait or 1920x1080 landscape. Size off `Math.min(width, height)`. |
  | `sceneDuration` | Seconds. Convert any seconds-based timing to progress with it. |
  | `beatIntensity` | 0→1 pulse for accent hits. Never drive layout from it. |
  | `safeZone` | Platform-aware inset in px — keep critical text inside it. |
  | `tokens` | **Brand tokens already resolved** — `accent`, `secondary`, `surface`, `surface_elevated`, `content`, `muted`, `font`, `script_font`. |
  | `style`, `variables` | The raw config, if you need something tokens doesn't cover. |

  **Use `tokens`, not hardcoded colors or font stacks.** The frame around your
  body is drawing from the same values; a body that hardcodes white and a
  drop-shadow looks generic next to a frame that's on-brand. Built-in templates
  call `resolveTokens(style)` — custom source can't import, which is exactly why
  this arrives as a prop.

  The registry item's source exports a *named* template (`ChartCounterTemplate`,
  not `Component`) with imports and TypeScript types — it will not work
  verbatim. Reshape it.
- **No `import`, no `export`.** Every helper is already a global: React
  (`createElement`, `useMemo`, …), the motion vocabulary (`interpolate`,
  `spring`, `Easing`, `EASE`, `phase`, `punch`, `cascade`, `typewriter`,
  `countUp`, `particles`, `burst`, …), color helpers (`withOpacity`,
  `shiftHue`, `autoTextColor`), text helpers (`fitTextSize`, `TemplateText`),
  and **every primitive by its component name** (`CountUpNumber`, `TweetCard`,
  `PhoneFrame`, …). `vanillasky scope` prints the exact list with the call shape and use-when
  for each — read it before hand-rolling motion, since the helper you are
  about to write probably already exists.
- **Body-only.** The brand gradient, the main title, and the safe zones are
  rendered by the frame *around* your body — don't paint a background or
  repeat the title. `gradientBackground`, `TitleTop`, and `TitleCenter` are
  deliberately not in scope.
- **Deterministic and export-safe**: no `Math.random`, `Date.now`,
  `setTimeout`, or `requestAnimationFrame`; no `className` (inline `style`
  only); no CSS `filter`. Drive everything off `progress`.
- 16,000 characters max.

`vanillasky validate` enforces all of this, so a custom scene fails loudly and
specifically instead of rendering blank.

`npx shadcn add @vanillasky/<id>` installs an item's source into a React
project that has mapped the namespace in `components.json` (see the index
header). That's for building your own app around these components — it does
**not** change what the `vanillasky` CLI renders. To change a scene here, use
`componentSource`.

## References

- [references/formats.md](references/formats.md) — the slot contract as data
- [references/motion.md](references/motion.md) — how to choreograph a scene:
  the timebase, phase grammar, reading-time constraints, focal hierarchy and
  cut continuity. **Read this before writing a custom scene** — it's the
  difference between video motion and a web animation rendered to MP4.
- [references/motion-api.md](references/motion-api.md) — the spring constants,
  easing names and every function in scope, generated from source
- [references/visual-rules.md](references/visual-rules.md) — how a custom scene
  should look: type sizes, orientation layout, colour and glow, composition.
  Read before writing a `custom_*` body; templates already follow these, so a
  scene that ignores them reads as the odd one out in its own video.
