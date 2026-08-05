/**
 * Direct Pexels resolution for `mediaKeyword` variables — the CLI equivalent
 * of src/lib/compose-scenes.ts fillPexelsUrls (which routes through the
 * search-pexels edge function; here the user's own PEXELS_API_KEY talks to
 * api.pexels.com directly).
 *
 * Mirrors the web path's choices: portrait orientation by default, video
 * unless the scene pins mediaType "photo", best-HD-file selection matching
 * the target orientation, and the video thumbnail stored as the sibling
 * *Poster variable. Skips showcase/app templates, reaction, gradient-mode
 * scenes, and logo variables — same as the web path.
 *
 * Never fatal: API failures warn and leave the scene untouched (it falls back
 * to the brand gradient, which the validator already warns about).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import registryData from "./registry-data.mjs";

const { templates: TEMPLATES, aliases: ALIASES } = registryData;

const SHOWCASE_OR_APP = new Set([
  "phoneMockup", "triplePhone", "webMockup", "codeEditor", "terminal",
  "chatListApp", "lockScreen", "socialFeed",
]);

const FETCH_TIMEOUT_MS = 15_000;

export const USER_CONFIG_PATH = join(homedir(), ".vanillasky", "config.json");

/**
 * PEXELS_API_KEY resolution: environment wins, then ~/.vanillasky/config.json
 * ({ "pexelsApiKey": "..." } — the raw env-var name is accepted as a key too).
 * Returns { key, source } or null.
 */
export function getPexelsApiKey({ env = process.env, configPath = USER_CONFIG_PATH } = {}) {
  const fromEnv = typeof env.PEXELS_API_KEY === "string" ? env.PEXELS_API_KEY.trim() : "";
  if (fromEnv) return { key: fromEnv, source: "PEXELS_API_KEY env" };
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, "utf8"));
      const raw = cfg?.pexelsApiKey ?? cfg?.PEXELS_API_KEY;
      const key = typeof raw === "string" ? raw.trim() : "";
      if (key) return { key, source: configPath };
    } catch {
      // malformed user config — behave as if absent
    }
  }
  return null;
}

/** Best video file for the orientation — same selection as the search-pexels edge function. */
function pickVideoFile(video, orientation) {
  const files = video.video_files ?? [];
  const preferWide = orientation === "landscape";
  return (
    files.find((f) => f.quality === "hd" && (preferWide ? f.width > f.height : f.width < f.height)) ||
    files.find((f) => f.quality === "hd") ||
    files.find((f) => f.quality === "sd") ||
    files[0]
  );
}

/**
 * Search Pexels with the user's own key. Exported so the bundled Studio's
 * media picker can use the same code path the renderer's auto-fill does —
 * the request goes from this machine straight to Pexels, so stock search
 * works locally without any VanillaSky endpoint.
 *
 * Returns [{ src, thumbnail, photographer }], the same shape the web app's
 * search-pexels function returns, so the picker needs no second mapping.
 */
export async function searchPexels({ apiKey, query, type, orientation, perPage = 15, fetchImpl = globalThis.fetch }) {
  const base = type === "video" ? "https://api.pexels.com/videos/search" : "https://api.pexels.com/v1/search";
  const url = `${base}?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${perPage}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { Authorization: apiKey }, signal: controller.signal });
    if (!res.ok) throw new Error(`Pexels API HTTP ${res.status}`);
    const data = await res.json();
    if (type === "video") {
      return (data.videos ?? [])
        .map((v) => {
          const file = pickVideoFile(v, orientation);
          return file?.link
            ? { src: file.link, thumbnail: v.image || "", photographer: v.user?.name || "" }
            : null;
        })
        .filter(Boolean);
    }
    return (data.photos ?? [])
      .map((p) => {
        const src = p.src?.large2x || p.src?.large || p.src?.original || "";
        return src ? { src, thumbnail: p.src?.medium || p.src?.small || "", photographer: p.photographer || "" } : null;
      })
      .filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

const isEmpty = (v) => v === undefined || v === null || v === "";

/**
 * Fill empty media variables that have a sibling *Keyword value, in place.
 * Responses are cached per (type, keyword) for the run; repeated uses of one
 * keyword rotate through the cached results so scenes don't duplicate footage.
 *
 * Returns { filled, failed } — filled: [{ sceneIndex, templateId, varName,
 * keyword, type, src, photographer }].
 */
export async function fillPexelsMedia(config, { apiKey, fetchImpl = globalThis.fetch, log = console.log, warn = console.warn } = {}) {
  const orientation = config.orientation === "landscape" ? "landscape" : "portrait";
  const cache = new Map(); // `${type}:${keyword}` → results[] (or null after a failed search)
  const useCount = new Map(); // same key → how many fills consumed a result
  const filled = [];
  const failed = [];

  const search = async (type, keyword) => {
    const key = `${type}:${keyword.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);
    let results = null;
    try {
      results = await searchPexels({ apiKey, query: keyword, type, orientation, perPage: 5, fetchImpl });
    } catch (err) {
      warn(`[vanillasky] pexels: search "${keyword}" (${type}) failed: ${String(err.message ?? err).split("\n")[0]}`);
    }
    // Same fallback as the web path: no results → retry the first two words.
    if (results && results.length === 0) {
      const simpler = keyword.split(/\s+/).slice(0, 2).join(" ");
      if (simpler !== keyword && simpler.length >= 3) {
        try {
          const retry = await searchPexels({ apiKey, query: simpler, type, orientation, perPage: 5, fetchImpl });
          if (retry.length > 0) {
            log(`[vanillasky] pexels: "${keyword}" had no results — using "${simpler}" (${retry.length})`);
            results = retry;
          }
        } catch {
          // keep the empty result
        }
      }
    }
    cache.set(key, results && results.length > 0 ? results : null);
    return cache.get(key);
  };

  for (let i = 0; i < (config.scenes ?? []).length; i++) {
    const scene = config.scenes[i];
    if (!scene || typeof scene.templateId !== "string") continue;
    const canonicalId = ALIASES[scene.templateId] ?? scene.templateId;
    if (canonicalId === "reaction" || SHOWCASE_OR_APP.has(canonicalId)) continue;
    const tpl = TEMPLATES[canonicalId];
    if (!tpl) continue;

    const vars = scene.variables ?? {};
    if (String(vars.mediaType || "") === "gradient") continue;
    const schema = tpl.variableSchema ?? {};
    const searchType = String(vars.mediaType || "") === "photo" ? "photo" : "video";

    for (const [varName, field] of Object.entries(schema)) {
      if (field.type !== "media") continue;
      if (/logo/i.test(varName)) continue;
      if (!isEmpty(vars[varName])) continue;

      let keyword = null;
      for (const [sibName, sibField] of Object.entries(schema)) {
        if (sibName.toLowerCase().includes("keyword") && (sibField.type === "string" || sibField.type === undefined)) {
          const val = vars[sibName];
          if (typeof val === "string" && val.trim().length > 0) keyword = val.trim();
          break;
        }
      }
      if (!keyword) continue;

      const results = await search(searchType, keyword);
      const cacheKey = `${searchType}:${keyword.toLowerCase()}`;
      if (!results) {
        failed.push({ sceneIndex: i, templateId: scene.templateId, varName, keyword });
        continue;
      }
      const idx = useCount.get(cacheKey) ?? 0;
      useCount.set(cacheKey, idx + 1);
      const picked = results[idx % results.length];

      if (!scene.variables) scene.variables = vars;
      vars[varName] = picked.src;
      if (searchType === "video") {
        if (isEmpty(vars.mediaType)) vars.mediaType = "video";
        // Sibling poster convention from the web path: mediaUrl → mediaPoster.
        // Only when the template actually declares that variable — `media`
        // does not, and writing it there made the fill produce a config the
        // CLI's own validator then rejected ("unknown variable mediaPoster").
        const posterVarName = varName.replace(/Url$/, "Poster");
        if (posterVarName !== varName && picked.thumbnail && posterVarName in schema) {
          vars[posterVarName] = picked.thumbnail;
        }
      }
      filled.push({ sceneIndex: i, templateId: scene.templateId, varName, keyword, type: searchType, src: picked.src, photographer: picked.photographer });
      log(`[vanillasky] pexels: scene ${i + 1} (${scene.templateId}) ${varName} ← ${searchType} "${keyword}"${picked.photographer ? ` by ${picked.photographer}` : ""} (pexels.com)`);
    }
  }

  return { filled, failed };
}
