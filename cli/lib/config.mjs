/**
 * VideoConfig loading, validation, timing math, and inline-config encoding.
 * The duration/timing logic mirrors src/lib/export-video.ts
 * (computeTotalDuration) and src/lib/scene-duration.ts (getSceneDuration).
 */
import { readFileSync } from "node:fs";

const FALLBACK_SCENE_DURATION = 3;
const MIN_SCENE_DURATION = 0.5;
const MAX_SCENE_DURATION = 12;

/** Default audio fade-out (ms) — mirrors DEFAULT_AUDIO_FADE_MS in scene-duration.ts. */
export const DEFAULT_AUDIO_FADE_MS = 3000;

/** Font injected when a config reaches the renderer without one — the Studio's default. */
export const DEFAULT_FONT = "Inter";

/**
 * The render page requires a style block — templates dereference
 * `style.font` unguarded, so a config without one crashes /render.
 * Inject a minimal default instead. Returns true when an injection happened.
 */
export function ensureRenderableStyle(config) {
  const style = config.style && typeof config.style === "object" && !Array.isArray(config.style) ? config.style : {};
  if (typeof style.font === "string" && style.font.trim()) return false;
  config.style = { ...style, font: DEFAULT_FONT };
  return true;
}

export function loadConfig(configPath) {
  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    throw new Error(`cannot read config file: ${configPath}`);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${configPath} is not valid JSON: ${err.message}`);
  }
  if (!config || typeof config !== "object") {
    throw new Error(`${configPath} must contain a JSON object (a VideoConfig)`);
  }
  if (!Array.isArray(config.scenes) || config.scenes.length === 0) {
    throw new Error(`${configPath} has no scenes[] — a VideoConfig needs at least one scene`);
  }
  const bad = config.scenes.findIndex((s) => !s || typeof s.templateId !== "string" || !s.templateId);
  if (bad !== -1) {
    throw new Error(`${configPath}: scenes[${bad}] is missing a templateId`);
  }
  return config;
}

/**
 * base64url-encode the config (UTF-8 safe) for /render#config=<...>.
 * Must match decodeInlineConfig in src/pages/Render.tsx.
 */
export function encodeConfig(config) {
  return Buffer.from(JSON.stringify(config), "utf8").toString("base64url");
}

/** Ported from computeTotalDuration in src/lib/export-video.ts. */
export function computeTotalDuration(config) {
  const lastEndTime = config.scenes.reduce((max, s) => {
    const end = s.timing?.endTime;
    return typeof end === "number" && end > max ? end : max;
  }, 0);
  if (lastEndTime > 0) return lastEndTime;

  if (config.audio && typeof config.audio.duration === "number") {
    return config.audio.duration;
  }

  return config.scenes.reduce(
    (sum, s) => sum + (s.timing?.fixedDuration ?? FALLBACK_SCENE_DURATION),
    0,
  );
}

/** Per-scene [start, end) ranges — explicit startTime/endTime when present, cumulative fixedDuration otherwise. */
export function sceneTimeRanges(config) {
  const ranges = [];
  let cursor = 0;
  for (const scene of config.scenes) {
    const timing = scene.timing ?? {};
    let start, end;
    if (typeof timing.startTime === "number" && typeof timing.endTime === "number") {
      start = timing.startTime;
      end = timing.endTime;
    } else {
      const dur = Math.max(
        MIN_SCENE_DURATION,
        Math.min(MAX_SCENE_DURATION, typeof timing.fixedDuration === "number" && timing.fixedDuration > 0 ? timing.fixedDuration : FALLBACK_SCENE_DURATION),
      );
      start = cursor;
      end = cursor + dur;
    }
    ranges.push({ templateId: scene.templateId, start, end });
    cursor = end;
  }
  return ranges;
}

/** All http(s) media URLs referenced by scene variables (mirrors Render.tsx's preload walk). */
export function collectMediaUrls(config) {
  const urls = new Set();
  for (const scene of config.scenes) {
    for (const val of Object.values(scene.variables ?? {})) {
      if (typeof val === "string" && /^https?:\/\//.test(val)) urls.add(val);
    }
  }
  return [...urls];
}
