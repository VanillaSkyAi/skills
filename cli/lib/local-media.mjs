/**
 * Local scene media support for CLI render and Studio.
 *
 * Browsers cannot read `/Users/...` or `file://` paths from an http page. The
 * CLI therefore keeps those paths in video.json, but gives the browser an
 * opaque, loopback-only URL for each registered image/video.
 */
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import registryData from "./registry-data.mjs";

const MEDIA_MIME = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".webp", "image/webp"], [".gif", "image/gif"], [".svg", "image/svg+xml"],
  [".avif", "image/avif"], [".mp4", "video/mp4"], [".webm", "video/webm"],
  [".mov", "video/quicktime"], [".m4v", "video/x-m4v"],
]);

const clone = (value) => JSON.parse(JSON.stringify(value));
const isBrowserUrl = (value) => /^(?:https?:|data:|blob:|\/\/)/i.test(value);

function localPath(value, configPath) {
  const raw = String(value ?? "").trim();
  if (!raw || isBrowserUrl(raw) || raw.startsWith("/__media/")) return null;
  if (raw.startsWith("file://")) {
    try { return fileURLToPath(raw); } catch { return raw; }
  }
  return isAbsolute(raw) ? raw : resolve(dirname(resolve(configPath)), raw);
}

function mediaSchema(scene) {
  if (typeof scene?.templateId !== "string") return {};
  if (scene.templateId.startsWith(registryData.customScene.idPrefix)) {
    return scene.customTemplate?.variableSchema ?? {};
  }
  const id = registryData.aliases[scene.templateId] ?? scene.templateId;
  return registryData.templates[id]?.variableSchema ?? {};
}

/** Return declared media values only; prose that resembles a URL/path is ignored. */
export function listMediaReferences(config) {
  const refs = [];
  for (let sceneIndex = 0; sceneIndex < (config.scenes ?? []).length; sceneIndex++) {
    const scene = config.scenes[sceneIndex];
    const schema = mediaSchema(scene);
    for (const [name, field] of Object.entries(schema)) {
      if (field?.type !== "media" && !/Poster$/.test(name)) continue;
      const original = scene.variables?.[name];
      if (typeof original !== "string") continue;
      refs.push({ sceneIndex, templateId: scene.templateId, name, value: original });
    }
  }
  const logo = config.style?.brandKit?.logoDataUrl;
  if (typeof logo === "string") {
    refs.push({ sceneIndex: null, templateId: null, name: "style.brandKit.logoDataUrl", value: logo });
  }
  return refs;
}

export function listLocalMediaReferences(config, configPath) {
  return listMediaReferences(config).flatMap((ref) => {
    const path = localPath(ref.value, configPath);
    return path ? [{ ...ref, original: ref.value, path }] : [];
  });
}

export function validateLocalMediaPaths(config, configPath) {
  const issues = [];
  for (const ref of listLocalMediaReferences(config, configPath)) {
    const where = ref.sceneIndex === null
      ? ref.name
      : `scene ${ref.sceneIndex + 1} (${ref.templateId}) variable "${ref.name}"`;
    if (!existsSync(ref.path)) {
      issues.push({
        code: "local-media-missing",
        message: `${where}: local media path ${JSON.stringify(ref.original)} does not exist (resolved to ${ref.path})`,
        ...(ref.sceneIndex === null ? {} : { sceneIndex: ref.sceneIndex, templateId: ref.templateId }),
      });
      continue;
    }
    if (!statSync(ref.path).isFile() || !MEDIA_MIME.has(extname(ref.path).toLowerCase())) {
      issues.push({
        code: "local-media-unsupported",
        message: `${where}: ${JSON.stringify(ref.original)} is not a supported image or video file`,
        ...(ref.sceneIndex === null ? {} : { sceneIndex: ref.sceneIndex, templateId: ref.templateId }),
      });
    }
  }
  return issues;
}

export class LocalMediaRegistry {
  constructor() {
    this.entries = new Map();
  }

  register(path, original = path) {
    if (!existsSync(path) || !statSync(path).isFile() || !MEDIA_MIME.has(extname(path).toLowerCase())) {
      throw new Error(`${path} is not a supported image or video file`);
    }
    const id = createHash("sha256").update(`${path}\0${original}`).digest("hex").slice(0, 24);
    const url = `/__media/${id}`;
    this.entries.set(url, { path, original, contentType: MEDIA_MIME.get(extname(path).toLowerCase()) });
    return url;
  }

  entry(url) { return this.entries.get(url) ?? null; }
  resolve(url) { return this.entry(url)?.path ?? null; }
  original(url) { return this.entry(url)?.original ?? null; }
}

export function rewriteLocalMediaPaths(config, configPath, registry) {
  const next = clone(config);
  for (const ref of listLocalMediaReferences(next, configPath)) {
    let url;
    try { url = registry.register(ref.path, ref.original); } catch { continue; }
    if (ref.sceneIndex === null) next.style.brandKit.logoDataUrl = url;
    else next.scenes[ref.sceneIndex].variables[ref.name] = url;
  }
  return next;
}

export function restoreLocalMediaPaths(config, registry) {
  const next = clone(config);
  for (const scene of next.scenes ?? []) {
    for (const [name, value] of Object.entries(scene.variables ?? {})) {
      const original = typeof value === "string" ? registry.original(value) : null;
      if (original !== null) scene.variables[name] = original;
    }
  }
  const logo = next.style?.brandKit?.logoDataUrl;
  const originalLogo = typeof logo === "string" ? registry.original(logo) : null;
  if (originalLogo !== null) next.style.brandKit.logoDataUrl = originalLogo;
  return next;
}
