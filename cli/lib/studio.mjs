/**
 * `vanillasky studio <config.json>` — serve the bundled editor locally.
 *
 * The agent composes a config and hands off here; the user edits, watches the
 * preview, and exports when it looks right. Nothing leaves the machine: the
 * page, the preview, the render and the file writes are all local.
 *
 * The token goes in the URL *fragment*, not the query string — fragments are
 * never sent in HTTP requests, so it stays out of Referer headers and server
 * logs. The page reads it once and strips it from history.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDist, startServer } from "./server.mjs";
import { loadConfig } from "./config.mjs";
import { validateConfig } from "./validate.mjs";
import { renderCommand } from "./render.mjs";
import { getPexelsApiKey, searchPexels } from "./pexels.mjs";
import { loadTrackLibrary } from "./audio-library.mjs";
import { LocalSession } from "./local-session.mjs";

export async function studioCommand(configPath, opts = {}) {
  const path = resolve(configPath);
  if (!existsSync(path)) throw new Error(`no such config: ${path}`);
  // Parse once up front so a broken config fails here with a good message
  // rather than as a fetch error inside the page.
  const config = loadConfig(path);

  const dist = resolveDist();
  const session = new LocalSession(path);
  session.startWatching();

  const server = await startServer(dist, {
    session,
    validate: (cfg) => {
      const r = validateConfig(cfg);
      return { errors: r.errors ?? [], warnings: r.warnings ?? [] };
    },
    renderCommand,
    // Export MP4 in the editor is the same renderer as `vanillasky render`,
    // so it needs the same fps. Hardcoding 30 here silently re-introduced
    // judder on 25fps footage that the CLI render had just avoided.
    fps: Number.isFinite(opts.fps) && opts.fps > 0 ? opts.fps : 30,
    getPexelsApiKey,
    searchPexels,
    loadTrackLibrary,
  });

  const url = `${server.baseUrl}/studio#token=${session.token}`;
  console.log(`[vanillasky] studio: ${config.scenes.length} scene(s) from ${path}`);
  console.log(`[vanillasky] ${url}`);
  console.log(`[vanillasky] edits save to ${path}; external changes reload live — Ctrl+C to stop`);
  // Stock search is the one editor feature that needs something from the
  // user. Say so once here rather than letting them find an empty picker.
  if (!getPexelsApiKey()) {
    console.log(`[vanillasky] no Pexels key — stock search is off. Add one free at pexels.com/api, then \`vanillasky setup\``);
  }
  if (opts.open !== false) openInBrowser(url);

  await new Promise((resolvePromise) => {
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      console.log("\n[vanillasky] studio stopped");
      session.close();
      server.close().then(resolvePromise, resolvePromise);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

/** Best-effort browser launch — a failed opener never fails the command. */
function openInBrowser(url) {
  try {
    const [cmd, args] = process.platform === "darwin" ? ["open", [url]]
      : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => console.warn("[vanillasky] couldn't open a browser — copy the URL above"));
    child.unref();
  } catch {
    console.warn("[vanillasky] couldn't open a browser — copy the URL above");
  }
}
