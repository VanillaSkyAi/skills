# Brand and DESIGN.md

> VanillaSky can inherit colors and typography from a repository's DESIGN.md, or you can set a brand kit directly in VideoConfig or Studio. Config-explicit choices always win.

## VideoConfig brand kit

Brand values live under `style.brandKit`:

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

- `accent` is the primary brand color.
- `secondary` supplies the second half of generated gradients.
- `text` optionally overrides foreground text.
- `bg` deliberately forces a solid background.
- `logoDataUrl` accepts a fetchable URL or data URL.

Keeping `accent` and `secondary` distinct preserves the generated mesh and gradient treatments. Setting them equal produces a flatter result.

## DESIGN.md ingestion

VanillaSky walks upward from the config file using git-style discovery and reads the nearest [DESIGN.md](https://github.com/google-labs-code/design.md).

| DESIGN.md token | VideoConfig field |
| --- | --- |
| `colors.primary` | `style.brandKit.accent` |
| `colors.secondary` | `style.brandKit.secondary` |
| `colors.background` or `colors.surface` | `style.brandKit.bg` |
| first typography `fontFamily` | `style.font` |

Inspect the resolved result before rendering:

```bash
vanillasky brand
vanillasky brand ./path --json
```

## Precedence

Values resolve in this order:

1. explicit values in `video.json`;
2. the nearest DESIGN.md;
3. VanillaSky defaults.

The working directory is only a logged fallback when the config's own directory tree has no DESIGN.md and the config declares no brand kit. An unrelated repository cannot silently override an explicitly branded config.

Opt out for one command with `--no-design-md`:

```bash
vanillasky validate video.json --no-design-md
vanillasky render video.json --sheet --out ./sheet --no-design-md
```

A malformed DESIGN.md produces a warning and is skipped; it never blocks a video.

## Studio

Studio exposes font, accent, secondary color, background, logo, and orientation controls. Changes save directly into `video.json`, so later agent or CLI work sees the same brand state.

Open the file with:

```bash
vanillasky studio video.json
```

## Fonts

The CLI bundle includes the Google font families offered by Studio. Those families render consistently offline. Unknown families fall back to system fonts.

Always inspect text after changing fonts: width and line breaks are part of the composition, not merely decoration.
