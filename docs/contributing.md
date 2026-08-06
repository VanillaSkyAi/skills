# Contributing to VanillaSky

> The public registry is a shared catalog. Contribute a template, primitive, track, fixture, or documentation improvement once, and it can reach every agent using the next VanillaSky release.

## What can be contributed

| Artifact | Registry type | Acceptance bar |
| --- | --- | --- |
| Scene template | `registry:block` | Fills a real gap, follows template constraints, and passes export QA. |
| Motion primitive | `registry:lib` API | Has a clear composition use and belongs in the documented custom-scene sandbox. |
| Music track | Manifest entry | Includes complete metadata and verified redistribution rights. |
| Format definition | `registry:file` | Represents a distinct story contract with a composition rationale. |
| Docs, fixtures, bugs | — | Clear, reproducible, and useful to public users. |

## Where contributions start

The public [VanillaSkyAi/skills](https://github.com/VanillaSkyAi/skills) repository is a generated release snapshot. Open an issue or pull request there; it is the public front door.

Accepted work is ported into the canonical source tree by a maintainer. Authorship is preserved in the registry item's `author` metadata and release notes, with a link back to the original contribution.

## Contribute a template

1. **Find a real gap.** Start from an open “template wanted” issue or a brief the existing catalog could not express.
2. **Use the nearest exemplar.** Registry items include full source so you can begin from a proven scene rather than a blank file.
3. **Follow the render contract.** Use inline styles, deterministic progress-driven animation, and orientation-aware sizing. Avoid CSS filters, requestAnimationFrame, and CSS transitions.
4. **Define the schema.** Include use-when guidance, category, preferred duration, defaults, and exact variable types.
5. **Prove the output.** Add boundary fixtures and inspect real rendered frames in both orientations.
6. **Open the contribution.** Include the source, fixtures, registry metadata, and the brief that demonstrates the gap.

The generator rejects items without agent-facing guidance. Lint and unit tests are necessary, but visual inspection of exported frames is the real acceptance test.

## Contribute music

A track needs title, artist, license, mood, energy, duration, hosted asset, and verified redistribution rights. Rights verification happens before inclusion—without exception.

## Improve documentation

The Markdown files in `docs/` in the public repository are the exact source rendered at [vanillasky.ai/docs](https://vanillasky.ai/docs). A documentation fix therefore improves both GitHub and the website in the same release.

Good first contributions include:

- correcting a confusing workflow;
- adding a tested example config;
- clarifying a template schema;
- documenting a reproducible browser or ffmpeg issue;
- improving cross-links between a guide and its registry source.
