# Getting started with VanillaSky

> VanillaSky is an open-source agent skill for making short social videos from a prompt. Your agent composes and checks a `VideoConfig`; you review, refine, and export it in Studio. No account, cloud renderer, credits, or animation code required.

## The workflow

A video is one JSON file: an ordered list of scenes built from curated templates. The normal path is deliberately short:

1. **Compose** — your agent turns the brief into `video.json` using the live template catalog.
2. **Validate** — the CLI catches structural mistakes, invalid template variables, and format violations.
3. **Inspect** — a contact sheet exposes overflow, weak composition, and accidental defaults without waiting for an MP4.
4. **Open Studio** — review the live preview, adjust scenes, copy, timing, music, and brand.
5. **Export** — the user exports the MP4 from Studio when the video is ready.

The agent and Studio can edit the same file. Studio follows external changes live and warns before either side overwrites unsaved work.

## Install the skill

With the `skills` CLI, which supports Claude Code, Codex, Cursor, and 75+ other agents:

```bash
npx skills add VanillaSkyAi/skills --skill vanillasky
```

That installs the agent instructions. On first use, the skill runs its bundled
`scripts/install-cli.mjs` bootstrapper to clone the official public release and
put its local CLI on `PATH`. The official CLI is **not published as an npm
package**: never install a package merely named `vanillasky` from npm.

Or clone the public repository and copy the skill manually:

```bash
git clone https://github.com/VanillaSkyAi/skills vanillasky-skills
cp -R vanillasky-skills/vanillasky ~/.claude/skills/vanillasky
```

The repository includes the skill, CLI, scene registry, music, examples, and these same documentation files. The local Studio and renderer live in its `cli/` directory.

## Requirements

- **Node 18 or newer.**
- **A Chromium-based browser.** Chrome, Edge, or Chromium is detected automatically. Otherwise run `npx playwright install chromium`.
- **ffmpeg.** `npm install` provides it through `ffmpeg-static`; a system `ffmpeg` also works.

The CLI never downloads a browser itself. Set `PLAYWRIGHT_BROWSERS_PATH` when you want it to use an existing Playwright browser directory.

## Your first video

From a checkout of [VanillaSkyAi/skills](https://github.com/VanillaSkyAi/skills):

```bash
git clone https://github.com/VanillaSkyAi/skills vanillasky-skills
cd vanillasky-skills
npm install --prefix cli
npm install -g ./cli

vanillasky validate examples/launch-demo.json
vanillasky render examples/launch-demo.json --sheet --out ./sheet
vanillasky studio examples/launch-demo.json
```

Inspect `sheet/sheet.png`, then review and edit the video in Studio. The user exports the MP4 from Studio when satisfied.

For a video your agent created in another project, run the same handoff against that file:

```bash
vanillasky validate video.json
vanillasky render video.json --sheet --out ./sheet
vanillasky studio video.json
```

The config's `format` selects the correct validation contract. Do not hardcode `--format launch` for reviews, milestones, or product updates.

**Do not render a full MP4 by default.** The full CLI render is for CI, headless environments, or when someone explicitly asks for the file:

```bash
vanillasky render video.json --open
```

## Start each agent session

The skill runs two read-only checks before composing:

```bash
vanillasky update --check
vanillasky setup --check
```

`update --check` reports whether a newer public release exists. `setup --check` reports the configured browser, default orientation, Pexels key, music preference, and DESIGN.md status.

A Pexels key is optional. Without one, use supplied media, direct URLs, or templates that do not depend on stock search. A DESIGN.md is optional too; it only provides automatic brand tokens.

## What is included

- **Curated scene templates** for hooks, proof, product surfaces, social moments, and closers.
- **Four story formats:** `launch`, `review`, `milestone`, and `update`.
- **A bundled music library** with mood, energy, and duration metadata.
- **A local Studio** with live preview and MP4 export.
- **A public registry** with every template's schema and source.
- **Portrait and landscape output:** 1080×1920 or 1920×1080.

## Where to go next

- [Use Studio](https://vanillasky.ai/docs/studio) for the default review and export workflow.
- [Understand VideoConfig](https://vanillasky.ai/docs/config) when you need timing, branding, media, or formats.
- [Browse templates and the registry](https://vanillasky.ai/docs/registry) before composing or ejecting a scene.
- [Read the CLI reference](https://vanillasky.ai/docs/cli) for automation and headless rendering.
