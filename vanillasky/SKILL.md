---
name: vanillasky
description: "Create polished social videos from a prompt—launches, milestones, product updates, and customer reviews—in vertical 9:16 or landscape 16:9. Composes a validated editable video with curated scene templates, music, motion rules, visual inspection, and a Studio handoff for review and MP4 export."
---

# VanillaSky — social videos from a config

A video is a `VideoConfig` JSON: an ordered list of scenes, each referencing a
curated template by camelCase id. Compose and inspect the config, then hand it
to the user in VanillaSky Studio. The user previews, edits, and exports the MP4
there; do not make a full MP4 render part of the initial flow.

## Three non-negotiables

1. **Read the catalog; never guess.** After resolving the CLI, run
   `vanillasky templates` for the bundled template map and
   `vanillasky templates <id> --json` for an exact schema. The live fallback is
   `https://vanillasky.ai/llms-components.txt`; repo and standalone installs
   carry `registry/llms-components.txt` plus `registry/r/<name>.json`. If no
   exact catalog is reachable, stop rather than inventing an id or variable.
2. **Never invent proof.** Names, quotes, numbers, stats, screenshots, and
   product claims must come from the brief or supplied assets. If a template
   requires evidence the user did not provide, choose another template.
3. **Never hand off an uninspected config.** Validation catches structure;
   only looking at rendered frames catches overflow, weak composition, and
   accidental defaults.

## Start the session

First resolve the CLI. The official VanillaSky CLI is **not published as an
npm package**. Never search npm, run `npm install vanillasky`, or use a package
that merely owns that name. If `command -v vanillasky` fails, resolve this
skill's installed directory from the path of this `SKILL.md`, then run its
official bootstrapper:

```bash
node <installed-skill-directory>/scripts/install-cli.mjs
```

The bootstrapper clones only `https://github.com/VanillaSkyAi/skills.git` into
`~/.vanillasky/release`, installs the dependencies declared by that checkout,
and exposes its local CLI on `PATH`. Stop if the checkout origin differs or
the script fails; do not substitute a registry package.

Then run these before the first video:

```bash
vanillasky update --check
vanillasky setup --check
vanillasky templates
```

`update --check` reports a newer release without changing anything. If a flag
documented here is absent, run `vanillasky update`. `setup --check` reports the
default orientation, browser, Pexels key, music mood, and DESIGN.md state.

A missing Pexels key is not blocking: mention once that stock search needs a
free key from pexels.com/api, then use supplied media or templates that do not
depend on stock. A missing DESIGN.md means no automatic branding; do not block.

## Derive the brief

Use the prompt, repository, DESIGN.md, URLs, and supplied assets first. Ask at
most three questions, and only for genuine gaps:

1. **Goal and format** — what should the viewer do or feel: launch, review,
   milestone, or update?
2. **Audience and proof** — who is it for, and what real number, quote,
   screenshot, or product detail earns the claim?
3. **Assets** — which screenshots, logos, clips, or URLs must appear?

Derive orientation from the destination: TikTok/Reels/Shorts → portrait;
YouTube video or an explicitly wide X/LinkedIn post → landscape. Otherwise use
the configured default, or spend one of the three questions on it.

Save the result as `video-brief.md` beside `video.json`. Re-read and update it
on later turns instead of asking the same questions again.

## Default workflow: hand off in Studio

1. **Compose** `video.json` from the brief and bundled catalog.
   Inspect the exact schemas for the shortlisted templates with
   `vanillasky templates <id> --json` before writing their variables.
2. **Resolve stock media** when the config contains `mediaKeyword`:

   ```bash
   vanillasky resolve video.json
   ```

   This selects a Pexels result and writes the exact `mediaUrl` into the config,
   making validation and rerenders deterministic. If no Pexels key is available,
   use supplied media, a direct URL, or `mediaType: "gradient"` instead. Do not
   rely on render-time search as the handoff state.
3. **Validate** and fix every error and warning:

   ```bash
   vanillasky validate video.json --preflight
   ```

   The config's `format` selects the right slot contract; do not hardcode
   `--format launch` for every video. Treat warnings as work to resolve, not
   decoration, and never describe validation as clean while any remain.
4. **Inspect a contact sheet**:

   ```bash
   vanillasky render video.json --sheet --out ./sheet
   ```

   Open `sheet/sheet.png` and inspect the individual frames when needed. Check
   Actually open `sheet/sheet.png`; the file's existence is not inspection.
   Check text overflow, unreadable type, unset/default-looking values, unused assets,
   visual repetition, and critical content outside the middle 75% of the frame.
   After any visual edit, repeat resolve (when needed), validation, and the sheet.
5. **Hand off in Studio**:

   ```bash
   vanillasky studio video.json
   ```

   Studio follows the file live. Keep editing the config as the user reviews;
   their unsaved edits surface as a conflict instead of being overwritten. The
   user exports the MP4 from Studio when satisfied.

   If the wrong browser opens, pass `--browser "Google Chrome"`; that choice is
   saved for later Studio sessions. Use `--no-open` in a remote shell.

**Do not render a full MP4 by default.** Render it yourself only when the user
explicitly asks for the file or when Studio cannot be used (CI/headless):

```bash
vanillasky render video.json --open
```

For that branch, watch the result and read the completion banner: confirm total
length, audio coverage, orientation, and footage smoothness. Include the
completion block's Watch and Studio links. `vanillasky link video.json`
reprints them without rendering.

## Compose the default path

Start from this shape, then use the catalog's exact schemas:

```json
{
  "format": "launch",
  "orientation": "portrait",
  "style": {
    "font": "Inter",
    "preset": "bold",
    "brandKit": { "accent": "#6D5EF8", "secondary": "#F8B45E" }
  },
  "audio": { "trackId": "<from vanillasky tracks>" },
  "scenes": [
    {
      "id": "s0",
      "templateId": "media",
      "variables": { "texts": "Ship it today", "mediaType": "gradient" },
      "timing": { "fixedDuration": 3 }
    }
  ]
}
```

- `brandKit` belongs inside `style`; choose a style preset deliberately.
- `textArchetype` and `backgroundEffect` are scene fields, not variables.
- `timing.fixedDuration` sets a standalone scene length. Explicit timelines use
  contiguous `startTime` + `endTime`; `timing.duration` is not a field.
- Use `vanillasky tracks` to choose music by mood and energy. Silence is valid
  but usually weak for social video.
- Prefer a real HTTPS URL or local path for media. Base64 media makes share
  links too large, and `mediaKeyword` results must be pinned to `mediaUrl` for
  deterministic rerenders.
- Local image/video paths are first-class in CLI Studio and render: they may be
  absolute, `file://`, or relative to `video.json`, and the CLI serves them
  without changing the file. They cannot work in a hosted `vanillasky link`.
- For a local HTML prototype or product page, run
  `vanillasky capture <url-or-file> --out assets/product.png`, then use that
  PNG path in `screenMediaUrl`.

Read [references/config.md](references/config.md) when the config needs
branding, media resolution, explicit timing, FPS matching, or link behavior.

## Pick the format by the story

| Format | Story shape | Typical length |
|---|---|---|
| `launch` | framing → comprehension → proof | 3–8 scenes, usually 5 |
| `review` | quote → attribution → outcome | 4–7 scenes, usually 5 |
| `milestone` | number → context → gratitude | 3–6 scenes, usually 4 |
| `update` | change → demonstration → benefit | 4–7 scenes, usually 5 |

The validator enforces scene counts, banned hooks, closer placement, and
adjacency rules. [references/formats.md](references/formats.md) contains the
generated contract. Your job is the judgment the validator cannot make.

## Creative quality gates

### Truth and assets

- Replace every template default with brief-specific content. Never ship
  placeholder stats such as `10K`, `99.9%`, or `<50ms`.
- Use every supplied screenshot that matters. A real product surface beats a
  synthesized terminal, editor, phone, or browser showing the same thing.
- Match portrait screenshots to phone mockups and landscape screenshots to
  browser mockups.

### Story

- The hook creates tension or curiosity; it does not spend the payoff.
- Include at least one explanatory body that names the concrete product,
  audience, or outcome. Notifications, calls, tweets, and numbers can frame or
  prove, but cannot explain the product alone.
- The closer is an address—brand, URL, or action—not a repetition of the proof.

### Variety and pacing

- Do not make every body a card. Use at least two non-card-led registers.
- A plain sentence on one flat gradient is a fallback, not automatically a
  strong hook. Prefer a brief-grounded visual mechanism—a notification for an
  alert, terminal/editor for a developer workflow, chat for a conversation,
  device or browser for a supplied product surface. Even an intentionally
  minimal video needs one tangible visual idea; minimal means fewer elements,
  not the same gradient and typography in every scene.
- A coherent palette is not scene variety. Three or more scene rows sharing
  the same flat background fail this gate even when their type layout differs.
  Change at least one register with a grounded asset, stock backdrop, template,
  or restrained effect. When the brief contains too little approved copy or
  proof to support many distinct scenes, use the format's shortest valid story
  instead of repeating it.
- Give footage at least 3 seconds unless it is intentionally a short bridge.
  Vary background motion rather than applying one effect everywhere.
- A gradient-only media scene should be a deliberate brand beat, not a fallback
  chosen because stock or supplied media was inconvenient.
- Inspect what actually appears: duration-limited templates may omit later
  items even when the config contains them.

### Copy

- Hook: at most 7 words. CTA: at most 4 words, preferably a command.
- Preserve every user-approved slogan or quote intact in at least one scene.
  Do not turn one approved line into several pseudo-distinct scenes by showing
  its fragments separately; let visual progression carry the other beats.
- Avoid lists of three generic nouns, categories, or verbs. Rhythm needs
  tension, progression, or a twist—not three synonyms.
- Keep must-stay-together text inside a nowrap span; never rely on NBSP for SVG
  export.

## Escalate only when templates fail

Use the lowest rung that expresses the brief:

1. Template with purpose-written copy.
2. Template with adjusted variables.
3. Ejected/custom scene based on a registry item.
4. Custom scene composed from sandbox scene elements.

The default path stops at rung 2. Before using rung 3 or 4, read
[references/custom-scenes.md](references/custom-scenes.md),
[references/libraries.md](references/libraries.md),
[references/motion.md](references/motion.md), and
[references/visual-rules.md](references/visual-rules.md). Use
`vanillasky scope` and the generated
[references/motion-api.md](references/motion-api.md) instead of inventing APIs.

## Reference router

- [references/config.md](references/config.md) — timing, styling, branding,
  media, audio, FPS, DESIGN.md, and share-link behavior.
- [references/formats.md](references/formats.md) — generated slot contracts and
  template categories.
- [references/custom-scenes.md](references/custom-scenes.md) — ejection,
  provenance, sandbox contract, and validation rules.
- [references/libraries.md](references/libraries.md) — generated five-library
  map, audience guidance, dependencies, install targets, and exact export groups.
- [references/motion.md](references/motion.md) — choreography, reading time,
  focal hierarchy, and cut continuity.
- [references/motion-api.md](references/motion-api.md) — generated functions,
  springs, and easing names available to custom scenes.
- [references/visual-rules.md](references/visual-rules.md) — typography,
  orientation layout, colour, light, and composition for custom scenes.
