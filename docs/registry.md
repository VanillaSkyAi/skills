# Templates and the registry

> Every scene template and shared library ships through a public, shadcn-compatible registry with its schema and source. Agents read it before composing; developers can inspect or eject any item.

Browse the visual catalog at [vanillasky.ai/templates](https://vanillasky.ai/templates).

## Two public layers

| Layer | Type | Purpose |
| --- | --- | --- |
| Templates | `registry:block` | Finished scenes—the default composition path. |
| Shared libraries | `registry:lib` | Five stable scene-authoring capabilities: video config, theme, motion, typography, and backgrounds. |

Start with a template. Only move to an ejected or custom scene when the catalog genuinely cannot express the brief.

## The agent catalog

The bundled CLI is the shortest, offline-safe route:

```bash
vanillasky templates
vanillasky templates bigNumber --json
```

The first command is a concise selection catalog. The second returns the exact schema and defaults for one shortlisted template.

The equivalent web catalog lives at [vanillasky.ai/llms-components.txt](https://vanillasky.ai/llms-components.txt). It contains:

- template IDs and categories;
- exact variable names, types, and options;
- preferred durations and format roles;
- use-when guidance;
- style presets and text archetypes;
- dependency and source information.

The public repository contains the same file at `registry/llms-components.txt`. Agents must use one exact catalog surface and stop rather than inventing an ID or variable.

## Selection quality

A correct template ID is only the first gate. A strong short video also needs a grounded visual mechanism and visible progression:

- use a notification for an alert, terminal or editor for a developer workflow, chat for a conversation, and a device or browser for a supplied product surface;
- treat a flat gradient as a deliberate beat, not the automatic background for every scene—three or more scene rows on the same flat background is repetition, even when the typography changes;
- keep an approved slogan or quote intact in at least one scene instead of manufacturing a story by splitting its fragments across scenes;
- for sparse briefs, prefer the format's shortest valid story and one tangible supplied or stock visual. Minimal means fewer elements, not identical scenes.

These are selection rules, not new template APIs. The agent skill applies them before the contact-sheet inspection; the sheet is where composition and repetition are finally judged.

## Per-item JSON

Full details for an item are published at `https://vanillasky.ai/r/<id>.json` and in `registry/r/<id>.json` in the public repository.

Each item contains:

- `meta.vanillasky.variableSchema` with types, options, defaults, and required fields;
- category, preferred duration, and format guidance;
- `files[].content` with the item's source and dependency closure.

```bash
curl -s https://vanillasky.ai/r/bigNumber.json \
  | jq '.meta.vanillasky.variableSchema'
```

## Eject source into a React project

Map the namespace once in `components.json`:

```json
{
  "registries": {
    "@vanillasky": "https://vanillasky.ai/r/{name}.json"
  }
}
```

Then install an item with shadcn:

```bash
npx shadcn add @vanillasky/bigNumber
npx shadcn add @vanillasky/motion
```

This installs source into your React project. It does not alter what the VanillaSky CLI renders.

The five stable library entrypoints and their dependency graph are documented in the [scene authoring libraries guide](/docs/libraries). Implementation files such as `animation-utils.ts` and `tokens.ts` are shipped behind those facades, not as separate public items.

## Customize a scene in a video

To change a scene beyond its variables, copy the nearest registry item into `componentSource` and give the scene a `custom_` template ID. The scene records its origin so the CLI can report upstream changes later:

```bash
vanillasky diff video.json
```

`diff` reports changes; it never merges them into your custom source.

Before writing a custom scene, run `vanillasky scope` to list the exact globals available inside the sandbox. The validator rejects imports, unsupported globals, and other contract violations instead of rendering a blank scene.

The sandbox also exposes internal scene elements such as counters, cards, and device frames. They are an advanced authoring capability, not a third public registry layer. Most own the focal frame, so custom scenes should normally use one and compose text or custom motion around it.

## Offline behavior

The public [VanillaSkyAi/skills](https://github.com/VanillaSkyAi/skills) release includes the complete registry snapshot. Online and offline paths expose the same IDs, schemas, defaults, and source.

If neither the live catalog nor the local snapshot is available, do not guess.
