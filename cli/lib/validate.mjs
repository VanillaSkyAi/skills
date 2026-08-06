/**
 * Config validator — structural checks, template ids, per-template
 * variableSchema, scene-level backgroundEffect placement, and the
 * FormatDefinition slot contract (hook/body/closer, adjacency diversity,
 * closer category, scene-count bounds).
 *
 * All template/format knowledge comes from registry-data.mjs, generated
 * from src/ by `npm run gen` (scripts/generate-cli-data.mjs) and committed.
 * Never hand-edit that file.
 *
 * Format rules run only when a format is declared (`config.format` or
 * --format) — a bare VideoConfig is valid without a slot contract.
 */
import { readFileSync } from "node:fs";
import registryData from "./registry-data.mjs";
import { mergeDesignMdIntoConfig } from "./design-md.mjs";
import { getPexelsApiKey } from "./pexels.mjs";

export { registryData };

const { templates: TEMPLATES, aliases: ALIASES, formats: FORMATS, backgroundEffects: BACKGROUND_EFFECTS, customScene: CUSTOM, stylePresets: PRESETS } = registryData;

/** Fields that live on the scene object, not inside scene.variables. */
const SCENE_LEVEL_FIELDS = ["backgroundEffect", "textArchetype"];
// Mirrors the TimingConfig the scene resolver reads (src/lib/scene-resolver.ts).
const TIMING_FIELDS = ["startTime", "endTime", "beatStart", "beatEnd", "durationWeight"];

const isCustomId = (id) => typeof id === "string" && id.startsWith(CUSTOM.idPrefix);

/**
 * Validate an ejected/custom scene: a `custom_*` templateId whose component
 * travels inside the config as `componentSource`. The render page rehydrates
 * these (hydrateCustomTemplatesFromConfig) and compiles them in the
 * /vibeframe sandbox, so the rules below mirror that compiler exactly —
 * they're generated from it, not restated.
 *
 * Returns an array of [code, message] pairs; empty means valid.
 */
function customSceneIssues(scene) {
  const src = scene.componentSource;
  if (typeof src !== "string" || src.trim().length === 0) {
    return [[
      "custom-source-missing",
      `carries a "${CUSTOM.idPrefix}" templateId but no componentSource — an ejected scene must inline its component as a "componentSource" string on the scene`,
    ]];
  }
  if (src.length > CUSTOM.maxSourceChars) {
    return [["custom-source-too-long", `componentSource is ${src.length} chars (max ${CUSTOM.maxSourceChars}) — trim it or compose from primitives instead`]];
  }
  if (!/function\s+Component\s*\(/.test(src)) {
    return [[
      "custom-source-shape",
      "componentSource must declare a single `function Component({ progress, width, height, ... })` — registry item source exports a named template and must be reshaped into that form before it can be used as a custom scene",
    ]];
  }
  const issues = [];
  for (const { source, flags, reason } of CUSTOM.bannedTokens) {
    if (new RegExp(source, flags).test(src)) issues.push(["custom-source-banned", `componentSource: ${reason}`]);
  }
  return issues;
}

const resolveAlias = (id) => ALIASES[id] ?? id;
const getTemplate = (id) => TEMPLATES[id] ?? TEMPLATES[resolveAlias(id)];

const isEmpty = (v) => v === undefined || v === null || v === "";

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function closestMatch(name, candidates) {
  let best = null, bestDist = Infinity;
  const lower = name.toLowerCase();
  for (const c of candidates) {
    const d = levenshtein(lower, c.toLowerCase());
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= Math.max(2, Math.floor(name.length / 3)) ? best : null;
}

function typeLabel(v) {
  if (Array.isArray(v)) return "an array";
  if (v === null) return "null";
  return `a ${typeof v}`;
}

/** One value against one schema field. Returns an error message or null. */
function checkType(value, field) {
  switch (field.type) {
    case "string":
    case "media":
    case "color":
      if (typeof value !== "string" && typeof value !== "number") {
        return `expected a string, got ${typeLabel(value)}`;
      }
      return null;
    case "number":
      if (typeof value === "number") return null;
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return null;
      return `expected a number, got ${typeLabel(value)}${typeof value === "string" ? ` ("${value}")` : ""}`;
    case "boolean":
      if (typeof value !== "boolean") {
        return `expected a boolean (true/false without quotes), got ${typeLabel(value)}`;
      }
      return null;
    case "enum":
      if (typeof value !== "string" || !(field.options ?? []).includes(value)) {
        return `expected one of: ${(field.options ?? []).join(", ")}`;
      }
      return null;
    case "data-points":
      if (!Array.isArray(value)) return `expected an array of data points, got ${typeLabel(value)}`;
      return null;
    default:
      return null;
  }
}

/**
 * Validate a parsed VideoConfig.
 * Returns { errors, warnings, format } — issue: { code, sceneIndex?, templateId?, message }.
 */
export function validateConfig(config, { format, pexelsKeyAvailable = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, message, sceneIndex, templateId) =>
    errors.push({ code, message, ...(sceneIndex !== undefined ? { sceneIndex } : {}), ...(templateId ? { templateId } : {}) });
  const warn = (code, message, sceneIndex, templateId) =>
    warnings.push({ code, message, ...(sceneIndex !== undefined ? { sceneIndex } : {}), ...(templateId ? { templateId } : {}) });

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    err("structural", "config must be a JSON object (a VideoConfig)");
    return { errors, warnings, format: null };
  }
  if (!Array.isArray(config.scenes) || config.scenes.length === 0) {
    err("structural", "config has no scenes[] — a VideoConfig needs at least one scene");
    return { errors, warnings, format: null };
  }

  // The render page hard-requires a style block (templates dereference
  // style.font); `vanillasky render` injects a default, but a config shared
  // via `link` or the Studio won't get that safety net — surface it here.
  const style = config.style;
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    warn("missing-style", 'config has no style block — the renderer requires one; add at least "style": { "font": "Inter" } (vanillasky render injects this default automatically)');
  } else if (typeof style.font !== "string" || !style.font.trim()) {
    warn("missing-style", 'config.style has no font — the renderer requires one; add e.g. "font": "Inter" (vanillasky render injects this default automatically)');
  }

  // brandKit belongs to style. At the top level it is simply never read, so
  // the video renders in default colors and the only symptom is a frame that
  // looks unbranded — the most expensive kind of silent no-op.
  if (config.brandKit !== undefined) {
    err(
      "misplaced-brandkit",
      'brandKit must live inside "style" — a top-level "brandKit" is never read and the brand silently never applies. Move it to style.brandKit.',
    );
  }

  // An unknown preset silently falls back to the default at render time —
  // which reads as "the preset did nothing" rather than "the name is wrong".
  const presetId = config.style?.preset;
  if (presetId !== undefined && !PRESETS.ids.includes(presetId)) {
    err(
      "unknown-preset",
      `style.preset "${presetId}" is not a known preset — it would silently fall back to "${PRESETS.default}". Valid presets: ${PRESETS.ids.join(", ")}`,
    );
  }

  const activeFormat = format ?? (typeof config.format === "string" ? config.format : undefined);
  const formatDef = activeFormat ? FORMATS[activeFormat] : undefined;
  if (activeFormat && !formatDef) {
    err("unknown-format", `unknown format "${activeFormat}" — known formats: ${Object.keys(FORMATS).join(", ")}`);
  }

  const scenes = config.scenes;
  const label = (i) => {
    const raw = scenes[i]?.templateId;
    return typeof raw === "string" && raw ? `scene ${i + 1} (${raw})` : `scene ${i + 1}`;
  };

  // ─── Structural + template + variable checks (per scene) ─────
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
      err("structural", `scene ${i + 1} must be an object with a templateId`, i);
      continue;
    }
    if (typeof scene.templateId !== "string" || !scene.templateId) {
      err("structural", `scene ${i + 1} is missing a templateId`, i);
      continue;
    }

    const rawId = scene.templateId;

    // Ejected/custom scenes carry their component instead of naming a
    // registered template — validate the source, not the registry.
    if (isCustomId(rawId)) {
      for (const [code, message] of customSceneIssues(scene)) {
        err(code, `${label(i)}: ${message}`, i, rawId);
      }
      continue;
    }

    const canonicalId = resolveAlias(rawId);
    const tpl = getTemplate(rawId);
    if (!tpl) {
      const ids = Object.keys(TEMPLATES);
      const prefix = rawId.toLowerCase().split("-")[0];
      const suggestions = ids.filter((id) => id.toLowerCase().startsWith(prefix)).slice(0, 3);
      const near = suggestions.length === 0 ? closestMatch(rawId, ids) : null;
      const hint = suggestions.length > 0
        ? ` Did you mean: ${suggestions.join(", ")}?`
        : near ? ` Did you mean "${near}"?` : "";
      err("unknown-template", `${label(i)}: "${rawId}" is not a registered template — ids are camelCase.${hint} Valid ids: ${ids.join(", ")}`, i, rawId);
      continue;
    }
    if (canonicalId !== rawId) {
      warn("alias", `${label(i)}: "${rawId}" is a legacy alias — use the canonical id "${canonicalId}"`, i, rawId);
    }

    if (scene.variables !== undefined && (typeof scene.variables !== "object" || scene.variables === null || Array.isArray(scene.variables))) {
      err("structural", `${label(i)}: variables must be an object`, i, rawId);
      continue;
    }

    // Scene length is startTime/endTime. `duration` is the intuitive guess and
    // is read by nothing — the scene quietly runs at the template's
    // preferredDuration and the only symptom is a video of the wrong length.
    if (scene.timing !== undefined && scene.timing !== null && typeof scene.timing === "object" && !Array.isArray(scene.timing)) {
      for (const key of Object.keys(scene.timing)) {
        if (TIMING_FIELDS.includes(key)) continue;
        const hint = key === "duration"
          ? ` Scene length is set with startTime + endTime (seconds) — e.g. "timing": { "startTime": 0, "endTime": ${JSON.stringify(scene.timing[key])} }.`
          : "";
        err(
          "unknown-timing-field",
          `${label(i)}: unknown timing field "${key}" — the renderer never reads it and the scene silently falls back to the template's preferredDuration.${hint} Known fields: ${TIMING_FIELDS.join(", ")}`,
          i, rawId,
        );
      }
      const { startTime, endTime } = scene.timing;
      if (typeof startTime === "number" && typeof endTime === "number" && endTime <= startTime) {
        err("structural", `${label(i)}: timing.endTime (${endTime}) must be greater than timing.startTime (${startTime})`, i, rawId);
      }
    }

    const vars = scene.variables ?? {};
    const schema = tpl.variableSchema ?? {};
    const schemaNames = Object.keys(schema);

    for (const [name, value] of Object.entries(vars)) {
      if (SCENE_LEVEL_FIELDS.includes(name)) {
        err(
          "scene-field-in-variables",
          `${label(i)}: "${name}" is a SCENE-LEVEL field and must not sit inside scene.variables — the renderer never reads it there and it silently no-ops. Move it up one level: scenes[${i}].${name} = ${JSON.stringify(value)}`,
          i, rawId,
        );
        continue;
      }
      // Keys in defaultVariables but not in the schema (e.g. chatMessenger's
      // `theme`) are still consumed by the template — known, just not
      // schema-typed.
      if (!(name in schema) && !(name in (tpl.defaultVariables ?? {}))) {
        const near = closestMatch(name, schemaNames);
        err(
          "unknown-variable",
          `${label(i)}: unknown variable "${name}" — this template uses: ${schemaNames.join(", ")}.${near ? ` Did you mean "${near}"?` : ""}`,
          i, rawId,
        );
        continue;
      }
      if (!(name in schema) || isEmpty(value)) continue;
      const typeErr = checkType(value, schema[name]);
      if (typeErr) {
        err("type-mismatch", `${label(i)}: variable "${name}" — ${typeErr}`, i, rawId);
      }
    }

    // ctaLogo renders `cta` only as a fallback for an empty `url`. Setting
    // both ships copy that never appears on screen.
    if (canonicalId === "ctaLogo" && !isEmpty(vars.cta) && !isEmpty(vars.url)) {
      warn(
        "dead-cta",
        `${label(i)}: "cta" (${JSON.stringify(vars.cta)}) never renders while "url" is set — ctaLogo shows the CTA only as a fallback for an empty url. Drop one: keep the url as the address, or clear it to stamp the cta instead.`,
        i, rawId,
      );
    }

    for (const [name, field] of Object.entries(schema)) {
      if (!field.required) continue;
      if (field.type === "color" || field.type === "media") continue;
      if (isEmpty(vars[name])) {
        const def = tpl.defaultVariables?.[name];
        err(
          "missing-required",
          `${label(i)}: required variable "${name}" is ${name in vars ? "empty" : "missing"} — fill it with real content${!isEmpty(def) ? ` (template default: ${JSON.stringify(def)})` : ""}`,
          i, rawId,
        );
      }
    }

    // mediaKeyword → mediaUrl resolution: the CLI resolves keywords via the
    // Pexels API at render time when PEXELS_API_KEY is set; otherwise an
    // unresolved keyword falls back to the brand gradient. Surface that
    // before someone ships one by accident.
    if ("mediaKeyword" in schema && !isEmpty(vars.mediaKeyword) && isEmpty(vars.mediaUrl) && vars.mediaType !== "gradient") {
      warn(
        "media-keyword-unresolved",
        pexelsKeyAvailable
          ? `${label(i)}: "mediaKeyword" is set but "mediaUrl" is empty — will auto-resolve via the Pexels API at render time (PEXELS_API_KEY is set); pass --no-pexels to keep the gradient background instead`
          : `${label(i)}: "mediaKeyword" is set but "mediaUrl" is empty — provide a direct mediaUrl, or set PEXELS_API_KEY (free at pexels.com/api) to auto-resolve keywords at render time; unresolved keywords fall back to a gradient background`,
        i, rawId,
      );
    }

    // Scene-level backgroundEffect: template must consume it, value must exist.
    if (scene.backgroundEffect !== undefined && scene.backgroundEffect !== null && scene.backgroundEffect !== "") {
      const fx = scene.backgroundEffect;
      if (typeof fx !== "string" || !BACKGROUND_EFFECTS.includes(fx)) {
        err("background-effect-invalid", `${label(i)}: unknown backgroundEffect ${JSON.stringify(fx)} — valid effects: ${BACKGROUND_EFFECTS.join(", ")}`, i, rawId);
      } else if (!tpl.usesGlobalBackgroundEffect) {
        const consumers = Object.entries(TEMPLATES).filter(([, t]) => t.usesGlobalBackgroundEffect).map(([id]) => id);
        err("background-effect-unsupported", `${label(i)}: "${canonicalId}" doesn't consume backgroundEffect — it silently no-ops. Templates that do: ${consumers.join(", ")}. Remove it from this scene.`, i, rawId);
      }
    }
  }

  // ─── Format rules (slot contract) ────────────────────────────
  if (formatDef) {
    const n = scenes.length;
    const { min, max } = formatDef.sceneCount;
    if (n < min || n > max) {
      err("format-scene-count", `${formatDef.id} format needs ${min}-${max} scenes (default ${formatDef.sceneCount.default}: hook + ${formatDef.slots.body.default} bodies + closer) — got ${n}`);
    }

    const categoryOf = (i) => getTemplate(scenes[i]?.templateId ?? "")?.category ?? null;
    const canonicalOf = (i) => typeof scenes[i]?.templateId === "string" ? resolveAlias(scenes[i].templateId) : null;

    // Closer rules.
    const closerCat = formatDef.slots.closer.requiredCategory;
    const closerIds = Object.entries(TEMPLATES).filter(([, t]) => t.category === closerCat).map(([id]) => id);
    const lastIdx = n - 1;
    for (let i = 0; i < n; i++) {
      const cat = categoryOf(i);
      if (cat === null) continue; // unknown template already reported
      if (i === lastIdx && cat !== closerCat) {
        err("format-closer-required", `${label(i)}: the last scene must be a ${closerCat}-category template (${closerIds.join(" or ")}) so the viewer gets a CTA — "${canonicalOf(i)}" is category "${cat}"`, i, scenes[i].templateId);
      } else if (i !== lastIdx && cat === closerCat && formatDef.slots.closer.onlyInFinalSlot) {
        err("format-closer-position", `${label(i)}: "${canonicalOf(i)}" is a ${closerCat}-category template but isn't the last scene — closers belong only in the final slot. Move it to the end or swap it for a body template.`, i, scenes[i].templateId);
      }
    }

    // Slow-hook guard.
    const hookId = canonicalOf(0);
    const bannedHooks = formatDef.slots.hook.bannedTemplateIds.map(resolveAlias);
    if (hookId && bannedHooks.includes(hookId)) {
      err("format-slow-hook", `${label(0)}: "${hookId}" animates too slowly to grab attention in the first 2-3s — don't use it as the hook. Move it to a body slot and open with a punchier template (e.g. ${formatDef.slots.hook.defaultTemplateId}, tweet, bigNumber, milestone).`, 0, scenes[0].templateId);
    }

    // Adjacency diversity (same template / same category), with exempt categories.
    const exempt = formatDef.diversity.adjacencyExemptCategories;
    for (let i = 0; i < n - 1; i++) {
      const a = canonicalOf(i), b = canonicalOf(i + 1);
      const catA = categoryOf(i), catB = categoryOf(i + 1);
      if (!a || !b || catA === null || catB === null) continue;
      if (exempt.includes(catA) && exempt.includes(catB)) continue;
      if (formatDef.diversity.noSameTemplateAdjacent && a === b) {
        err("format-template-adjacency", `scenes ${i + 1} and ${i + 2} both use "${a}" — two adjacent scenes with the same template look duplicated. Swap one for a different template.`, i + 1, scenes[i + 1].templateId);
        continue;
      }
      if (formatDef.diversity.noSameCategoryAdjacent && catA === catB) {
        err("format-category-adjacency", `scenes ${i + 1} ("${a}") and ${i + 2} ("${b}") are both category "${catA}" — adjacent scenes must come from different categories. Swap one for a template from another category.`, i + 1, scenes[i + 1].templateId);
      }
    }
  }

  return { errors, warnings, format: formatDef ? formatDef.id : null };
}

/** Load + parse a config file for validation. Parse failures come back as issues, not throws. */
export function loadConfigForValidation(configPath) {
  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    return { config: null, error: `cannot read config file: ${configPath}` };
  }
  try {
    return { config: JSON.parse(raw), error: null };
  } catch (e) {
    return { config: null, error: `${configPath} is not valid JSON: ${e.message}` };
  }
}

/** Human-readable report lines for a validateConfig result. */
export function formatReport(result, { name = "config" } = {}) {
  const lines = [];
  for (const e of result.errors) lines.push(`  ✗ ${e.message}`);
  for (const w of result.warnings) lines.push(`  ⚠ ${w.message}`);
  if (result.errors.length === 0) {
    const fmt = result.format ? ` (${result.format} format rules applied)` : " (no format declared — slot-contract rules skipped; add \"format\": \"launch\" to the config or pass --format launch)";
    lines.push(`✓ ${name} is valid${fmt}`);
  } else {
    lines.push(`✗ ${name}: ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}${result.warnings.length ? `, ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}` : ""}`);
  }
  return lines.join("\n");
}

/** CLI entry: prints the report, returns the exit code. */
export function validateCommand(configPath, { json = false, format, designMd = true, pexels = true } = {}) {
  const { config, error } = loadConfigForValidation(configPath);
  if (error) {
    if (json) {
      console.log(JSON.stringify({ valid: false, format: null, errors: [{ code: "structural", message: error }], warnings: [] }, null, 2));
    } else {
      console.error(`✗ ${error}`);
    }
    return 1;
  }
  // Merge DESIGN.md brand tokens before validating, so a design-supplied
  // style silences the missing-style warning. Logs to stderr — --json
  // stdout stays machine-readable.
  if (designMd !== false && config && typeof config === "object") {
    mergeDesignMdIntoConfig(configPath, config, { log: console.error });
  }
  const result = validateConfig(config, { format, pexelsKeyAvailable: pexels !== false && getPexelsApiKey() !== null });
  if (json) {
    console.log(JSON.stringify({ valid: result.errors.length === 0, format: result.format, errors: result.errors, warnings: result.warnings }, null, 2));
  } else {
    console.log(formatReport(result, { name: configPath }));
  }
  return result.errors.length === 0 ? 0 : 1;
}
