# Scene authoring libraries

> Five public libraries cover the complete scene-authoring path: config, theme, motion, typography, and backgrounds. Templates use them underneath; custom scenes and React projects can use the same vocabulary directly.

Browse the animated catalog at [vanillasky.ai/libs](https://vanillasky.ai/libs). The catalog and registry metadata are generated from the same library manifest, so names, dependencies, exports, and examples stay aligned.

## Start with your context

### I am making a VanillaSky video

You usually do not need to install or import a library. Pick finished scene templates, set their variables, and review the result in Studio. The libraries explain the system underneath, but templates remain the fastest and most reliable path.

### I am writing a custom scene

`componentSource` is a sandbox function body, not a module. Do not add imports. Run `vanillasky scope` to see the exact helpers available as globals, then use the motion, theme, and typography vocabulary listed there. The trusted frame owns the global background and title.

### I am building in React

Install the source through the shadcn-compatible registry. Each public entrypoint includes its implementation files and declares its library dependencies, which shadcn resolves automatically.

## The five libraries

| Library | Owns | Direct dependencies |
| --- | --- | --- |
| `video-config` | Video, scene, timing, style, dimensions, safe zones, validation | none |
| `theme` | Brand tokens, presets, density, motion tone, color and contrast | `video-config` |
| `motion` | Interpolation, easing, springs, phases, composed effects | none |
| `typography` | Text fitting, formatting, kinetic lifecycles, duration planning | `motion` |
| `backgrounds` | Brand backdrops and continuous background transforms | `theme`, `motion` |

Two foundations stay independent: `video-config` defines the data contract and `motion` defines deterministic change over time. `theme` resolves appearance from the config. `typography` and `backgrounds` compose the foundations into scene-level capabilities.

## Install into a React project

Map the namespace once in `components.json`:

```json
{
  "registries": {
    "@vanillasky": "https://vanillasky.ai/r/{name}.json"
  }
}
```

Then install the capability you need:

```bash
npx shadcn add @vanillasky/motion
npx shadcn add @vanillasky/typography
npx shadcn add @vanillasky/backgrounds
```

This copies readable TypeScript source into your project; it does not add an opaque VanillaSky runtime package. Installing `backgrounds`, for example, also installs its declared `theme` and `motion` dependencies.

## Use stable entrypoints

Import from the five public facades rather than their implementation files:

```tsx
import { type VideoConfig, getDimensions } from "@/vanillasky/video-config";
import { resolveTokens, autoTextColor } from "@/vanillasky/theme";
import { phase, spring, SPRING_CRISP } from "@/vanillasky/motion";
import { fitTextSize, renderArchetype } from "@/vanillasky/typography";
import { gradientBackground, getBackgroundTransform } from "@/vanillasky/backgrounds";
```

Files such as `animation-utils.ts`, `tokens.ts`, and `text-archetypes.ts` are implementation modules shipped behind those facades. They are not separate public libraries.

## Deterministic rendering rules

Every renderable animation is a pure function of scene progress and inputs:

- drive motion from `progress`, never timers or CSS transitions;
- use seeded helpers instead of `Math.random`;
- use inline styles and avoid CSS `filter` in captured scenes;
- resolve brand values through `theme` instead of hardcoding fallback colors;
- use `fitTextSize` for text in fixed-width containers;
- keep background transforms on the background layer, not on the text layer.

## Registry source and exact API

Every library is available at `https://vanillasky.ai/r/<name>.json`. The item contains its source files, direct registry dependencies, and scene-authoring metadata. The generated skill reference at `skill/vanillasky/references/libraries.md` lists the exact grouped exports for agents and is rebuilt from the same manifest as the website catalog.

Installing source into a React app does not change an existing VanillaSky video. To customize a rendered scene, edit its variables in Studio or use an ejected `componentSource` scene.
