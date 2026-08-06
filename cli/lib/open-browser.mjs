/**
 * Opening the Studio URL in a browser the user is actually looking at.
 *
 * `open <url>` on macOS hands the URL to whatever LaunchServices has
 * registered for http://, which is not necessarily the browser the user works
 * in — a machine whose default is Arc while the user lives in Chrome opens the
 * Studio in Arc, and from the user's seat that is indistinguishable from "it
 * didn't open". Hence an explicit override, and output that names where the
 * URL went so a wrong-window open is visible rather than silent.
 */

import { spawn } from "node:child_process";

/**
 * The command that opens `url`, optionally in a named browser.
 *
 * `browser` is an application name on macOS ("Google Chrome", "Safari", "Arc"),
 * an executable elsewhere. Falsy means the system default.
 *
 * Returns [cmd, args]. Split out from the spawn so the platform matrix is
 * testable without launching anything.
 */
export function browserOpenCommand(url, browser, platform = process.platform) {
  const named = typeof browser === "string" && browser.trim() ? browser.trim() : null;
  if (platform === "darwin") {
    return named ? ["open", ["-a", named, url]] : ["open", [url]];
  }
  if (platform === "win32") {
    // The empty string is `start`'s title argument — without it a quoted
    // browser name is consumed as the window title and nothing opens.
    return named ? ["cmd", ["/c", "start", "", named, url]] : ["cmd", ["/c", "start", "", url]];
  }
  return named ? [named, [url]] : ["xdg-open", [url]];
}

/**
 * Best-effort browser launch — a failed opener never fails the command, but it
 * does say so, and a named browser that won't start falls back to the default
 * rather than leaving the user with nothing.
 */
export function openInBrowser(url, { browser = null, log = console.log, platform = process.platform } = {}) {
  const [cmd, args] = browserOpenCommand(url, browser, platform);
  const fallback = () => {
    if (!browser) return;
    log(`[vanillasky] couldn't open ${browser} — falling back to your default browser`);
    openInBrowser(url, { browser: null, log, platform });
  };

  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      if (browser) fallback();
      else log("[vanillasky] couldn't open a browser — copy the URL above");
    });
    // A non-zero exit is how `open -a "Nope"` reports an unknown app; the
    // spawn itself succeeds, so the error handler above never sees it.
    child.on("exit", (code) => {
      if (code === 0) return;
      if (browser) fallback();
      else log("[vanillasky] couldn't open a browser — copy the URL above");
    });
    child.unref();
  } catch {
    log("[vanillasky] couldn't open a browser — copy the URL above");
  }
}

/** The line printed after launching, so where it opened is never a mystery. */
export function openNotice(browser) {
  return browser
    ? `[vanillasky] opening in ${browser}`
    : '[vanillasky] opening in your default browser — if it lands somewhere you are not looking, pass --browser "Google Chrome" or set "browser" in ~/.vanillasky/config.json';
}
