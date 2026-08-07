import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { launchBrowser } from "./browser.mjs";

export function resolveCaptureTarget(input) {
  const raw = String(input ?? "").trim();
  if (/^https?:\/\//i.test(raw)) return new URL(raw).href;
  const path = resolve(raw);
  if (!existsSync(path)) throw new Error(`capture target does not exist: ${path}`);
  return pathToFileURL(path).href;
}

/** Screenshot a web URL or local HTML prototype into a reusable local asset. */
export async function captureCommand(input, {
  out = "capture.png",
  width = 1440,
  height = 900,
  launch = launchBrowser,
  log = console.log,
} = {}) {
  const target = resolveCaptureTarget(input);
  const output = resolve(out);
  mkdirSync(dirname(output), { recursive: true });
  const launched = await launch({ width, height });
  try {
    log(`[vanillasky] browser: ${launched.label}`);
    const page = await launched.browser.newPage({ viewport: { width, height } });
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(750);
    await page.screenshot({ path: output, type: "png" });
    log(`[vanillasky] captured ${target} → ${output}`);
    log(`[vanillasky] use ${JSON.stringify(output)} in any media variable; Studio and render serve local files automatically.`);
    return output;
  } finally {
    await launched.browser.close().catch(() => {});
  }
}
