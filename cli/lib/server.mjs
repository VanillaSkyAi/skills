/**
 * Static server for the built app (SPA fallback to index.html).
 *
 * Files are read per-request — never cached in memory — so a rebuild of
 * dist/ is picked up without restarting anything (a cached index.html
 * referencing stale JS hashes renders a blank page).
 */
import { createServer } from "node:http";
import { existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
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
 * `opts.localConfig` ({ path, token }) additionally exposes GET/POST
 * `/__local/config` so the bundled Studio can read and write the config file
 * on disk. That route is the only way this server touches the filesystem for
 * writes, so it is gated twice: the socket is loopback-only, and every
 * request must carry the token the CLI minted at startup and handed to the
 * page. Without the token check, any web page open in the same browser could
 * POST to the port and rewrite the user's config.
 */
export function startServer(dist, opts = {}) {
  const localConfig = opts.localConfig ?? null;
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url, "http://localhost");
        const pathname = decodeURIComponent(url.pathname);

        if (localConfig && pathname === "/__local/config") {
          handleLocalConfig(req, res, url, localConfig);
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
      resolvePromise({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// ─── Local config route (bundled Studio) ────────────────────────

const MAX_LOCAL_CONFIG_BYTES = 8 * 1024 * 1024;

const jsonRes = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

/**
 * GET  → { config, path } read fresh from disk
 * POST → { config } written back, pretty-printed so the file stays diffable
 *
 * Both require the startup token. No CORS header is sent here on purpose:
 * this route is same-origin only, unlike the static assets which the
 * /vibeframe opaque origin needs to fetch.
 */
function handleLocalConfig(req, res, url, localConfig) {
  const token = req.headers["x-vs-token"] || url.searchParams.get("token");
  if (token !== localConfig.token) return jsonRes(res, 403, { error: "bad or missing token" });

  if (req.method === "GET") {
    try {
      const raw = readFileSync(localConfig.path, "utf8");
      return jsonRes(res, 200, { config: JSON.parse(raw), path: localConfig.path });
    } catch (err) {
      return jsonRes(res, 500, { error: `could not read ${localConfig.path}: ${err?.message ?? err}` });
    }
  }

  if (req.method === "POST") {
    let raw = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_LOCAL_CONFIG_BYTES && !tooBig) {
        tooBig = true;
        jsonRes(res, 413, { error: "config too large" });
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) return;
      try {
        const body = JSON.parse(raw);
        const config = body?.config;
        if (!config || typeof config !== "object" || !Array.isArray(config.scenes)) {
          return jsonRes(res, 400, { error: "body must be { config } with a scenes array" });
        }
        writeFileSync(localConfig.path, JSON.stringify(config, null, 2) + "\n");
        return jsonRes(res, 200, { ok: true, path: localConfig.path });
      } catch (err) {
        return jsonRes(res, 400, { error: `invalid JSON: ${err?.message ?? err}` });
      }
    });
    return;
  }

  return jsonRes(res, 405, { error: "GET or POST only" });
}
