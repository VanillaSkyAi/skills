/**
 * local-routes — the `/__local/*` API the bundled Studio talks to.
 *
 * This server is loopback-only, but that alone is not a security boundary: any
 * page in the same browser can reach 127.0.0.1, and DNS rebinding can make a
 * hostile origin look same-site. So every route here checks three things —
 * the Host header resolves to loopback, the Origin (when present) is exactly
 * ours, and the token arrives in a header, never a query string.
 *
 * The token reaches the page in the URL *fragment*, which browsers never send
 * over HTTP, and the page strips it from history on load.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, lstatSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX_CONFIG_BYTES = 8 * 1024 * 1024;

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    ...extra,
  });
  res.end(JSON.stringify(body));
};

/**
 * Host must be loopback and, when the browser sends an Origin, it must be
 * exactly this server. Blocks DNS rebinding (an attacker domain resolving to
 * 127.0.0.1 arrives with its own Host) and cross-origin POSTs.
 */
function originOk(req, port) {
  const host = req.headers.host ?? "";
  const hostOk = host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
  if (!hostOk) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  return true;
}

const readBody = (req, limit) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > limit) { reject(new Error("body too large")); req.destroy(); }
  });
  req.on("end", () => resolve(raw));
  req.on("error", reject);
});

/**
 * Handle a /__local/* request. Returns true when it owned the request.
 * `ctx` = { session, port, dist }.
 */
export async function handleLocalRoute(req, res, url, ctx) {
  const { session, port } = ctx;
  const route = url.pathname.slice("/__local".length);

  if (!originOk(req, port)) return json(res, 403, { error: "bad Host or Origin" }), true;

  // Bundled music is fetched by an <audio> element, which cannot send a
  // custom header — requiring the token here 403s the file, the element never
  // loads, and since playback advances off audioElement.currentTime the whole
  // preview sits frozen at zero. These are non-sensitive static assets that
  // ship with the tool, served only for filenames present in the manifest,
  // and the loopback + Host checks above still apply.
  if (route.startsWith("/audio/") && req.method === "GET") {
    const wanted = decodeURIComponent(route.slice("/audio/".length));
    const { tracks, audioDir } = ctx.loadTrackLibrary();
    const track = tracks.find((t) => t.file === wanted);
    if (!track) return json(res, 404, { error: "no such track" }), true;
    const file = join(audioDir, track.file);
    if (!existsSync(file)) return json(res, 404, { error: "track file missing" }), true;
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Referrer-Policy": "no-referrer",
      "Accept-Ranges": "none",
    });
    createReadStream(file).pipe(res);
    return true;
  }
  // Header only. A query-string token would ride in Referer, browser history
  // and any copied URL, and would make a simple cross-origin POST possible.
  if (req.headers["x-vs-token"] !== session.token) return json(res, 403, { error: "bad or missing token" }), true;

  try {
    if (route === "/config" && req.method === "GET") {
      return json(res, 200, session.snapshot()), true;
    }

    if (route === "/config" && req.method === "POST") {
      const body = JSON.parse(await readBody(req, MAX_CONFIG_BYTES));
      const config = body?.config;
      if (!config || typeof config !== "object" || !Array.isArray(config.scenes)) {
        return json(res, 400, { error: "body must be { config } with a scenes array" }), true;
      }
      const result = session.write(config, body.revision);
      if (result.conflict) {
        // Not an error the user caused — the file moved under them. The page
        // keeps its draft and offers reload-or-overwrite.
        return json(res, 409, { conflict: true, config: result.config, revision: result.revision }), true;
      }
      // A config that fails validation is still THEIR file and still gets
      // written — refusing the save would lose work mid-edit. The errors come
      // back so the editor can show them inline, and Export can refuse.
      const validation = ctx.validate ? ctx.validate(config) : null;
      return json(res, 200, { saved: true, revision: result.revision, validation }), true;
    }

    if (route === "/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "Referrer-Policy": "no-referrer",
      });
      res.write(": connected\n\n");
      const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
      const off = session.addListener(send);
      const cleanup = () => { clearInterval(heartbeat); off(); };
      req.on("close", cleanup);
      req.on("error", cleanup);
      return true;
    }

    if (route === "/tracks" && req.method === "GET") {
      // The bundled manifest, shaped like the web app's track_configs rows so
      // AudioTab needs no changes. audio_url points back at this server.
      const { tracks } = ctx.loadTrackLibrary();
      return json(res, 200, {
        tracks: tracks.map((t) => ({
          id: t.id, // slug — what `trackId` in a config means to the renderer
          name: t.name,
          audio_url: `/__local/audio/${encodeURIComponent(t.file)}`,
          duration: t.duration,
          beat_markers: null,
          description: t.description ?? null,
          mood_tags: { mood: t.moods ?? [], energy: t.energy, movement: t.movement },
          types: [],
        })),
      }), true;
    }

    if (route === "/search-media" && req.method === "POST") {
      const body = JSON.parse(await readBody(req, 8 * 1024));
      const query = typeof body?.query === "string" ? body.query.trim() : "";
      if (!query) return json(res, 400, { error: "query required" }), true;
      // The key is the user's own and the request goes straight from this
      // machine to Pexels — no VanillaSky endpoint in the path.
      const key = ctx.getPexelsApiKey?.();
      if (!key) {
        return json(res, 200, {
          configured: false,
          hint: "Add a free Pexels key to search stock footage — run `vanillasky setup`, or set PEXELS_API_KEY.",
        }), true;
      }
      try {
        const results = await ctx.searchPexels({
          apiKey: key.key,
          query,
          type: body.type === "photo" ? "photo" : "video",
          orientation: body.orientation === "landscape" ? "landscape" : "portrait",
          perPage: 15,
        });
        return json(res, 200, { configured: true, results }), true;
      } catch (err) {
        return json(res, 200, { configured: true, results: [], error: String(err?.message ?? err) }), true;
      }
    }

    if (route === "/render" && req.method === "POST") {
      if (session.render?.running) return json(res, 409, { error: "a render is already running" }), true;
      startRender(ctx).catch(() => { /* reported over SSE */ });
      return json(res, 202, { started: true }), true;
    }

    if (route === "/reveal" && req.method === "POST") {
      // Deliberately takes NO path from the client: otherwise this is a
      // "make the OS open anything" endpoint reachable from a browser.
      const target = session.lastRenderPath;
      if (!target || !existsSync(target)) return json(res, 404, { error: "nothing rendered yet" }), true;
      // Refuse a symlinked output — that's the one way this could be pointed
      // somewhere we didn't write. Comparing realpath to the literal path
      // would instead reject every normal file under a symlinked ancestor
      // (/tmp is a symlink to /private/tmp on macOS), so check the leaf only.
      if (lstatSync(target).isSymbolicLink()) {
        return json(res, 400, { error: "refusing to open a symlinked output" }), true;
      }
      const real = realpathSync(target);
      if (!real.endsWith(".mp4")) return json(res, 400, { error: "not a rendered video" }), true;
      openPath(real);
      return json(res, 200, { opened: real }), true;
    }

    return json(res, 404, { error: "no such local route" }), true;
  } catch (err) {
    return json(res, 400, { error: String(err?.message ?? err) }), true;
  }
}

/**
 * Render through the same code path as `vanillasky render`, reporting
 * structured progress over SSE. Runs in-process with an onProgress callback
 * rather than scraping a child's console output — that output is presentation
 * text, not an interface.
 */
async function startRender(ctx) {
  const { session, renderCommand, fps } = ctx;
  const outPath = join(dirname(session.path), "video.mp4");
  // Render to a temp name and rename on success: ffmpeg runs with -y, so a
  // failed render would otherwise leave a truncated file where a good one was.
  const tmpPath = join(dirname(session.path), `.video.${process.pid}.tmp.mp4`);

  session.setRender({ running: true, phase: "starting", frames: 0, total: 0, etaSec: null });
  try {
    await renderCommand(session.path, {
      out: tmpPath,
      fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
      scale: 1,
      pages: 4,
      validate: true,
      quiet: true,
      onProgress: (p) => session.setRender({ running: true, ...p }),
    });
    if (existsSync(outPath)) unlinkSync(outPath);
    renameSync(tmpPath, outPath);
    session.setRender({ running: false, phase: "done", path: outPath });
  } catch (err) {
    if (existsSync(tmpPath)) { try { unlinkSync(tmpPath); } catch { /* best effort */ } }
    session.setRender({ running: false, phase: "error", error: String(err?.message ?? err).split("\n")[0] });
  }
}

/** Platform opener, arguments passed as argv — never through a shell. */
function openPath(target) {
  try {
    const [cmd, args] = process.platform === "darwin" ? ["open", ["-R", target]]
      : process.platform === "win32" ? ["explorer", [`/select,${target}`]]
      : ["xdg-open", [dirname(target)]];
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch { /* a failed opener is not worth failing the request */ }
}
