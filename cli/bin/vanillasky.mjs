#!/usr/bin/env node
import { parseArgs } from "node:util";
import { renderCommand } from "../lib/render.mjs";
import { validateCommand, registryData } from "../lib/validate.mjs";
import { loadConfig, encodeConfig, MAX_USABLE_FRAGMENT, hasInlineMedia } from "../lib/config.mjs";
import { brandCommand } from "../lib/design-md.mjs";
import { tracksCommand } from "../lib/audio-library.mjs";
import { setupCommand } from "../lib/setup.mjs";
import { studioCommand } from "../lib/studio.mjs";
import { diffCommand } from "../lib/diff.mjs";

const HELP = `vanillasky — validate, render, and share VanillaSky video configs locally

Usage:
  vanillasky setup [--check]
  vanillasky render <config.json> [options]
  vanillasky studio <config.json> [--no-open] [--fps <n>]
  vanillasky validate <config.json> [--json] [--format <id>]
  vanillasky diff <config.json> [--json]
  vanillasky tracks [--json]
  vanillasky scope [--json]
  vanillasky brand [path] [--json]
  vanillasky link <config.json> [--base <url>]

Setup options:
  --check          Print the current setup state (config, Pexels key, default
                   orientation, music mood, DESIGN.md) without prompting

Render options:
  --out <path>     Output path (default ./video.mp4; --frame → PNG; --sheet → directory)
  --fps <n>        Frames per second (default 30)
  --scale <0..1>   Resolution scale, 1 = full resolution (default 1;
                   1080x1920 portrait / 1920x1080 landscape, per the
                   config's "orientation" — portrait when omitted)
  --frame <sec>    Render a single frame at <sec> as a PNG and exit (~2s)
  --sheet          Contact sheet: 5 evenly-spaced PNGs per scene + composited sheet.png
  --draft          Fast in-browser WebCodecs export (fixed 30fps, full resolution)
  --pages <n>      Parallel browser pages for the full render (default 4)
  --no-validate    Skip config validation before rendering
  --no-design-md   Don't merge DESIGN.md brand tokens (render/validate)
  --no-pexels      Don't auto-resolve mediaKeyword via the Pexels API
                   (auto-resolution needs PEXELS_API_KEY, from the env or
                   ~/.vanillasky/config.json { "pexelsApiKey": "..." })
  --open           Open the finished MP4 with the platform viewer (best-effort)
  --base <url>     Host for the Watch/Studio links in the completion block
                   (default https://vanillasky.ai)

Studio options:
  --no-open        Print the URL instead of opening a browser

Validate options:
  --json           Machine-readable JSON output
  --format <id>    Enforce a format's slot contract (e.g. launch);
                   defaults to the config's "format" field when present

Diff options:
  --json           Machine-readable JSON output

Link options:
  --base <url>     Host for the render link (default https://vanillasky.ai)

Examples:
  vanillasky setup --check
  vanillasky validate video.json --format launch
  vanillasky render video.json
  vanillasky render video.json --frame 1.2 --out check.png   # pick a mid-scene time, not a scene boundary
  vanillasky tracks
  vanillasky scope                                            # globals a custom_ scene can use
  vanillasky brand
  vanillasky link video.json --base http://localhost:8090

setup interactively fills in only what's missing — Pexels key, default
orientation, music mood (every prompt skippable, merged into
~/.vanillasky/config.json) — and offers to scaffold a DESIGN.md for the
current repo. validate checks structure, template ids, per-template variable schemas, and
format slot-contract rules; render runs it automatically and refuses invalid
configs. tracks lists the bundled audio library (use a track via
"audio": { "trackId": "<id>" }). link prints a zero-install browser-render
URL (<base>/render#config=<base64url>).

DESIGN.md: when the repo root above the config file carries a DESIGN.md
(github.com/google-labs-code/design.md), render and validate merge its tokens
into the config — colors.primary → brandKit.accent, colors.secondary →
secondary, colors.background/surface → bg, first typography fontFamily →
style.font. Config-explicit values always win. The cwd is only a fallback
for configs with no brandKit of their own (and is logged loudly).
brand [path] shows what would apply; --no-design-md opts out.`;

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(HELP);
  process.exit(cmd ? 0 : 1);
}

const COMMANDS = ["setup", "render", "studio", "validate", "diff", "tracks", "brand", "link", "scope"];
if (!COMMANDS.includes(cmd)) {
  console.error(`Unknown command "${cmd}" — expected one of: ${COMMANDS.join(", ")}.\n`);
  console.error(HELP);
  process.exit(1);
}

let values, positionals;
try {
  ({ values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      fps: { type: "string" },
      scale: { type: "string" },
      frame: { type: "string" },
      sheet: { type: "boolean" },
      draft: { type: "boolean" },
      pages: { type: "string" },
      "no-validate": { type: "boolean" },
      "no-design-md": { type: "boolean" },
      "no-pexels": { type: "boolean" },
      json: { type: "boolean" },
      format: { type: "string" },
      base: { type: "string" },
      open: { type: "boolean" },
      "no-open": { type: "boolean" },
      check: { type: "boolean" },
    },
  }));
} catch (err) {
  console.error(`${err.message}\n`);
  console.error(HELP);
  process.exit(1);
}

if (cmd === "setup") {
  process.exit(await setupCommand({ check: Boolean(values.check) }));
}

if (cmd === "brand") {
  process.exit(brandCommand(positionals[0] ?? ".", { json: Boolean(values.json) }));
}

if (cmd === "tracks") {
  process.exit(tracksCommand({ json: Boolean(values.json) }));
}

// The exact global surface a `custom_*` scene's componentSource can reach.
// Custom source has no imports — everything below is already in scope — so
// this list is the difference between composing and guessing.
if (cmd === "scope") {
  const { customScene } = registryData;
  if (values.json) {
    console.log(JSON.stringify(customScene.scopeNames, null, 2));
  } else {
    console.log(
      `componentSource globals (${customScene.scopeNames.length}) — no imports needed or allowed:\n`,
    );
    // A flat list of names is not discoverable — an agent hand-rolls its own
    // stagger while staggerWindow sits unused. Print what each thing is FOR.
    const docs = customScene.scopeDocs ?? {};
    const documented = Object.keys(docs);
    if (documented.length > 0) {
      console.log("Authoring vocabulary — reach for these before hand-rolling:\n");
      for (const name of documented) {
        console.log(`  ${name}`);
        console.log(`      ${docs[name].sig}`);
        console.log(`      ${docs[name].use}\n`);
      }
      const rest = customScene.scopeNames.filter((n) => !docs[n]);
      console.log(`Also in scope (React runtime + registry primitives — see the agent index for props):\n`);
      console.log(`  ${rest.join(", ")}\n`);
    } else {
      console.log(customScene.scopeNames.join(", "));
    }
    console.log(
      `\nBody-only: gradientBackground, TitleTop and TitleCenter are deliberately NOT in scope —\n` +
        `the frame renders the background and title around your body.\n` +
        `Max source: ${customScene.maxSourceChars} chars. Must declare exactly one \`function Component(...)\`.`,
    );
  }
  process.exit(0);
}

const configPath = positionals[0];
if (!configPath) {
  console.error(`Missing config path.\n\nUsage: vanillasky ${cmd} <config.json> [options]`);
  process.exit(1);
}

if (cmd === "validate") {
  process.exit(validateCommand(configPath, {
    json: Boolean(values.json),
    format: values.format,
    designMd: !values["no-design-md"],
    pexels: !values["no-pexels"],
  }));
}

if (cmd === "link") {
  try {
    const config = loadConfig(configPath);
    const base = (values.base ?? "https://vanillasky.ai").replace(/\/+$/, "");
    const b64 = encodeConfig(config);
    const inline = hasInlineMedia(config);
    if (inline || b64.length > MAX_USABLE_FRAGMENT) {
      console.error(
        `[vanillasky] error: this config is ${(b64.length / 1024).toFixed(0)}KB in a URL — no shareable link.\n` +
        (inline
          ? `  It embeds media as data: URLs. Reference that media by https URL or a local file path.`
          : `  Trim it below ${MAX_USABLE_FRAGMENT / 1024}KB to get a shareable link.`),
      );
      process.exit(1);
    }
    console.log(`${base}/render#config=${b64}`);
    console.log(`${base}/create#config=${b64}`);
    process.exit(0);
  } catch (err) {
    console.error(`[vanillasky] error: ${err?.message ?? err}`);
    process.exit(1);
  }
}

if (cmd === "diff") {
  process.exit(diffCommand(configPath, { json: Boolean(values.json) }));
}

const num = (name, raw, def) => {
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.error(`--${name} must be a number (got "${raw}")`);
    process.exit(1);
  }
  return n;
};

if (cmd === "studio") {
  try {
    await studioCommand(configPath, { open: !values["no-open"], fps: num("fps", values.fps, 30) });
    process.exit(0);
  } catch (err) {
    console.error(`[vanillasky] error: ${err?.message ?? err}`);
    process.exit(1);
  }
}


try {
  await renderCommand(configPath, {
    out: values.out,
    fps: num("fps", values.fps, 30),
    scale: num("scale", values.scale, 1),
    frame: values.frame !== undefined ? num("frame", values.frame, 0) : undefined,
    sheet: Boolean(values.sheet),
    draft: Boolean(values.draft),
    pages: num("pages", values.pages, 4),
    validate: !values["no-validate"],
    designMd: !values["no-design-md"],
    pexels: !values["no-pexels"],
    base: values.base,
    open: Boolean(values.open),
  });
} catch (err) {
  console.error(`\n[vanillasky] error: ${err?.message ?? err}`);
  process.exit(1);
}
