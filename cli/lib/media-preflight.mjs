import { request } from "playwright-core";

import { collectMediaUrls } from "./config.mjs";
import { proxyOption } from "./browser.mjs";

const supportedMime = (value) => /^(?:image|video)\//i.test(String(value ?? "").split(";", 1)[0].trim());

/** Fetch every remote scene asset before a render/export can turn it black. */
export async function preflightMedia(config, { context } = {}) {
  const urls = collectMediaUrls(config);
  if (urls.length === 0) return [];
  const ownContext = !context;
  const ctx = context ?? await request.newContext({ proxy: proxyOption() });
  try {
    const results = await Promise.all(urls.map(async (url) => {
      try {
        let response = await ctx.head(url, { timeout: 15_000 }).catch(() => null);
        let mime = response?.headers()?.["content-type"] ?? "";
        if (!response?.ok() || !supportedMime(mime)) {
          response = await ctx.get(url, { timeout: 20_000, headers: { Range: "bytes=0-1023" } });
          mime = response.headers()?.["content-type"] ?? "";
        }
        if (!response.ok()) {
          return { code: "media-unreachable", message: `${url} → HTTP ${response.status()}` };
        } else if (!supportedMime(mime)) {
          return { code: "media-mime-unsupported", message: `${url} → unsupported MIME type ${mime || "(missing)"}; expected image/* or video/*` };
        }
        return null;
      } catch (error) {
        return { code: "media-unreachable", message: `${url} → ${String(error?.message ?? error).split("\n")[0]}` };
      }
    }));
    return results.filter(Boolean);
  } finally {
    if (ownContext) await ctx.dispose();
  }
}
