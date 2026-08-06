/**
 * `vanillasky setup` — first-run onboarding.
 *
 * Inspects the current state (user config, Pexels key, DESIGN.md in the
 * repo above the cwd) and interactively prompts ONLY for what's missing;
 * every prompt is skippable with Enter. Writes ~/.vanillasky/config.json
 * as a merge — unknown keys in an existing config are never clobbered, and
 * a malformed config is backed up to config.json.bak, never overwritten in
 * place. Can also scaffold a spec-conformant DESIGN.md
 * (github.com/google-labs-code/design.md) at the repo root.
 *
 * `--check` prints the state without prompting (exit 0 either way) — the
 * agent-facing entry point; setup must never block a video.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { getPexelsApiKey, USER_CONFIG_PATH } from "./pexels.mjs";
import { designFromFile, findDesignMd, hasBrandTokens } from "./design-md.mjs";
import { loadTrackLibrary } from "./audio-library.mjs";

// ─── User config (~/.vanillasky/config.json) ────────────────────

/** Read the user config. Returns { config, exists, malformed }. */
export function readUserConfig(configPath = USER_CONFIG_PATH) {
  if (!existsSync(configPath)) return { config: {}, exists: false, malformed: false };
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { config: {}, exists: true, malformed: true };
    }
    return { config: parsed, exists: true, malformed: false };
  } catch {
    return { config: {}, exists: true, malformed: true };
  }
}

/**
 * Merge `updates` into the user config on disk and write it. Existing keys
 * not in `updates` (including keys this CLI doesn't know about) survive
 * untouched. A malformed existing file is renamed to config.json.bak first.
 * Returns the merged config.
 */
export function writeUserConfig(updates, { configPath = USER_CONFIG_PATH, log = console.error } = {}) {
  const { config, exists, malformed } = readUserConfig(configPath);
  if (malformed) {
    const bak = `${configPath}.bak`;
    renameSync(configPath, bak);
    log(`[vanillasky] ${configPath} was not valid JSON — moved it to ${bak} and starting fresh`);
  }
  const merged = { ...config, ...updates };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`);
  return { merged, existed: exists && !malformed };
}

// ─── State inspection ───────────────────────────────────────────

/** Gather everything setup cares about into one plain object. */
export function checkState({ env = process.env, configPath = USER_CONFIG_PATH, cwd = process.cwd() } = {}) {
  const { config, exists, malformed } = readUserConfig(configPath);
  const pexels = getPexelsApiKey({ env, configPath });
  const orientation = typeof config.defaultOrientation === "string" && config.defaultOrientation.trim()
    ? config.defaultOrientation.trim()
    : null;
  const musicMood = typeof config.musicMood === "string" && config.musicMood.trim()
    ? config.musicMood.trim()
    : null;
  const browser = typeof config.browser === "string" && config.browser.trim()
    ? config.browser.trim()
    : null;

  let designMd = null;
  const found = findDesignMd(cwd);
  if (found) {
    const { design, error } = designFromFile(found);
    designMd = { path: found, design: design && hasBrandTokens(design) ? design : null, error };
  }

  return { configPath, configExists: exists, configMalformed: malformed, config, pexels, orientation, musicMood, browser, cwd, designMd };
}

/** Render the state as human/agent-readable lines. */
export function formatCheck(state) {
  const lines = ["VanillaSky setup state", ""];
  const row = (label, value) => lines.push(`  ${label.padEnd(13)}${value}`);

  row("config", state.configExists
    ? `${state.configPath}${state.configMalformed ? "  (MALFORMED JSON — setup backs it up to config.json.bak before writing)" : ""}`
    : `not created yet (${state.configPath})`);

  row("pexels key", state.pexels
    ? `set (${state.pexels.source})`
    : "missing — mediaKeyword scenes fall back to brand gradients; free key at pexels.com/api");

  row("orientation", state.orientation ?? 'not set — derive or ask per video (a config without "orientation" renders portrait)');
  row("music mood", state.musicMood ?? "not set — pick per video with `vanillasky tracks`");
  row("browser", state.browser ?? 'system default — `vanillasky studio` opens wherever macOS/your desktop points http://, which may not be the browser you work in. Pin one with --browser or set "browser" here.');

  if (!state.designMd) {
    row("DESIGN.md", `none found from ${state.cwd} — \`vanillasky setup\` can generate one`);
  } else if (state.designMd.error) {
    row("DESIGN.md", `${state.designMd.path} — ${state.designMd.error}`);
  } else if (!state.designMd.design) {
    row("DESIGN.md", `${state.designMd.path} — parsed, but no usable color/typography tokens`);
  } else {
    const d = state.designMd.design;
    const bits = [
      d.accent && `accent ${d.accent}`,
      d.secondary && `secondary ${d.secondary}`,
      d.bg && `bg ${d.bg}`,
      d.font && `font ${d.font}`,
    ].filter(Boolean);
    row("DESIGN.md", `${state.designMd.path} — ${bits.join(", ")}`);
  }

  lines.push("");
  lines.push("Run `vanillasky setup` (no flags) to fill anything missing interactively — every prompt is skippable.");
  return lines;
}

// ─── DESIGN.md generation ───────────────────────────────────────

/** Normalize a user-typed color: bare hex gets a #; junk returns null. */
export function normalizeColor(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^[0-9a-fA-F]{3,8}$/.test(s) && [3, 4, 6, 8].includes(s.length)) return `#${s}`;
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(.+\)$/i.test(s)) return s;
  if (/^[a-zA-Z]+$/.test(s)) return s; // named color
  return null;
}

/** Loose URL detection so the accent prompt can accept "a URL to derive later". */
export function looksLikeUrl(input) {
  const s = String(input ?? "").trim();
  if (!s || /\s/.test(s) || s.startsWith("#")) return false;
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s);
}

/**
 * Build a spec-conformant DESIGN.md. With any of accent/secondary/bg/font
 * present, the tokens go live in the front matter; otherwise (URL-or-nothing
 * path) the front matter carries the name plus a commented scaffold to fill
 * in later. `bg` is intentionally omitted when not given — a background
 * token collapses gradient-led templates to a flat brand backdrop.
 */
export function generateDesignMd({ name, accent, secondary, bg, font, url } = {}) {
  const displayName = String(name ?? "").trim() || "Brand";
  const hasTokens = Boolean(accent || secondary || bg || font);
  const fm = ["---", `name: ${displayName}`];

  if (hasTokens) {
    if (accent || secondary || bg) {
      fm.push("colors:");
      if (accent) fm.push(`  primary: "${accent}"`);
      if (secondary) fm.push(`  secondary: "${secondary}"`);
      if (bg) fm.push(`  background: "${bg}"`);
      else fm.push("  # background omitted on purpose — setting it collapses generated brand gradients to a flat backdrop");
    }
    if (font) {
      fm.push("typography:", "  body:", `    fontFamily: ${font}`);
    }
  } else {
    fm.push(
      url
        ? `# TODO: derive these tokens from ${url}, then fill in and uncomment:`
        : "# TODO: fill in and uncomment:",
      "# colors:",
      '#   primary: "#RRGGBB"',
      '#   secondary: "#RRGGBB"',
      '#   background: "#RRGGBB"   # omit to keep generated brand gradients',
      "# typography:",
      "#   body:",
      "#     fontFamily: Inter",
    );
  }
  fm.push("---");

  const body = [
    "",
    `# ${displayName} design`,
    "",
    hasTokens
      ? `Brand tokens for ${displayName}. VanillaSky merges the front matter above into every video rendered from this repo — colors.primary becomes the accent, typography the font. Config-explicit values always win; opt out per render with \`--no-design-md\`.`
      : `Scaffolded by \`vanillasky setup\`${url ? ` — derive the palette and font from ${url}` : ""}. Fill in and uncomment the front matter tokens above; until then videos render with generated brand gradients. \`vanillasky brand\` shows what applies.`,
    "",
  ];

  return [...fm, ...body].join("\n");
}

/** Repo root for the DESIGN.md scaffold: nearest ancestor with .git, else the cwd itself. */
export function findRepoRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir);
    dir = parent;
  }
}

// ─── Interactive command ────────────────────────────────────────

const ORIENTATIONS = { p: "portrait", portrait: "portrait", l: "landscape", landscape: "landscape" };

/**
 * `vanillasky setup [--check]`. All I/O injectable for tests; piped stdin
 * works — when input ends early, remaining questions resolve as skipped.
 */
export async function setupCommand({
  check = false,
  env = process.env,
  configPath = USER_CONFIG_PATH,
  cwd = process.cwd(),
  input = process.stdin,
  output = process.stdout,
  log = console.log,
} = {}) {
  if (check) {
    for (const line of formatCheck(checkState({ env, configPath, cwd }))) log(line);
    return 0;
  }

  const state = checkState({ env, configPath, cwd });
  // Not rl.question: with piped stdin every line arrives at once, and lines
  // emitted while no question is pending are dropped. Queue them instead —
  // an answered-then-EOF stream resolves the remaining questions as skips.
  const interactive = Boolean(input.isTTY);
  const rl = createInterface({ input, output, terminal: interactive });
  const bufferedLines = [];
  const waiters = [];
  let closed = false;
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else bufferedLines.push(line);
  });
  rl.on("close", () => {
    closed = true;
    for (const waiter of waiters.splice(0)) waiter("");
  });
  const ask = async (question) => {
    output.write(question);
    const line = bufferedLines.length
      ? bufferedLines.shift()
      : closed ? "" : await new Promise((resolveLine) => waiters.push(resolveLine));
    if (!interactive) output.write(`${line}\n`);
    return String(line).trim();
  };

  try {
    log("VanillaSky setup — press Enter to skip any question; nothing here is required.\n");
    if (state.configMalformed) {
      log(`Heads up: ${configPath} is not valid JSON — it will be backed up to config.json.bak before writing.\n`);
    }

    const updates = {};

    if (!state.pexels) {
      const key = await ask("Pexels API key — free at pexels.com/api; unlocks stock footage for mediaKeyword scenes [skip]: ");
      if (key) updates.pexelsApiKey = key;
    } else {
      log(`Pexels key: already set (${state.pexels.source}).`);
    }

    if (!state.orientation) {
      const raw = (await ask("Default orientation (portrait/landscape) [skip]: ")).toLowerCase();
      if (raw) {
        const orientation = ORIENTATIONS[raw];
        if (orientation) updates.defaultOrientation = orientation;
        else log(`  "${raw}" isn't portrait or landscape — skipped.`);
      }
    } else {
      log(`Default orientation: already set (${state.orientation}).`);
    }

    if (!state.musicMood) {
      const { tracks } = loadTrackLibrary();
      const moods = [...new Set(tracks.flatMap((t) => (Array.isArray(t.moods) ? t.moods : [])))];
      const hint = moods.length ? ` (bundled tracks cover: ${moods.join(", ")})` : "";
      const mood = await ask(`Preferred music mood${hint} [skip]: `);
      if (mood) updates.musicMood = mood;
    } else {
      log(`Music mood: already set (${state.musicMood}).`);
    }

    if (Object.keys(updates).length > 0) {
      const { existed } = writeUserConfig(updates, { configPath, log });
      log(`\n${existed ? "Updated" : "Wrote"} ${configPath} (${Object.keys(updates).join(", ")}${existed ? " merged in — other keys untouched" : ""}).`);
    } else {
      log("\nNo config changes.");
    }

    if (!state.designMd) {
      log("\nNo DESIGN.md found in this repo — one makes every video on-brand automatically.");
      const yes = (await ask("Generate a DESIGN.md now? [y/N]: ")).toLowerCase();
      if (yes === "y" || yes === "yes") {
        const repoRoot = findRepoRoot(cwd);
        const name = basename(repoRoot);
        const first = await ask("  Accent (primary) color — hex, or a product URL to derive the palette from later [skip]: ");
        let doc;
        if (looksLikeUrl(first)) {
          doc = generateDesignMd({ name, url: first });
          log(`  Scaffolding with commented tokens — derive them from ${first} later.`);
        } else {
          const accent = normalizeColor(first);
          if (first && !accent) log(`  "${first}" doesn't look like a color — skipped.`);
          const secondary = normalizeColor(await ask("  Secondary color [skip]: "));
          const bg = normalizeColor(await ask("  Background color (skip to keep generated brand gradients) [skip]: "));
          const font = (await ask("  Brand font family (e.g. Inter) [skip]: ")) || null;
          doc = generateDesignMd({ name, accent, secondary, bg, font });
        }
        const target = join(repoRoot, "DESIGN.md");
        writeFileSync(target, doc);
        log(`  Wrote ${target} — \`vanillasky brand\` shows what renders will apply.`);
      }
    } else {
      log(`\nDESIGN.md: found at ${state.designMd.path} — leaving it alone.`);
    }

    log("");
    for (const line of formatCheck(checkState({ env, configPath, cwd }))) log(line);
    return 0;
  } finally {
    if (!closed) rl.close();
  }
}
