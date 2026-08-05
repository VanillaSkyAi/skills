/**
 * Static server for the built app (SPA fallback to index.html).
 *
 * Files are read per-request — never cached in memory — so a rebuild of
 * dist/ is picked up without restarting anything (a cached index.html
 * referencing stale JS hashes renders a blank page).
 */
import { createServer } from "node:http";
import { existsSync, statSync, readFileSync } from "node:fs";
import { handleLocalRoute } from "./local-routes.mjs";
import { join, extname, dirname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".otf": "font/otf", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
  ".wasm": "application/wasm", ".txt": "text/plain", ".xml": "application/xml",
};

/**
 * Locate the built app: a dist/ shipped inside the CLI package first, then
 * the repo-root dist/ (dev mode, cli/ lives inside the repo).
 */
export function resolveDist() {
  const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [join(cliRoot, "dist"), resolve(cliRoot, "..", "dist")];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  throw new Error(
    `no built app found. Looked for:\n  ${candidates.join("\n  ")}\n` +
    `Run "npm run build" at the repo root first (dev mode), or use a CLI package that ships its own dist/.`,
  );
}

/**
 * Start serving `dist` on an ephemeral localhost port.
 *
 * `opts.session` (a LocalSession) additionally mounts the `/__local/*` API the
 * bundled Studio uses to read, save, watch and render the config. See
 * local-routes.mjs for why loopback binding alone isn't the security boundary.
 */
export function startServer(dist, opts = {}) {
  const session = opts.session ?? null;
  let boundPort = 0;
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url, "http://localhost");
        const pathname = decodeURIComponent(url.pathname);

        if (session && pathname.startsWith("/__local/")) {
          void handleLocalRoute(req, res, url, {
            session, port: boundPort, validate: opts.validate, renderCommand: opts.renderCommand,
          });
          return;
        }

        let filePath = normalize(join(dist, pathname));
        if (!filePath.startsWith(dist)) filePath = join(dist, "index.html");
        let body, ext;
        try {
          if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
          body = readFileSync(filePath);
          ext = extname(filePath).toLowerCase();
        } catch {
          body = readFileSync(join(dist, "index.html"));
          ext = ".html";
        }
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Cache-Control": ext === ".html" ? "no-store" : "no-cache",
          // The /vibeframe sandbox iframe (componentSource scenes) has an
          // opaque origin — without CORS it can't load the module scripts /
          // CSS it needs. Same reason vite.config.ts sets server.cors: true.
          // Localhost-only server, so "*" exposes nothing.
          "Access-Control-Allow-Origin": "*",
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(err?.message ?? err));
      }
    });
    server.on("error", rejectPromise);
    // 127.0.0.1, never 0.0.0.0 — the write route must not be reachable off-box.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      boundPort = port;
      resolvePromise({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
