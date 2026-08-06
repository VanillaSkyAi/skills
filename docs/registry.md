# Templates and the registry

> Every scene template and shared library ships through a public, shadcn-compatible registry with its schema and source. Agents read it before composing; developers can inspect or eject any item.

Browse the visual catalog at [vanillasky.ai/templates](https://vanillasky.ai/templates).

## Two public layers

| Layer | Type | Purpose |
| --- | --- | --- |
| Templates | `registry:block` | Finished scenes—the default composition path. |
| Shared libraries | `registry:lib` | Motion, text-fitting, color, background, and brand-token utilities. |

Start with a template. Only move to an ejected or custom scene when the catalog genuinely cannot express the brief.

## The agent catalog

The compact catalog lives at [vanillasky.ai/llms-components.txt](https://vanillasky.ai/llms-components.txt). It contains:

- template IDs and categories;
- exact variable names, types, and options;
- preferred durations and format roles;
- use-when guidance;
- style presets and text archetypes;
- dependency and source information.

The public repository contains the same file at `registry/llms-components.txt` for offline use. Agents must read one of these copies and stop rather than inventing an ID or variable.

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
npx shadcn add @vanillasky/animation-utils
```

This installs source into your React project. It does not alter what the VanillaSky CLI renders.

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
