/**
 * `vanillasky studio <config.json>` — serve the bundled editor locally.
 *
 * Starts the same static server the renderer uses, plus the loopback-only
 * `/__local/config` route, and opens /studio in the platform browser. Edits
 * save straight back to the file on disk. Nothing leaves the machine.
 *
 * The process stays alive until Ctrl+C, because the page needs the server.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDist, startServer } from "./server.mjs";
import { loadConfig } from "./config.mjs";

export async function studioCommand(configPath, opts = {}) {
  const path = resolve(configPath);
  if (!existsSync(path)) throw new Error(`no such config: ${path}`);
  // Parse once up front so an unopenable config fails here with the good
  // error message, not as a fetch failure inside the page.
  const config = loadConfig(path);

  const dist = resolveDist();
  const token = randomBytes(24).toString("hex");
  const server = await startServer(dist, { localConfig: { path, token } });
  const url = `${server.baseUrl}/studio?token=${token}`;

  console.log(`[vanillasky] studio: ${config.scenes.length} scene(s) from ${path}`);
  console.log(`[vanillasky] ${url}`);
  console.log(`[vanillasky] edits save back to ${path} — Ctrl+C to stop`);
  if (opts.open !== false) openInBrowser(url);

  await new Promise((resolvePromise) => {
    const stop = () => {
      console.log("\n[vanillasky] studio stopped");
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
