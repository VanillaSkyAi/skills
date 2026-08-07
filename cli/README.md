# vanillasky CLI

Validate, render, and share VanillaSky `VideoConfig` JSON with a local
Chrome. No cloud, no credits — the same deterministic render contract as the
server export path (`/render` + `__setFrame(t)`), driven from your machine.
Portrait 9:16 and landscape 16:9 are both first-class: the config's
`orientation` field picks 1080x1920 or 1920x1080 (portrait when omitted).

```bash
vanillasky setup --check                           # print setup state (Pexels key, default orientation, music mood, DESIGN.md)
vanillasky resolve video.json                      # pin stock-search results into the config
vanillasky validate video.json                     # schema + template checks, exit 1 on errors
vanillasky validate video.json --format launch     # also enforce the launch slot contract
vanillasky validate video.json --preflight         # fetch remote media; verify HTTP + MIME
vanillasky validate video.json --json              # machine-readable output
vanillasky render video.json                       # full render → ./video.mp4 (validates first)
vanillasky render video.json --frame 2.5           # one PNG at t=2.5s (~2s inspect)
vanillasky render video.json --sheet --out ./sheet # 5 PNGs per scene + sheet.png
vanillasky render video.json --draft               # in-browser WebCodecs export (fast)
vanillasky render video.json --fps 30 --scale 0.5 --pages 4 --out out.mp4
vanillasky templates                               # concise bundled selection catalog
vanillasky templates bigNumber --json              # exact schema + defaults for one template
vanillasky tracks                                  # list the bundled audio library (moods, energy, durations)
vanillasky brand                                   # show the DESIGN.md brand tokens this directory picks up
vanillasky link video.json                         # https://vanillasky.ai/render#config=<base64url>
vanillasky link video.json --base http://localhost:8090
vanillasky capture prototype.html --out assets/ui.png
```

Validation:

- `validate` checks structure, template ids (camelCase, with suggestions for
  near-misses), every scene's variables against the template's variableSchema
  (unknown names, missing required, type mismatches), backgroundEffect
  placement (scene-level, only on templates that consume it), and — when the
  config declares `"format": "launch"` or `--format launch` is passed — the
  slot contract (scene-count bounds, closer category/position, same-category
  and same-template adjacency, slow-hook templates at scene 0).
- `render` runs the same validation first and refuses invalid configs;
  `--no-validate` bypasses.
- Local image/video paths are validated for existence and file type, then
  served through the CLI's loopback server for Studio and render. The paths in
  `video.json` stay unchanged. Hosted `link` URLs reject local files because a
  remote browser cannot access this machine.
- `validate --preflight` also fetches each remote image/video and checks its
  HTTP status and MIME type before a sheet or full render can turn it black.
- A config without a `style` block gets a warning from `validate` (the render
  page requires one); `render` injects a minimal default
  (`{ "font": "Inter" }`) instead of crashing.
- Template/format data lives in `lib/registry-data.mjs`, generated from
  `src/` by `npm run gen` at the repo root and committed. A vitest drift
  guard (`cli/lib/registry-data.test.mjs`) fails when it goes stale.
- `templates` exposes that same generated data directly to agents, so
  template selection and schema lookup do not require a network fetch.

Requirements:

- **A browser**: installed Chrome/Edge, or a Playwright Chromium
  (`npx playwright install chromium`). The CLI never downloads one itself.
- **ffmpeg**: bundled via `ffmpeg-static`; falls back to system `ffmpeg` on
  PATH (override with `FFMPEG_PATH`). Only needed for the full render,
  sheet compositing, and audio muxing.
- **The built app**: a `dist/` inside this package, or the repo-root `dist/`
  when running from a checkout (`npm run build` at the repo root).
  `npm run package:skill` at the repo root builds the render-only app, stages
  it here as `cli/dist/` (with Google Fonts localized for offline renders),
  and produces the standalone skill artifact under `dist-skill/`.

Network-free sample configs live in `examples/` —
`vanillasky render examples/launch-demo.json` should work on a fresh machine
with no VanillaSky services reachable at all. The examples cover both
orientations (`launch-demo.json` is portrait 9:16,
`launch-demo-landscape.json` is landscape 16:9) and each references a
bundled audio track. `examples/design-md-demo/` demos DESIGN.md brand
ingestion: render `product-update.json` from inside that directory and the
video picks up the palette + font with no brand in the config.

DESIGN.md ingestion:

- When the repo root above the config file carries a
  [DESIGN.md](https://github.com/google-labs-code/design.md) — discovered with
  a git-style upward walk — `render` and `validate` merge its front-matter
  tokens into the config: `colors.primary` → `style.brandKit.accent`,
  `colors.secondary` → `secondary`, `colors.background`/`surface` → `bg`, and
  the first typography `fontFamily` → `style.font`. `rounded` tokens are
  parsed and reported but not yet consumed.
- The cwd is only a fallback: it applies only when the config's own directory
  tree has no DESIGN.md AND the config declares no `brandKit`, and the merge
  is logged loudly — an unrelated repo's brand never silently bleeds into a
  branded config rendered from inside it.
- Precedence: config-explicit values > DESIGN.md > defaults. Opt out with
  `--no-design-md`. A malformed file warns and is skipped — it never fails a
  render.
- `vanillasky brand [path]` shows which DESIGN.md would apply and the mapped
  tokens (`--json` for machine-readable output).

Config notes:

- Remote media URLs must be directly fetchable — render preflights them and
  refuses to start if any fail or return a non-image/video MIME type.
- Local image/video paths can be absolute, `file://`, or relative to
  `video.json`; Studio and render serve them automatically while the CLI is
  running. Use HTTPS URLs before generating a hosted share link.
- `vanillasky capture <url-or-file> --out assets/screen.png` turns a product
  page or local HTML prototype into a local screenshot ready for a media slot.
- Proxy env vars (`HTTPS_PROXY`/`NO_PROXY`) are passed into the browser.

Stock footage (Pexels):

- With `PEXELS_API_KEY` set (free at [pexels.com/api](https://www.pexels.com/api/);
  env var, or `~/.vanillasky/config.json` `{ "pexelsApiKey": "..." }` — env
  wins), run `vanillasky resolve video.json` after composing. It resolves every
  `mediaKeyword` with an empty `mediaUrl`, then atomically writes the chosen URL
  and poster into the config. The resulting file is portable, validates cleanly,
  and rerenders deterministically. Resolution uses portrait
  orientation (landscape for landscape configs), video unless the scene pins
  `mediaType: "photo"`, best-HD file for the orientation, and the video
  thumbnail stored as the sibling `mediaPoster`. Each fill is logged;
  responses are cached per keyword within the run.
- `render` can still resolve an unpinned keyword transiently for backwards
  compatibility; it does not persist that choice. Agents and repeatable
  workflows should use `resolve` first. `--no-pexels` disables the transient
  render fallback.
- Without a key, set a direct `mediaUrl` or the scene falls back to its brand
  gradient (`validate` warns and points at `PEXELS_API_KEY`).
- Pexels' API guidelines require a **prominent link to Pexels** wherever the
  API-sourced media is shown (e.g. "Videos provided by Pexels"), and
  encourage crediting the photographer — the CLI logs the photographer for
  every filled clip so you can carry the credit into your post.

Audio:

- `audio.trackId` resolves against the bundled track library in `audio/`
  (`vanillasky tracks` lists ids, moods, energy, durations). Manifest:
  `audio/tracks.json`, written by `scripts/fetch-tracks.mjs` at the repo root.
- `audio.audioUrl` accepts an http(s) URL (downloaded) or a local file path.
- Resolved audio is muxed with the config's volume/fade-out semantics; tracks
  shorter than the video loop; anything unresolvable renders silent with a
  warning. Audio problems never fail the render.
