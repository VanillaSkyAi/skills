/**
 * DESIGN.md ingestion — Google Labs' open design-token spec
 * (github.com/google-labs-code/design.md): YAML front matter with
 * colors/typography/rounded/spacing tokens + markdown rationale.
 *
 * Repos that carry one get on-brand videos automatically: render/validate
 * walk up from the config file to the repo root — like git discovers .git —
 * and merge the tokens into the config's style/brandKit. The cwd is only a
 * fallback, and only for configs with no brandKit of their own (brand-bleed
 * guard: rendering someone else's config from inside your repo must not
 * silently restyle it); a cwd-sourced merge is called out loudly.
 * Precedence: config-explicit values > DESIGN.md > defaults.
 *
 * Mapping (alpha spec — parse only what's clearly present, ignore the rest):
 *   colors.primary                → style.brandKit.accent
 *   colors.secondary              → style.brandKit.secondary
 *   colors.background ?? .surface → style.brandKit.bg
 *   first typography fontFamily   → style.font (first family in a comma list)
 *   rounded                       → parsed + reported only (future radius token)
 *
 * A malformed file warns and is skipped — DESIGN.md can never fail a
 * render or validation.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ─── Discovery (git-style upward walk) ──────────────────────────

/**
 * Walk up from `startDir` looking for DESIGN.md. Stops after checking a
 * repo root (a directory containing .git) or the filesystem root.
 */
export function findDesignMd(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, "DESIGN.md");
    if (existsSync(candidate)) return candidate;
    if (existsSync(join(dir, ".git"))) return null; // repo root without one — don't wander above the repo
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** True when the config already declares any brandKit color of its own. */
export function configHasBrandKit(config) {
  const style = isPlainObject(config) && isPlainObject(config.style) ? config.style : null;
  const kit = style && isPlainObject(style.brandKit) ? style.brandKit : null;
  return Boolean(kit && ["accent", "secondary", "bg"].some((k) => typeof kit[k] === "string" && kit[k].trim()));
}

// ─── Front-matter parsing (defensive mini-YAML subset) ──────────

const stripQuotes = (s) =>
  s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    ? s.slice(1, -1)
    : s;

function parseScalar(raw) {
  let s = raw.trim();
  if (s.startsWith('"') || s.startsWith("'")) return stripQuotes(s);
  // Unquoted: strip trailing YAML comments — but a leading # is almost
  // certainly an unquoted hex color (common authoring slip), keep it.
  if (!s.startsWith("#")) s = s.replace(/\s+#.*$/, "").trim();
  return s;
}

/**
 * Parse the YAML front matter between the leading and closing `---` into a
 * plain nested object of string leaves. Nested maps come from indentation;
 * lists, block scalars, and unparseable lines are skipped (alpha spec —
 * only clearly-present `key: value` structure is consumed).
 * Returns { data, error } — data is null when the file has no usable
 * front matter at all.
 */
export function parseFrontMatter(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { data: null, error: "no YAML front matter (file must start with ---)" };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "---" || t === "...") { end = i; break; }
  }
  if (end === -1) return { data: null, error: "unterminated YAML front matter (missing closing ---)" };

  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const rawLine of lines.slice(1, end)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("- ") || trimmed === "-") continue;
    const lead = rawLine.match(/^[\t ]*/)[0];
    const indent = lead.replace(/\t/g, "  ").length;
    const m = trimmed.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:(.*)$/);
    if (!m) continue; // not key:value shaped — skip, never fail
    const key = stripQuotes(m[1].trim());
    const rest = m[2].trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (rest === "" || rest === "|" || rest === ">") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = parseScalar(rest);
    }
  }
  return { data: root, error: null };
}

// ─── Token extraction + mapping ─────────────────────────────────

/** Accept only values that plausibly are CSS colors. */
function colorish(v) {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(.+\)$/i.test(s)) return s;
  if (/^[a-zA-Z]+$/.test(s)) return s; // named color
  return undefined;
}

/**
 * Map parsed front matter to VanillaSky brand tokens.
 * Returns { name, accent, secondary, bg, bgSource, font, fontSource, rounded }
 * — every field optional; `rounded` is a human summary, not yet consumed.
 */
export function extractDesign(data) {
  const design = {};
  if (!isPlainObject(data)) return design;
  if (typeof data.name === "string" && data.name) design.name = data.name;

  const colors = isPlainObject(data.colors) ? data.colors : {};
  const accent = colorish(colors.primary);
  if (accent) design.accent = accent;
  const secondary = colorish(colors.secondary);
  if (secondary) design.secondary = secondary;
  for (const key of ["background", "surface"]) {
    const bg = colorish(colors[key]);
    if (bg) { design.bg = bg; design.bgSource = key; break; }
  }

  const typography = isPlainObject(data.typography) ? data.typography : {};
  for (const [token, val] of Object.entries(typography)) {
    const family = isPlainObject(val) ? val.fontFamily : undefined;
    if (typeof family === "string" && family.trim()) {
      design.font = family.split(",")[0].trim();
      design.fontSource = token;
      break;
    }
  }

  if (isPlainObject(data.rounded)) {
    const entries = Object.entries(data.rounded).filter(([, v]) => typeof v === "string" && v);
    if (entries.length) design.rounded = entries.map(([k, v]) => `${k} ${v}`).join(", ");
  }

  return design;
}

export const hasBrandTokens = (design) =>
  Boolean(design && (design.accent || design.secondary || design.bg || design.font));

/** Read + parse + extract one DESIGN.md. Returns { design, error }. */
export function designFromFile(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return { design: null, error: `cannot read ${filePath}` };
  }
  const { data, error } = parseFrontMatter(text);
  if (error) return { design: null, error };
  return { design: extractDesign(data), error: null };
}

// ─── Merge into a VideoConfig ───────────────────────────────────

/**
 * Merge DESIGN.md tokens into config.style / config.style.brandKit.
 * Config-explicit values always win. Mutates config.
 * Returns { applied, kept } — human fragments like "accent #B8422E".
 */
export function applyDesignToConfig(config, design) {
  const applied = [];
  const kept = [];
  if (!isPlainObject(config) || !hasBrandTokens(design)) return { applied, kept };

  if (!isPlainObject(config.style)) config.style = {};
  const style = config.style;

  if (design.font) {
    if (typeof style.font === "string" && style.font.trim()) kept.push("font");
    else { style.font = design.font; applied.push(`font ${design.font}`); }
  }

  const wanted = [
    ["accent", design.accent],
    ["secondary", design.secondary],
    ["bg", design.bg],
  ].filter(([, v]) => v);
  if (wanted.length) {
    if (!isPlainObject(style.brandKit)) style.brandKit = {};
    const kit = style.brandKit;
    for (const [field, value] of wanted) {
      if (typeof kit[field] === "string" && kit[field].trim()) kept.push(field);
      else { kit[field] = value; applied.push(`${field} ${value}`); }
    }
  }

  return { applied, kept };
}

/**
 * The full render/validate hook: discover, parse, merge, narrate.
 * Never throws; malformed or token-free files warn and skip.
 *
 * Discovery: the config file's own directory tree first. The cwd is only a
 * fallback for configs that declare no brandKit themselves — a branded
 * config rendered from inside an unrelated repo must not pick up that
 * repo's DESIGN.md — and any cwd-sourced merge is logged prominently.
 *
 * Returns { path, applied, kept } or null when nothing was found/usable.
 */
export function mergeDesignMdIntoConfig(configPath, config, { log = console.error } = {}) {
  const configDir = dirname(resolve(configPath));
  let found = findDesignMd(configDir);
  let viaCwd = false;
  if (!found) {
    const cwdHit = findDesignMd(process.cwd());
    if (cwdHit) {
      if (configHasBrandKit(config)) {
        log(`[vanillasky] DESIGN.md at ${cwdHit} (found via the current directory) NOT applied — the config already declares a brandKit and its own directory tree has no DESIGN.md. Move the config into that repo (or copy the tokens into the config) to opt in.`);
        return null;
      }
      found = cwdHit;
      viaCwd = true;
    }
  }
  if (!found) return null;
  const { design, error } = designFromFile(found);
  if (error) {
    log(`[vanillasky] DESIGN.md at ${found}: ${error} — continuing without it`);
    return null;
  }
  if (!hasBrandTokens(design)) {
    log(`[vanillasky] DESIGN.md at ${found}: no usable color/typography tokens — continuing without it`);
    return null;
  }
  const { applied, kept } = applyDesignToConfig(config, design);
  if (viaCwd) {
    log(`[vanillasky] NOTE: applying DESIGN.md from the CURRENT DIRECTORY (${found}), not the config's own directory tree (${configDir} has none) — pass --no-design-md if this brand doesn't belong to this video`);
  }
  const parts = [];
  if (applied.length) parts.push(applied.join(", "));
  if (kept.length) parts.push(`config overrides kept: ${kept.join(", ")}`);
  log(`[vanillasky] DESIGN.md found (${found}): ${parts.join(" — ") || "nothing to apply"}`);
  if (design.rounded) {
    log(`[vanillasky] DESIGN.md rounded tokens (${design.rounded}) parsed but not yet consumed — future radius token`);
  }
  return { path: found, applied, kept };
}

// ─── `vanillasky brand [path]` ──────────────────────────────────

/** CLI entry: resolve + report the DESIGN.md a config here would pick up. Returns the exit code. */
export function brandCommand(targetPath = ".", { json = false } = {}) {
  const resolved = resolve(targetPath);
  let file = null;
  try {
    file = statSync(resolved).isFile() ? resolved : findDesignMd(resolved);
  } catch {
    console.error(`✗ path not found: ${targetPath}`);
    return 1;
  }
  if (!file) {
    if (json) console.log(JSON.stringify({ found: false, searchedFrom: resolved }, null, 2));
    else console.error(`✗ no DESIGN.md found walking up from ${resolved} (stopped at the repo root)`);
    return 1;
  }

  const { design, error } = designFromFile(file);
  if (error) {
    if (json) console.log(JSON.stringify({ found: true, path: file, error }, null, 2));
    else console.error(`⚠ ${file}: ${error}`);
    return 1;
  }
  if (!hasBrandTokens(design)) {
    if (json) console.log(JSON.stringify({ found: true, path: file, error: "no usable tokens" }, null, 2));
    else console.error(`⚠ ${file}: parsed, but no usable color/typography tokens (colors.primary/secondary/background, typography fontFamily)`);
    return 1;
  }

  if (json) {
    console.log(JSON.stringify({
      found: true,
      path: file,
      ...(design.name ? { name: design.name } : {}),
      style: {
        ...(design.font ? { font: design.font } : {}),
        brandKit: {
          ...(design.accent ? { accent: design.accent } : {}),
          ...(design.secondary ? { secondary: design.secondary } : {}),
          ...(design.bg ? { bg: design.bg } : {}),
        },
      },
      ...(design.rounded ? { rounded: design.rounded } : {}),
    }, null, 2));
    return 0;
  }

  console.log(`DESIGN.md: ${file}${design.name ? ` (name "${design.name}")` : ""}`);
  const row = (label, value, source) => console.log(`  ${label.padEnd(10)}${value}  (${source})`);
  if (design.accent) row("accent", design.accent, "colors.primary");
  if (design.secondary) row("secondary", design.secondary, "colors.secondary");
  if (design.bg) row("bg", design.bg, `colors.${design.bgSource}`);
  if (design.font) row("font", design.font, `typography.${design.fontSource}.fontFamily`);
  if (design.rounded) console.log(`  ${"rounded".padEnd(10)}${design.rounded}  (parsed, not yet consumed — future radius token)`);
  console.log(`\nrender/validate merge these into the config automatically when ${basename(file)} sits at the repo root.`);
  console.log("Config-explicit style/brandKit values always win; opt out with --no-design-md.");
  return 0;
}
