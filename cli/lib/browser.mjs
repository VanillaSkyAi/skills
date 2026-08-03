/**
 * Browser acquisition. Order:
 *   1. Installed Chrome/Edge (common per-OS paths, then playwright channels)
 *   2. Playwright-downloaded Chromium (PLAYWRIGHT_BROWSERS_PATH or the
 *      default ms-playwright cache)
 *   3. Clear error — no auto-download in this version.
 *
 * playwright-core ships no browsers, so this is the whole story.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright-core";

const CHROME_PATHS = {
  linux: [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/opt/google/chrome/chrome",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean),
};

function defaultPlaywrightCache() {
  switch (process.platform) {
    case "darwin": return join(homedir(), "Library", "Caches", "ms-playwright");
    case "win32": return process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null;
    default: return join(homedir(), ".cache", "ms-playwright");
  }
}

function chromiumExecutableIn(revisionDir) {
  const candidates = {
    linux: join(revisionDir, "chrome-linux", "chrome"),
    darwin: join(revisionDir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
    win32: join(revisionDir, "chrome-win", "chrome.exe"),
  };
  const p = candidates[process.platform] ?? candidates.linux;
  return existsSync(p) ? p : null;
}

function findInstalledChrome() {
  for (const p of CHROME_PATHS[process.platform] ?? []) {
    if (existsSync(p)) return p;
  }
  return null;
}

function findPlaywrightChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, defaultPlaywrightCache()].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    // Prefer full chromium builds; headless-shell can't run the app UI-less pages reliably.
    const revisions = readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const rev of revisions) {
      const exe = chromiumExecutableIn(join(root, rev));
      if (exe) return exe;
    }
  }
  return null;
}

/**
 * Chromium ignores HTTPS_PROXY/HTTP_PROXY env vars — proxy must be passed as
 * launch options or remote media fetches silently fail behind a proxy.
 * localhost is always bypassed so the CLI's own static server is reachable.
 */
export function proxyOption() {
  const server =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;
  if (!server) return undefined;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";
  const bypass = [...new Set(["localhost", "127.0.0.1", ...noProxy.split(",").map((s) => s.trim()).filter(Boolean)])].join(",");
  return { server, bypass };
}

const INSTALL_HELP = `no usable browser found.

vanillasky drives an existing Chrome/Edge/Chromium — it does not download one. Fix any of:
  - Install Google Chrome (https://www.google.com/chrome/) or Microsoft Edge
  - Or install a Playwright Chromium:  npx playwright install chromium
    (optionally point PLAYWRIGHT_BROWSERS_PATH at the download directory)`;

/**
 * Launch ONE warm browser for the whole job (cold page load is ~13s — pay it
 * once, reuse pages). Returns { browser, label }.
 */
export async function launchBrowser({ width, height }) {
  const args = [
    // Faithful to trigger/export-video.ts — the proven deterministic setup.
    "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--disable-extensions", "--disable-background-networking",
    "--run-all-compositor-stages-before-draw",
    `--window-size=${width},${height}`,
  ];
  const proxy = proxyOption();
  const base = { headless: true, args, ...(proxy ? { proxy } : {}) };

  const installed = findInstalledChrome();
  if (installed) {
    return { browser: await chromium.launch({ ...base, executablePath: installed }), label: installed };
  }

  // Non-standard install locations: let playwright's channel resolution try.
  for (const channel of ["chrome", "msedge"]) {
    try {
      return { browser: await chromium.launch({ ...base, channel }), label: `channel:${channel}` };
    } catch {
      // channel not installed — keep going
    }
  }

  const pwChromium = findPlaywrightChromium();
  if (pwChromium) {
    return { browser: await chromium.launch({ ...base, executablePath: pwChromium }), label: pwChromium };
  }

  throw new Error(INSTALL_HELP);
}
