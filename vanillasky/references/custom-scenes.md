# Custom scenes

Read this only after a built-in template and its full variable schema cannot
express the brief. A custom scene is a rare escape hatch, not the default path.

## Escalation ladder

1. **Template as-is** — replace defaults with purpose-written copy.
2. **Adjust variables** — read `registry/r/<id>.json` for the complete schema.
3. **Eject** — create a `custom_*` scene with `componentSource`, based on a
   registry item's source.
4. **Compose from scope** — use sandbox primitives such as `CountUpNumber`,
   `TweetCard`, or `PhoneFrame` inside a custom body.

For an ejected scene, record its origin:

```json
{
  "item": "bigNumber",
  "version": "<registry version>",
  "sourceHash": "<source hash>",
  "ejectedAt": "<ISO date>"
}
```

`vanillasky diff <config>` uses this provenance to report upstream changes.
An ejected scene without origin metadata is an anonymous fork.

## Component contract

`componentSource` is a function body compiled in a sandbox, not a module. It
must contain exactly one `function Component({ ... })` and stay below 16,000
characters.

Every frame receives:

| Prop | Meaning |
|---|---|
| `progress` | 0→1 across the scene; drive positional animation from it |
| `width`, `height` | output dimensions; size from `Math.min(width, height)` |
| `sceneDuration` | seconds; convert seconds-based phases through it |
| `beatIntensity` | 0→1 accent pulse; never use it for layout |
| `safeZone` | platform-aware insets for critical content |
| `tokens` | resolved brand colour and typography tokens |
| `style`, `variables` | raw config when tokens do not cover the need |

Use `tokens.accent`, `secondary`, `surface`, `surface_elevated`, `content`,
`muted`, `font`, and `script_font`; do not hardcode a generic palette or font
stack.

Registry source exports named TypeScript templates with imports. It will not
work verbatim as `componentSource`; reshape it into the sandbox contract.

## Sandbox rules

- No `import` or `export`.
- Inline `style` only; no `className`, external CSS, or CSS `filter`.
- Deterministic motion only: no `Math.random`, `Date.now`, `setTimeout`, or
  `requestAnimationFrame`.
- The body does not paint the global background or repeat the main title; the
  frame around it already owns background, title, and safe zones.
- Use helpers and primitives reported by `vanillasky scope`. Most primitives
  occupy the whole frame, so normally use one per scene and compose around it.

The sandbox provides React helpers, motion functions, color utilities, text
fitting, and registered primitives as globals. `motion-api.md` is the generated
API reference; do not rely on remembered names.

## Required reading and verification

Before writing custom source, read:

- `motion.md` for timebase, phase grammar, reading time, and cut continuity.
- `visual-rules.md` for typography, orientation layout, colour, and composition.
- `motion-api.md` for exact globals and call shapes.

Run `vanillasky validate` until every sandbox error is resolved. A contact sheet
is necessary but insufficient for custom motion: open Studio and watch the
entrance, readable hold, emphasis, exit, and transition into the next scene.

## shadcn installation is separate

`npx shadcn add @vanillasky/<id>` installs source into a React project whose
`components.json` maps the namespace described in the catalog. It does not
change what the VanillaSky CLI renders. Use `componentSource` to customize a
scene in a video config.
