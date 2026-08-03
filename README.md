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
snapshot (`llms-components.txt` is the index, `r/<templateId>.json` has each
template's full variable schema, defaults, and source).

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
