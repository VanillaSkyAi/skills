# CLI reference

> The `vanillasky` CLI validates and inspects VideoConfig files, opens the local Studio, and supports full headless rendering when explicitly needed. It runs on your machine with no VanillaSky account or cloud renderer.

## Usage

<!-- BEGIN GENERATED CLI USAGE -->
```text
vanillasky setup [--check]
vanillasky render <config.json> [options]
vanillasky studio <config.json> [--no-open] [--fps <n>] [--browser <name>]
vanillasky validate <config.json> [--json] [--format <id>]
vanillasky diff <config.json> [--json]
vanillasky resolve <config.json> [--json]
vanillasky templates [id] [--json]
vanillasky tracks [--json]
vanillasky scope [--json]
vanillasky brand [path] [--json]
vanillasky link <config.json> [--base <url>]
vanillasky update [--check] [--skill-dir <path>]
```
<!-- END GENERATED CLI USAGE -->

This block is generated from `vanillasky help` and checked in CI so the website, GitHub, and executable cannot drift.

## setup

```bash
vanillasky setup
vanillasky setup --check
```

Interactive setup fills only missing values: Pexels key, default orientation, music preference, and optional DESIGN.md scaffolding. Every prompt is skippable. Values are stored in `~/.vanillasky/config.json`.

`--check` prints the current state—including a browser choice previously saved by `vanillasky studio --browser`—without changing anything.

## update

```bash
vanillasky update --check
vanillasky update
```

`--check` reports whether a newer public release exists. Without it, `update` refreshes the installed CLI bundle and agent skill. Use `--skill-dir <path>` when the skill is installed somewhere other than the default Claude-compatible location.

## validate

```bash
vanillasky validate video.json
vanillasky validate video.json --json
```

Validation checks:

- config structure and required fields;
- template IDs and close-match suggestions;
- every variable against the template schema;
- scene-level field placement;
- custom scene sandbox rules;
- the config's selected format contract.

`--format <id>` overrides the config's `format`; normally the field in `video.json` is sufficient. Validation exits with status 1 on errors.

## resolve

```bash
vanillasky resolve video.json
vanillasky resolve video.json --json
```

Resolves every Pexels `mediaKeyword` that does not yet have a `mediaUrl`, then atomically writes the selected URLs and posters into the config. Run it after composing and before validation. The persisted config is portable, validates cleanly, and rerenders deterministically; if any search fails, the original file is left unchanged.

Resolution requires a Pexels key from `PEXELS_API_KEY` or `~/.vanillasky/config.json`. Without one, use supplied media, direct URLs, or a gradient. `render` retains transient keyword resolution for backwards compatibility, but it does not persist the result.

## templates

```bash
vanillasky templates
vanillasky templates bigNumber --json
```

Lists the exact template IDs, purposes, story jobs, durations, proof requirements, and variable names bundled with the validator. Pass an ID with `--json` to get its complete schema and defaults before composing a scene. This is the fastest agent path and works offline; the website registry remains the source-inspection fallback.

## studio

```bash
vanillasky studio video.json
vanillasky studio video.json --browser "Google Chrome"
vanillasky studio video.json --fps 25
vanillasky studio video.json --no-open
```

Studio is the default handoff. It opens the local visual editor, follows external file changes, autosaves user edits, and exports the final MP4. Read the [Studio guide](https://vanillasky.ai/docs/studio) for the full workflow.

## render

Use `render` for inexpensive inspection or for an explicitly requested headless MP4:

```bash
vanillasky render video.json --frame 1.2 --out check.png
vanillasky render video.json --sheet --out ./sheet
vanillasky render video.json --out video.mp4
```

| Flag | Description |
| --- | --- |
| `--out <path>` | Output path. Defaults to `video.mp4`; frames use PNG and sheets use a directory. |
| `--frame <sec>` | Render one PNG at the requested time. Pick a mid-scene time rather than a transition boundary. |
| `--sheet` | Render five frames per scene and a combined `sheet.png`. |
| `--fps <n>` | Frames per second. Default: 30. |
| `--scale <0..1>` | Resolution scale. Default: 1. |
| `--pages <n>` | Parallel browser pages for a full render. Default: 4. |
| `--draft` | Fast WebCodecs export at 30fps and full resolution. |
| `--open` | Open the completed MP4 with the platform viewer. |
| `--no-validate` | Skip validation. Avoid this in normal workflows. |
| `--no-design-md` | Do not merge DESIGN.md brand tokens. |
| `--no-pexels` | Do not resolve `mediaKeyword` through Pexels. |
| `--base <url>` | Host used in completion links. |

A full render validates first and refuses invalid configs. The completion block includes Watch and Studio links.

## link

```bash
vanillasky link video.json
```

Prints zero-install Watch and Studio URLs. The config is encoded in the URL fragment and is not uploaded. `--base <url>` changes the host.

## tracks

```bash
vanillasky tracks
vanillasky tracks --json
```

Lists bundled track IDs, moods, energy, duration, and description. Reference a track with `"audio": { "trackId": "<id>" }`.

## brand

```bash
vanillasky brand
vanillasky brand ./path --json
```

Shows which DESIGN.md applies and the tokens mapped into VideoConfig.

## scope

```bash
vanillasky scope
vanillasky scope --json
```

Lists the globals available to a custom scene's `componentSource`. Custom source has no imports; everything usable is already in lexical scope.

## diff

```bash
vanillasky diff video.json
vanillasky diff video.json --json
```

Compares ejected scenes with their recorded registry origins and reports upstream changes. It never modifies or merges custom source.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PEXELS_API_KEY` | Resolve stock media keywords. Environment value wins over setup config. |
| `PLAYWRIGHT_BROWSERS_PATH` | Point to an existing Playwright browser directory. |
| `FFMPEG_PATH` | Override the bundled or system ffmpeg executable. |
| `HTTPS_PROXY` / `NO_PROXY` | Passed to the browser process. |
