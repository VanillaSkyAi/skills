# Config reference

Use this when the default skeleton in SKILL.md is not enough. Template-specific
variables and defaults always come from `registry/r/<id>.json`; this document
covers only the fields shared across a video.

## Frame and style

`orientation` is `portrait` (1080×1920, the default) or `landscape`
(1920×1080). Templates are responsive, but screenshots and copy still need to
fit the chosen layout. Inspect each orientation you claim works.

`style` is required for configs that travel through links. The renderer can
inject `{ "font": "Inter" }`, but linked configs do not get that fallback.

```json
{
  "style": {
    "font": "Inter",
    "preset": "editorial",
    "density": "normal",
    "motion": "normal",
    "brandKit": {
      "accent": "#6D5EF8",
      "secondary": "#F8B45E"
    }
  }
}
```

- Presets are listed in the catalog. Pick one; do not leave every video on the
  same default by habit.
- `density` is `airy`, `normal`, or `packed`; `motion` is `calm`, `normal`, or
  `punchy`.
- `brandKit` lives inside `style`. `accent` and `secondary` preserve generated
  gradients. Setting `brandKit.bg` deliberately flattens every scene to that
  background.

## Scene-level fields

`textArchetype` and `backgroundEffect` live beside `templateId`, never inside
`variables`. Valid values and per-template support are in the catalog; the
validator rejects unsupported combinations.

The six text archetypes are `subtle`, `typewriter`, `wordStagger`, `slam`,
`cinematic`, and `heroWord`. Read `motion.md` for use-when guidance.

Custom scenes whose `templateId` starts with `custom_` carry their sandboxed
function in `componentSource`. They should also carry `customTemplate` with the
label, variable schema, defaults, duration, and global-effect ownership needed
to reconstruct their Studio controls. See `custom-scenes.md` for the complete
contract. Custom source stays open-ended; the metadata preserves editability
instead of constraining the animation.

## Timing

There are two supported timing modes:

```json
{ "timing": { "fixedDuration": 3 } }
```

uses a standalone duration and is the natural shape for local Studio configs.
The renderer stacks scenes in order.

```json
{ "timing": { "startTime": 0, "endTime": 3 } }
```

uses an explicit timeline. Make every range contiguous: one scene's `endTime`
is the next scene's `startTime`. When both modes are present, the explicit range
wins. `timing: {}` falls back to the template's preferred duration.

There is no `timing.duration`. Always confirm the total length shown by Studio
or the renderer.

## Media and Pexels

Prefer user-provided media, a real HTTPS URL, or a local file path.
`mediaKeyword` resolves through Pexels when `PEXELS_API_KEY` or the setup config
provides a key. Without one, use direct media or a different template rather
than pretending a generic gradient proves the product.

Keyword resolution is nondeterministic. Once a clip works, copy the selected URL
from the log into `mediaUrl`. Prefer a rendition matching the output dimensions
instead of upscaling a 720p file.

Local image/video paths may be absolute, `file://`, or relative to
`video.json`. `vanillasky studio` and `render` serve them automatically and
keep the original path in the config. They cannot work in a hosted share link;
upload them and use HTTPS before running `vanillasky link`.

For a product page or local HTML prototype, capture a viewport first:

```bash
vanillasky capture prototype.html --out assets/product.png --width 1440 --height 900
```

Then use `assets/product.png` as `screenMediaUrl`. Base64 `data:` media renders
but usually makes Watch and Studio URL fragments too large.

## Footage FPS

Stock footage is often 25fps while export defaults to 30fps. That creates a
duplicate frame roughly once every six frames. Check footage with:

```bash
ffprobe -show_entries stream=r_frame_rate <url>
```

Then open Studio at the matching rate:

```bash
vanillasky studio video.json --fps 25
```

Use the same `--fps` value if a headless MP4 render is explicitly requested.
Prefer clips with one consistent frame rate across the video.

## Audio

`vanillasky tracks` lists bundled ids, moods, energy, duration, and description.
Reference one with:

```json
{ "audio": { "trackId": "<id>" } }
```

Match energy to the story. High-energy tracks fit launches; reviews and product
updates usually need calmer beds. A shorter track loops, so prefer one at least
as long as the video. `audio.audioUrl` also accepts a direct URL or local path.

Contact sheets are silent. If you perform a full render, read audio warnings and
watch the result rather than assuming the mux is correct.

## DESIGN.md

VanillaSky walks upward from the config and reads
[DESIGN.md](https://github.com/google-labs-code/design.md) when present:

- `colors.primary` → `style.brandKit.accent`
- `colors.secondary` → `style.brandKit.secondary`
- `colors.background` or `surface` → `style.brandKit.bg`
- first typography `fontFamily` → `style.font`

Config-explicit values win. Use `vanillasky brand` to inspect the resolved
result and `--no-design-md` to opt out. Background/surface tokens create a flat
background; omit them when generated brand gradients are preferable.

The working directory is only a logged fallback when the config's directory
tree has no DESIGN.md and the config carries no brand kit.

## Studio and links

`vanillasky studio video.json` is the default handoff. It edits the file in
place, follows external changes, and lets the user export the MP4.

`vanillasky link video.json` prints zero-install Watch and Studio links. The
config lives in the URL fragment; no config is uploaded. Use links for remote
handoff, not as a reason to render an MP4 early.
