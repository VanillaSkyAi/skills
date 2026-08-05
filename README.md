# VanillaSky skills

Agent skills for [VanillaSky](https://vanillasky.ai) — turn a prompt into a
finished social video (MP4, vertical 9:16 or landscape 16:9). Launch videos,
milestone posts, product updates, customer reviews: your agent composes a
`VideoConfig` JSON from curated scene templates and renders it locally with
the bundled `vanillasky` CLI. Deterministic — same config, same MP4.

## Skills

| Skill | What it does |
| --- | --- |
| [`vanillasky`](vanillasky/) | Compose + render finished social videos from a brief. Curated scene templates, music tracks, motion/composition rules, brand ingestion from your repo's DESIGN.md. |

## What's in the box

| | |
| --- | --- |
| **28 scene templates** | Hooks, stats, device mockups, social cards, explainers, closers — each with a variable schema and a preferred duration. [Browse](https://vanillasky.ai/templates) |
| **4 shared libs** | The motion vocabulary, text fitting, and the brand token resolver — all installable, all readable |
| **12 licensed tracks** | Bundled with the CLI, tagged by mood and energy, no download step. [Listen](https://vanillasky.ai/audio) |
| **4 formats** | `launch`, `review`, `milestone`, `update` — each with its own slot contract the validator enforces |
| **A local editor** | `vanillasky studio` — timeline, variables, music, live preview, MP4 export. No account, no upload |

## Install the skill

**Claude Code / Claude-compatible agents:**

```bash
git clone https://github.com/VanillaSkyAi/skills vanillasky-skills
cp -R vanillasky-skills/vanillasky ~/.claude/skills/vanillasky
```

**skills CLI (75+ agents):**

```bash
npx skills add VanillaSkyAi/skills --skill vanillasky
```

The skill uses the live template catalog at
[vanillasky.ai/llms-components.txt](https://vanillasky.ai/llms-components.txt)
when online; this repo's `registry/` directory is the equivalent offline
snapshot (`llms-components.txt` is the index, `r/<name>.json` has each
item's full variable schema, defaults, and source).

## Edit it without writing JSON

```bash
vanillasky studio video.json
```

Opens a visual editor served from `127.0.0.1` — scene timeline, per-scene
variables, template swap, stock search with your own Pexels key, the music
library, live preview, and **Export MP4** running the same renderer the CLI
uses. Edits autosave to the file, and the page follows external changes, so an
agent can keep editing the same config while you watch it update.

No account, no upload, no telemetry. The AI chat from the hosted Studio is
deliberately absent — that is what lets the whole editor ship inside the skill
with no backend.

## The registry — components, not just templates

The catalog has three layers, all shadcn-conformant and all shipped with
source:

| Layer | Type | What it is |
| --- | --- | --- |
| Templates | `registry:block` | Finished scenes — the default path. Pick one, set variables, render. |
| Primitives | `registry:ui` | The building blocks templates are made of — cards, device chrome, counters, charts. Compose them when no template fits. |
| Libs | `registry:lib` | Shared vocabulary: motion curves (`animation-utils`), text fitting (`text-utils`), and the canonical brand tokens (`tokens`). |

Every item's JSON carries its own source in `files[0].content` plus its full
dependency closure, so you can read or eject any of it without installing
anything. To install with the shadcn CLI instead, map the namespace once in
your project's `components.json`:

```json
{ "registries": { "@vanillasky": "https://vanillasky.ai/r/{name}.json" } }
```

```bash
npx shadcn add @vanillasky/bigNumber      # a template
npx shadcn add @vanillasky/countUpNumber  # a primitive
```

Without that `registries` entry the `@vanillasky` namespace does not
resolve — reading the item JSON directly needs no setup at all.

## The renderer (CLI)

Rendering happens locally via the `vanillasky` CLI in [`cli/`](cli/) — a
prebuilt render app driven by headless Chrome. No VanillaSky account, no
server: the only network a render ever needs is the media/audio URLs your
config declares.

### Requirements (macOS + Linux)

- **Node 18+**
- **A Chromium-based browser** — installed Chrome/Edge/Chromium is picked up
  automatically; otherwise `npx playwright install chromium`, or point
  `PLAYWRIGHT_BROWSERS_PATH` at an existing Playwright browsers directory.
  The CLI never downloads a browser itself.
- **ffmpeg** — installed automatically via `ffmpeg-static` in the step below;
  falls back to system ffmpeg on PATH (override with `FFMPEG_PATH`).

### First render

```bash
npm install --prefix cli      # installs ffmpeg-static + playwright-core (the only two deps)
node cli/bin/vanillasky.mjs validate examples/launch-demo.json
node cli/bin/vanillasky.mjs render examples/launch-demo.json --frame 2 --out check.png   # one frame (~2s)
node cli/bin/vanillasky.mjs render examples/launch-demo.json --out launch-demo.mp4       # full render
```

Optional, for a global `vanillasky` command: `npm install -g ./cli`

Portrait 9:16 and landscape 16:9 are equal citizens — swap in
`examples/launch-demo-landscape.json` for a 1920x1080 render (the config's
`orientation` field decides; portrait when omitted).
`node cli/bin/vanillasky.mjs help` lists everything (contact sheets, draft
mode, scale/fps, share links).

## Ejecting, and staying informed

Any item can be ejected: read its source from `registry/r/<id>.json` and
inline your own version as `componentSource` on a `custom_*` scene. That
gives you the code, and the cost is that your copy stops receiving fixes.

An ejected scene records where it came from in `scene.origin` — the item, the
version, and a hash of the upstream source at eject time — so:

```bash
vanillasky diff video.json
```

tells you when the item you started from has changed since, and points at what
to compare. It reports; it never merges, because your copy diverged on purpose.

Note that `npx shadcn add` installs an item's source into a React project —
useful for building your own app around these components. It does **not**
change what the `vanillasky` CLI renders; to change a scene there, use
`componentSource`.

## Offline behavior

Works fully offline out of the box:

- **Fonts** are bundled (`cli/dist/fonts/`) — every Google family the font
  picker offers, so any `config.style.font` from that list renders
  identically offline. Families outside it fall back to system fonts.
- **Emoji** render from an embedded Noto-emoji image map (Apache-2.0) — no CDN.
- **Templates / validator / registry** are all local.
- **Audio**: `audio.trackId` resolves against the bundled track library in
  `cli/audio/` (`node cli/bin/vanillasky.mjs tracks` lists it).
  `audio.audioUrl` also accepts a local file path. An unresolvable reference
  renders silent with a warning, never fatally.

The only network use: `npm install`, media URLs in your config's scene
variables (prefetched; the render refuses to start if any fail),
`mediaKeyword` auto-resolution when `PEXELS_API_KEY` is set (optional —
free at [pexels.com/api](https://www.pexels.com/api/); `--no-pexels` opts
out), and `audio.audioUrl` if set (best-effort — failures render silent,
never fatal).

If your integration uses Pexels auto-resolution, note Pexels' API guidelines:
show a prominent link to Pexels alongside published output, and credit
photographers where possible (the CLI logs the photographer for each filled
clip).

## License

[MIT](LICENSE). Third-party licenses for redistributed and install-time work
are in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

---

Made by [VanillaSky](https://vanillasky.ai) — describe a moment, get a video.
