import { renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { loadConfig } from "./config.mjs";
import { fillPexelsMedia, getPexelsApiKey } from "./pexels.mjs";
import { validateConfig } from "./validate.mjs";

function writeConfigAtomic(configPath, config) {
  const tempPath = join(dirname(configPath), `.${basename(configPath)}.vanillasky-${process.pid}.tmp`);
  const mode = statSync(configPath).mode & 0o777;
  try {
    writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode });
    renameSync(tempPath, configPath);
  } catch (error) {
    try { unlinkSync(tempPath); } catch { /* nothing staged */ }
    throw error;
  }
}

/** Resolve stock-media keywords and persist an exact, portable VideoConfig. */
export async function resolveMediaCommand(configPath, {
  json = false,
  getKey = getPexelsApiKey,
  fill = fillPexelsMedia,
  writeConfig = writeConfigAtomic,
  log = console.log,
  error = console.error,
} = {}) {
  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    error(`[vanillasky] error: ${err?.message ?? err}`);
    return 1;
  }

  const before = validateConfig(config);
  if (before.errors.length > 0) {
    const result = { resolved: false, written: false, filled: [], failed: [], errors: before.errors };
    if (json) log(JSON.stringify(result, null, 2));
    else error(`[vanillasky] resolve: config has ${before.errors.length} validation error(s); fix those before resolving media.`);
    return 1;
  }

  const unresolved = before.warnings.filter((warning) => warning.code === "media-keyword-unresolved");
  if (unresolved.length === 0) {
    const result = { resolved: true, written: false, filled: [], failed: [], warnings: before.warnings };
    if (json) log(JSON.stringify(result, null, 2));
    else log("[vanillasky] resolve: no unresolved stock-media keywords — config unchanged.");
    return 0;
  }

  const key = getKey();
  if (!key) {
    const result = {
      resolved: false,
      written: false,
      filled: [],
      failed: unresolved.map((warning) => ({ sceneIndex: warning.sceneIndex, templateId: warning.templateId })),
      error: "Pexels API key missing",
    };
    if (json) log(JSON.stringify(result, null, 2));
    else error("[vanillasky] resolve: Pexels API key missing. Run `vanillasky setup`, provide direct mediaUrl values, or use mediaType=\"gradient\".");
    return 1;
  }

  const sideLog = json ? (...args) => error(...args) : log;
  const sideWarn = (...args) => error(...args);
  const { filled, failed } = await fill(config, { apiKey: key.key, log: sideLog, warn: sideWarn });
  const after = validateConfig(config, { pexelsKeyAvailable: true });
  const remaining = after.warnings.filter((warning) => warning.code === "media-keyword-unresolved");

  if (failed.length > 0 || remaining.length > 0 || filled.length === 0) {
    const result = { resolved: false, written: false, filled, failed, warnings: after.warnings };
    if (json) log(JSON.stringify(result, null, 2));
    else error(`[vanillasky] resolve: ${failed.length || remaining.length} media search(es) unresolved; video.json was not changed.`);
    return 1;
  }

  try {
    writeConfig(configPath, config);
  } catch (err) {
    error(`[vanillasky] resolve: could not update ${configPath}: ${err?.message ?? err}`);
    return 1;
  }

  const result = { resolved: true, written: true, filled, failed: [], warnings: after.warnings };
  if (json) log(JSON.stringify(result, null, 2));
  else {
    log(`[vanillasky] resolve: wrote ${filled.length} stock-media URL${filled.length === 1 ? "" : "s"} to ${configPath}.`);
    for (const item of filled) {
      log(`  ✓ scene ${item.sceneIndex + 1} (${item.templateId}) ${item.varName} ← ${item.type} "${item.keyword}"`);
    }
  }
  return 0;
}
