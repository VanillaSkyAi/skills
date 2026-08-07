# VideoConfig reference

> A VanillaSky video is one JSON file: an ordered list of scenes, each referencing a curated template by camelCase ID, plus video-level style and audio. The same config drives validation, Studio, preview, links, and export.

## Minimal config

```json
{
  "format": "launch",
  "orientation": "portrait",
  "style": {
    "font": "Inter",
    "preset": "bold",
    "brandKit": {
      "accent": "#6D5EF8",
      "secondary": "#F8B45E"
    }
  },
  "audio": { "trackId": "launch-sequence-alpha" },
  "scenes": [
    {
      "id": "s0",
      "templateId": "media",
      "variables": {
        "texts": "Ship it today",
        "mediaType": "gradient"
      },
      "timing": { "fixedDuration": 3 }
    }
  ]
}
```

`scenes` and `style.font` are required for portable configs. Portrait is the default orientation.

## Scenes

| Field | Description |
| --- | --- |
| `id` | A unique string such as `s0`. |
| `templateId` | A camelCase ID from the public registry, such as `media`, `bigNumber`, or `terminal`. Never guess it. |
| `variables` | Content matching that template's published variable schema. |
| `timing` | `{}` for the preferred duration, `fixedDuration` for stacked scenes, or an explicit `startTime` and `endTime`. |
| `textArchetype` | Optional treatment: `subtle`, `typewriter`, `wordStagger`, `slam`, `cinematic`, or `heroWord`. |
| `backgroundEffect` | Optional background motion supported by the selected template. |
| `componentSource` | Source for an ejected or custom scene whose `templateId` begins with `custom_`. |
| `customTemplate` | Serializable label, duration, variable schema, and defaults for a custom scene. Keeps its declared controls editable after save, share, and reopen. |

`textArchetype` and `backgroundEffect` are scene fields, not entries inside `variables`.

### Editable custom scenes

Custom scene code stays open-ended inside `componentSource`; it is not limited
to a closed scene-description language. Pair that source with `customTemplate`
so Studio can reconstruct the editing contract outside the authoring session:

```json
{
  "id": "s1",
  "templateId": "custom_product_flow",
  "variables": { "headline": "From issue to shipped fix" },
  "timing": { "fixedDuration": 4 },
  "componentSource": "function Component({ variables, progress }) { /* ... */ }",
  "customTemplate": {
    "label": "Product flow",
    "variableSchema": {
      "headline": { "type": "string", "label": "Headline", "required": true }
    },
    "defaultVariables": { "headline": "From issue to shipped fix" },
    "preferredDuration": 4,
    "usesGlobalTextEffect": true,
    "usesGlobalTransition": true,
    "usesGlobalBackgroundEffect": false
  }
}
```

The source owns the visual mechanism. `customTemplate` owns editor metadata;
it does not constrain the component's layout or animation. Configs created in
Studio receive this object automatically when they are saved.

## Timing

For the normal Studio workflow, give each scene its own duration:

```json
{ "timing": { "fixedDuration": 3 } }
```

The renderer stacks those scenes in order. Leaving `timing` empty uses the template's preferred duration:

```json
{ "timing": {} }
```

Explicit timelines use contiguous ranges:

```json
{ "timing": { "startTime": 0, "endTime": 3 } }
```

One scene's `endTime` must equal the next scene's `startTime`. When both modes are present, the explicit range wins.

There is no `timing.duration` field.

## Orientation

- `"portrait"` — 1080×1920, 9:16.
- `"landscape"` — 1920×1080, 16:9.

Templates respond to both orientations, but screenshots and copy still need visual inspection in the selected frame.

## Style and brand

`style.preset` sets the overall visual treatment:

| Preset | Use it for |
| --- | --- |
| `bold` | Launches, hype, and high-energy product moments. |
| `editorial` | Reviews, thoughtful updates, premium or B2B brands. |
| `stark` | Dev tools, technical claims, and high-contrast statements. |

Optional `style.density` values are `airy`, `normal`, and `packed`. Optional `style.motion` values are `calm`, `normal`, and `punchy`.

Brand tokens live inside `style.brandKit`:

```json
{
  "style": {
    "font": "Inter",
    "brandKit": {
      "accent": "#6D5EF8",
      "secondary": "#F8B45E",
      "text": "#FFFFFF",
      "logoDataUrl": "https://example.com/logo.png"
    }
  }
}
```

Setting `brandKit.bg` deliberately replaces generated gradients with a flat background. Repositories with a DESIGN.md can fill these values automatically; [brand documentation](https://vanillasky.ai/docs/brand) explains the mapping.

## Audio

Use a bundled track:

```json
{ "audio": { "trackId": "launch-sequence-alpha" } }
```

`vanillasky tracks` lists IDs, moods, energy, and durations. A shorter track loops; prefer one at least as long as the video. `audio.audioUrl` also accepts an HTTPS URL or local file path.

Audio failures warn and render silently rather than failing the entire video. Contact sheets are silent by design.

## Media

Prefer supplied assets, HTTPS URLs, or local file paths. `mediaKeyword` can search Pexels when `PEXELS_API_KEY` is configured. After composing, run `vanillasky resolve video.json`; it atomically pins every selected URL into `mediaUrl` before validation, making the handoff portable and rerenders deterministic. If a search fails, the config is left unchanged.

Avoid base64 media in configs intended for Watch or Studio links; the URL fragment can become too large.

Media is prefetched before a render. Unreachable URLs fail early rather than producing black scenes.

## Formats

The top-level `format` selects the story and validation contract:

| Format | Story shape | Scene budget |
| --- | --- | --- |
| `launch` | framing → comprehension → proof | 3–8 scenes, usually 5 |
| `review` | quote → attribution → outcome | 4–7 scenes, usually 5 |
| `milestone` | number → context → gratitude | 3–6 scenes, usually 4 |
| `update` | change → demonstration → benefit | 4–7 scenes, usually 5 |

The validator enforces scene counts, banned hooks, closer placement, and adjacent-scene variety. It reads the config's `format` automatically:

```bash
vanillasky validate video.json
```

The generated slot contracts live in `vanillasky/references/formats.md` in the public repository and come from the same definitions as the validator.

## Links

`vanillasky link video.json` prints zero-install Watch and Studio links. The config is encoded in the URL fragment and is not uploaded.

Use links for remote review. For a local agent handoff, prefer `vanillasky studio video.json`, which follows the file as it changes.
