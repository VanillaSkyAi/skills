/**
 * `vanillasky diff <config>` — has upstream moved under your ejected scenes?
 *
 * Ejecting gives you the code, which is the point. The cost is that your copy
 * stops receiving fixes: when a safe zone changes, an export constraint lands,
 * or a bug is fixed in the item you started from, nothing tells you. That is
 * the gap between "you own a copy" and shadcn's "you own the file and can
 * still diff it against upstream".
 *
 * A scene records `origin.sourceHash` at eject time. This compares that
 * against the registry item today: same hash means nothing upstream changed,
 * a different hash means it did and you may want to look.
 *
 * It deliberately does NOT try to merge. Your copy has diverged on purpose —
 * the useful thing is knowing, and seeing what moved.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";

/** The registry snapshot ships beside the CLI in the skill bundle, and at the
 *  repo root in dev. Same two-candidate shape as resolveDist. */
function registryRoot() {
  const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const dir of [join(cliRoot, "registry"), resolve(cliRoot, "..", "registry")]) {
    if (existsSync(join(dir, "r"))) return dir;
  }
  return null;
}

/** Stable hash of an item's source — the same function eject uses. */
export function hashSource(source) {
  return createHash("sha256").update(source ?? "", "utf8").digest("hex").slice(0, 16);
}

/** Upstream source for a registry item, or null when it isn't in the snapshot. */
function upstreamSource(itemName, root = registryRoot()) {
  if (!root) return null;
  const file = join(root, "r", `${itemName}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"))?.files?.[0]?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Compare every ejected scene against its origin.
 * Returns [{ sceneIndex, templateId, status, item, detail }] where status is
 * one of: "no-origin" | "unknown-item" | "current" | "upstream-changed".
 */
export function diffConfig(config, { registryDir } = {}) {
  const results = [];
  config.scenes.forEach((scene, i) => {
    if (!scene.componentSource) return;
    const origin = scene.origin;
    if (!origin?.item) {
      results.push({
        sceneIndex: i,
        templateId: scene.templateId,
        status: "no-origin",
        detail: "ejected without provenance — nothing records what it came from",
      });
      return;
    }
    const upstream = upstreamSource(origin.item, registryDir ?? registryRoot());
    if (upstream == null) {
      results.push({
        sceneIndex: i, templateId: scene.templateId, item: origin.item, status: "unknown-item",
        detail: `"${origin.item}" is not in this registry snapshot`,
      });
      return;
    }
    const now = hashSource(upstream);
    if (!origin.sourceHash || origin.sourceHash === now) {
      results.push({ sceneIndex: i, templateId: scene.templateId, item: origin.item, status: "current" });
      return;
    }
    results.push({
      sceneIndex: i, templateId: scene.templateId, item: origin.item, status: "upstream-changed",
      detail: `ejected from ${origin.sourceHash}${origin.ejectedAt ? ` on ${origin.ejectedAt.slice(0, 10)}` : ""}; upstream is now ${now}`,
    });
  });
  return results;
}

export function diffCommand(configPath, { json = false } = {}) {
  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    console.error(`[vanillasky] error: ${err?.message ?? err}`);
    return 1;
  }

  const results = diffConfig(config);
  if (json) {
    console.log(JSON.stringify({ scenes: results }, null, 2));
    return results.some((r) => r.status === "upstream-changed") ? 1 : 0;
  }

  if (results.length === 0) {
    console.log("No ejected scenes — nothing to diff.");
    return 0;
  }

  let changed = 0;
  for (const r of results) {
    const where = `scene ${r.sceneIndex + 1} (${r.templateId})`;
    if (r.status === "current") {
      console.log(`  ✓ ${where} — up to date with ${r.item}`);
    } else if (r.status === "upstream-changed") {
      changed++;
      console.log(`  ⚠ ${where} — ${r.item} changed upstream since you ejected`);
      console.log(`      ${r.detail}`);
      console.log(`      compare: https://vanillasky.ai/r/${r.item}.json`);
    } else {
      console.log(`  · ${where} — ${r.detail}`);
    }
  }
  if (changed > 0) {
    console.log(
      `\n${changed} ejected scene${changed > 1 ? "s are" : " is"} based on source that has since changed.\n` +
      `Your copy still renders — this is information, not an error. Read the upstream item to see what moved.`,
    );
  }
  return 0;
}
