/**
 * Render orchestration — all four modes (frame / sheet / draft / full).
 *
 * The full render is a faithful port of the proven screenshot path in
 * trigger/export-video.ts: autoplay=false, absolute-time __setFrame(t),
 * post-ready settle delay, capture retry with reload-recovery on a
 * cold-start hang, beginFrame never used. Parallelized across a small
 * page pool (frames are independent under the seek contract); encode
 * order stays sequential via an ordered drain into ffmpeg's stdin.
 */
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { request } from "playwright-core";
import { launchBrowser, proxyOption } from "./browser.mjs";
import { resolveFfmpeg, tryResolveFfmpeg } from "./ffmpeg.mjs";
import { resolveDist, startServer } from "./server.mjs";
import {
  loadConfig, encodeConfig, computeTotalDuration, sceneTimeRanges,
  collectMediaUrls, DEFAULT_AUDIO_FADE_MS, DEFAULT_FONT, ensureRenderableStyle,
  MAX_USABLE_FRAGMENT, hasInlineMedia,
} from "./config.mjs";
import { validateConfig, formatReport } from "./validate.mjs";
import { mergeDesignMdIntoConfig } from "./design-md.mjs";
import { resolveBundledTrack } from "./audio-library.mjs";
import { getPexelsApiKey, fillPexelsMedia } from "./pexels.mjs";

const READY_TIMEOUT_MS = 60_000;
const FRAME_SETTLE_TIMEOUT_MS = 10_000;
// Capture resilience, verbatim from trigger/export-video.ts: an intermittent
// capture hang would otherwise nuke the render. Each capture is bounded and
// retried; a page's FIRST capture pays the cold-start bill (page load, fonts,
// video decoder warmup) so it gets a longer ceiling, and its final attempt
// does a full reload instead of re-settling a stalled renderer.
const CAPTURE_TIMEOUT_MS = 18_000;
const FIRST_CAPTURE_TIMEOUT_MS = 25_000;
const CAPTURE_MAX_ATTEMPTS = 3;
const SETTLE_DELAY_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function renderCommand(configPath, opts) {
  const tStart = Date.now();
  const config = loadConfig(configPath);
  if (opts.designMd !== false) {
    mergeDesignMdIntoConfig(configPath, config, { log: console.log });
  }
  // Resolve mediaKeyword → mediaUrl via Pexels BEFORE validation, so resolved
  // scenes don't trip the media-keyword-unresolved warning.
  if (opts.pexels !== false) {
    const pexelsKey = getPexelsApiKey();
    if (pexelsKey) {
      const { filled, failed } = await fillPexelsMedia(config, { apiKey: pexelsKey.key });
      if (filled.length > 0) console.log(`[vanillasky] pexels: filled ${filled.length} media variable(s) (key from ${pexelsKey.source})`);
      for (const f of failed) console.warn(`[vanillasky] pexels: scene ${f.sceneIndex + 1} (${f.templateId}) "${f.keyword}" unresolved — scene falls back to its brand gradient`);
    }
  }
  if (opts.validate !== false) {
    const result = validateConfig(config);
    if (result.errors.length > 0) {
      console.error(formatReport(result, { name: configPath }));
      throw new Error("config failed validation — fix the errors above, or bypass with --no-validate");
    }
    for (const w of result.warnings) console.warn(`  ⚠ ${w.message}`);
  } else {
    console.warn("[vanillasky] --no-validate: skipping config validation");
  }
  if (ensureRenderableStyle(config)) {
    console.warn(`[vanillasky] config has no style — injecting default { font: "${DEFAULT_FONT}" } (the render page requires one)`);
  }
  const duration = computeTotalDuration(config);
  const orientation = config.orientation === "landscape" ? "landscape" : "portrait";
  const [baseW, baseH] = orientation === "landscape" ? [1920, 1080] : [1080, 1920];

  const scale = Math.min(1, Math.max(0.1, opts.scale));
  // libx264 yuv420p needs even dimensions.
  const W = 2 * Math.round((baseW * scale) / 2);
  const H = 2 * Math.round((baseH * scale) / 2);
  const fps = Math.min(60, Math.max(1, Math.round(opts.fps)));

  const mode = opts.frame !== undefined ? "frame" : opts.sheet ? "sheet" : opts.draft ? "draft" : "full";

  // ffmpeg: mandatory for the full render; best-effort for sheet composite
  // and draft audio muxing.
  const ffmpegPath = mode === "full" ? resolveFfmpeg() : tryResolveFfmpeg();

  const dist = resolveDist();
  const server = await startServer(dist);
  const tmpDir = mkdtempSync(join(tmpdir(), "vanillasky-"));
  let browser = null;

  try {
    console.log(`[vanillasky] ${config.scenes.length} scene(s), ${duration.toFixed(1)}s, ${orientation} ${W}x${H}${mode === "full" ? ` @ ${fps}fps` : ""}`);

    // Media prefetch — a media URL that fails over HTTP renders as a black
    // scene, so fail loudly up front instead.
    await prefetchMedia(config);

    const launched = await launchBrowser({ width: W, height: H });
    browser = launched.browser;
    console.log(`[vanillasky] browser: ${launched.label}`);

    const shared = {
      baseUrl: server.baseUrl, b64: encodeConfig(config),
      W, H, baseW, baseH, scale, fps, duration, config, orientation,
      ffmpegPath, tmpDir, tStart,
    };

    if (mode === "frame") return await runFrame(browser, shared, opts);
    if (mode === "sheet") return await runSheet(browser, shared, opts);
    const out = mode === "draft"
      ? await runDraft(browser, shared, opts)
      : await runFullRender(browser, shared, opts);
    // Quiet for programmatic callers (the Studio's render route) — they get
    // the path back and render their own UI.
    if (opts.quiet !== true) printOutputAffordances(out, shared, opts);
    return out;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Media prefetch ─────────────────────────────────────────────

async function prefetchMedia(config) {
  const urls = collectMediaUrls(config);
  if (!urls.length) return;
  console.log(`[vanillasky] prefetching ${urls.length} media URL(s)...`);
  const ctx = await request.newContext({ proxy: proxyOption() });
  const failures = [];
  await Promise.all(urls.map(async (url) => {
    try {
      let res = await ctx.head(url, { timeout: 15_000 }).catch(() => null);
      if (!res || !res.ok()) {
        // Some CDNs reject HEAD — retry as a ranged GET.
        res = await ctx.get(url, { timeout: 20_000, headers: { Range: "bytes=0-1023" } });
      }
      if (!res.ok()) failures.push(`${url} → HTTP ${res.status()}`);
    } catch (err) {
      failures.push(`${url} → ${String(err.message ?? err).split("\n")[0]}`);
    }
  }));
  await ctx.dispose();
  if (failures.length) {
    throw new Error(
      `media prefetch failed — refusing to render (these scenes would come out black):\n  ${failures.join("\n  ")}`,
    );
  }
}

// ─── Audio ──────────────────────────────────────────────────────

/**
 * Best-effort audio, in priority order:
 *   1. audioUrl http(s) — downloaded for muxing
 *   2. audioUrl as a local file path (absolute, relative, or file://)
 *   3. trackId resolved against the bundled library (cli/audio/tracks.json)
 * Anything unresolvable renders silent with a warning. Audio NEVER fails
 * the render.
 */
async function resolveAudioFile(config, tmpDir) {
  const audio = config.audio;
  if (!audio) return null;

  const rawUrl = typeof audio.audioUrl === "string" ? audio.audioUrl.trim() : "";
  if (/^https?:\/\//.test(rawUrl)) {
    try {
      const ctx = await request.newContext({ proxy: proxyOption() });
      const res = await ctx.get(rawUrl, { timeout: 30_000 });
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
      const body = await res.body();
      await ctx.dispose();
      const ext = extname(new URL(rawUrl).pathname) || ".mp3";
      const audioPath = join(tmpDir, `audio${ext}`);
      writeFileSync(audioPath, body);
      console.log(`[vanillasky] audio: ${rawUrl} (${(body.length / 1024).toFixed(0)} KB)`);
      return audioPath;
    } catch (err) {
      console.warn(`[vanillasky] audio download failed (${err.message}) — rendering silent`);
      return null;
    }
  }

  if (rawUrl) {
    const localPath = rawUrl.startsWith("file://") ? fileURLToPath(rawUrl) : resolve(rawUrl);
    if (existsSync(localPath)) {
      console.log(`[vanillasky] audio: local file ${localPath}`);
      return localPath;
    }
    console.warn(`[vanillasky] audioUrl "${rawUrl}" is neither a fetchable URL nor an existing local file`);
  }

  if (audio.trackId) {
    const hit = resolveBundledTrack(audio.trackId);
    if (hit?.path) {
      const { track } = hit;
      const meta = [typeof track.duration === "number" ? `${track.duration.toFixed(1)}s` : null, track.energy, ...(track.moods ?? [])].filter(Boolean).join(", ");
      console.log(`[vanillasky] audio: bundled track "${track.id}"${meta ? ` (${meta})` : ""}`);
      return hit.path;
    }
    if (hit) {
      console.warn(`[vanillasky] bundled track "${audio.trackId}" is in the manifest but its file is missing — rendering silent`);
    } else {
      console.warn(`[vanillasky] audio references trackId "${audio.trackId}" — not in the bundled library (run \`vanillasky tracks\` to list it) — rendering silent`);
    }
  }
  return null;
}

/**
 * Post-mux guard: the muxed audio must reach the end of the video.
 *
 * `-shortest` used to truncate it by a constant ~8.4s, and nothing in the
 * normal verification loop catches that — frames and contact sheets are silent.
 * The check costs one fast decode pass, so it always runs. It warns rather than
 * throws: a video with a short tail is still a video, and failing here would
 * discard a completed render.
 */
const AUDIO_TAIL_TOLERANCE_S = 0.35;

function verifyAudioTail(ffmpegPath, file, expected) {
  try {
    const probe = spawnSync(
      ffmpegPath,
      ["-v", "error", "-i", file, "-map", "0:a:0", "-f", "null", "-progress", "pipe:1", "-"],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    const times = [...String(probe.stdout || "").matchAll(/out_time_us=(\d+)/g)].map((m) => Number(m[1]));
    if (!times.length) return;
    const actual = Math.max(...times) / 1e6;
    const missing = expected - actual;
    if (missing > AUDIO_TAIL_TOLERANCE_S) {
      console.warn(
        `[vanillasky] WARNING: audio stops ${missing.toFixed(2)}s before the video ends ` +
          `(${actual.toFixed(2)}s of ${expected.toFixed(2)}s) — the tail will be silent`,
      );
    }
  } catch {
    // A diagnostic must never be the thing that breaks a render.
  }
}

/**
 * Audio filter mirroring the client export (trimAndFade + defaultFadeOutMs):
 * volume scaling and a fade-out that ends exactly at the video end, clamped
 * to the video length. Track shorter than the video loops (-stream_loop -1
 * on the input + an explicit -t on the output trims to video length).
 *
 * -t rather than -shortest: with frames arriving over the capture pipe,
 * -shortest ended the audio stream early — a constant ~8.4s short whatever
 * the video length — leaving the tail of every render silent.
 */
function audioFilterFor(config, duration) {
  const fadeMs = config.audio?.fadeOutMs ?? DEFAULT_AUDIO_FADE_MS;
  const fade = Math.min(fadeMs / 1000, duration);
  const volume = config.audio?.volume ?? 1;
  const parts = [];
  if (volume !== 1) parts.push(`volume=${volume}`);
  if (fade > 0) parts.push(`afade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade.toFixed(3)}`);
  return parts.length ? parts.join(",") : null;
}

// ─── Page lifecycle (Render.tsx contract) ───────────────────────

/**
 * Open /render with the inline config and wait for full readiness:
 * __ready gate → in-page media backstop → initial __setFrame(0) settle →
 * fixed settle delay. Same sequence as trigger/export-video.ts's
 * waitForRenderReady; the returned reload() re-runs it (frame-0 recovery).
 */
async function openRenderPage(browser, { baseUrl, b64, W, H, baseW, baseH }) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(READY_TIMEOUT_MS);
  const url = `${baseUrl}/render?autoplay=false#config=${b64}`;

  const ready = async () => {
    await page.waitForFunction(() => window.__ready === true, { timeout: READY_TIMEOUT_MS });

    // A custom_* scene whose componentSource was rejected renders an empty
    // body inside SceneFrame — i.e. a black frame — and used to exit 0. The
    // render page records those rejections; fail loudly with the real reason
    // instead of writing a black PNG.
    const hydrationErrors = await page.evaluate(
      () => window.__vanillaskyHydrationErrors ?? [],
    );
    if (hydrationErrors.length > 0) {
      const lines = hydrationErrors.map((e) => `  ✗ ${e.templateId}: ${e.reason}`).join("\n");
      throw new Error(
        `custom scene${hydrationErrors.length > 1 ? "s" : ""} failed to load — the frame would render empty:\n${lines}\n` +
          `  Run \`vanillasky validate <config>\` for the full contract, or \`vanillasky scope\` for the helpers a componentSource can use.`,
      );
    }

    // Media backstop from trigger/export-video.ts: images complete AND
    // videos past HAVE_CURRENT_DATA, so the first capture can't screenshot
    // a black/poster frame. Safety valves keep a slow CDN from hanging.
    await page.evaluate(() => {
      const waitImgs = new Promise((resolveP) => {
        const imgs = document.querySelectorAll("img");
        if (!imgs.length) { resolveP(); return; }
        let n = 0;
        const done = () => { if (++n >= imgs.length) resolveP(); };
        imgs.forEach((i) => { if (i.complete) done(); else { i.onload = done; i.onerror = done; } });
        setTimeout(resolveP, 5000);
      });
      const waitVideos = new Promise((resolveP) => {
        const vids = document.querySelectorAll("video");
        if (!vids.length) { resolveP(); return; }
        let n = 0;
        const done = () => { if (++n >= vids.length) resolveP(); };
        vids.forEach((v) => {
          if (v.readyState >= 2) { done(); return; }
          const settle = () => { v.removeEventListener("loadeddata", settle); v.removeEventListener("seeked", settle); done(); };
          v.addEventListener("loadeddata", settle, { once: true });
          v.addEventListener("seeked", settle, { once: true });
          v.addEventListener("error", done, { once: true });
        });
        setTimeout(resolveP, 8000);
      });
      return Promise.all([waitImgs, waitVideos]).then(() => undefined);
    });

    // Scaled render: the page always lays out at full config resolution;
    // scale the render target down to the (smaller) viewport.
    if (W !== baseW || H !== baseH) {
      await page.evaluate(([sx, sy]) => {
        const el = document.getElementById("render-target");
        if (el) {
          el.style.transform = `scale(${sx}, ${sy})`;
          el.style.transformOrigin = "top left";
        }
      }, [W / baseW, H / baseH]);
    }

    await page.evaluate(() => window.__setFrame(0));
    await page.waitForFunction(() => window.__frameReady === true, { timeout: 5000 });
    await sleep(SETTLE_DELAY_MS);
  };

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await ready();

  const reload = async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
  };
  return { page, reload };
}

/** Absolute-time frame settle: __setFrame(t) then wait for __frameReady. */
async function settleFrame(page, t) {
  await page.evaluate((time) => window.__setFrame(time), t);
  await page.waitForFunction(() => window.__frameReady === true, { timeout: FRAME_SETTLE_TIMEOUT_MS });
}

/**
 * Settle + screenshot with bounded retries. A page's first capture gets the
 * longer cold-start ceiling and, on its final attempt, a full page reload —
 * re-settling a wedged renderer doesn't help, a reload does (every prod
 * frame-0 failure 2026-06-10/11).
 */
async function captureFrameWithRetry(worker, t, { firstForPage, clip, type, quality }) {
  let lastErr;
  for (let attempt = 1; attempt <= CAPTURE_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt === CAPTURE_MAX_ATTEMPTS && firstForPage) {
        console.warn(`[vanillasky] reloading page before final capture attempt at t=${t.toFixed(2)}s`);
        await worker.reload();
      }
      await settleFrame(worker.page, t);
      return await worker.page.screenshot({
        type, ...(quality ? { quality } : {}), clip, animations: "allow",
        timeout: firstForPage ? FIRST_CAPTURE_TIMEOUT_MS : CAPTURE_TIMEOUT_MS,
      });
    } catch (err) {
      lastErr = err;
      if (attempt < CAPTURE_MAX_ATTEMPTS) {
        console.warn(`[vanillasky] capture retry ${attempt} at t=${t.toFixed(2)}s: ${String(err.message).split("\n")[0]}`);
      }
    }
  }
  throw new Error(`screenshot failed at t=${t.toFixed(2)}s after ${CAPTURE_MAX_ATTEMPTS} attempts: ${lastErr?.message}`);
}

// ─── Mode: single frame ─────────────────────────────────────────

async function runFrame(browser, shared, opts) {
  const t = Math.min(Math.max(0, opts.frame), Math.max(0, shared.duration - 1 / shared.fps));
  if (t !== opts.frame) console.warn(`[vanillasky] --frame ${opts.frame} clamped to ${t.toFixed(2)}s (video is ${shared.duration.toFixed(1)}s)`);
  const out = resolve(opts.out ?? `frame-${t.toFixed(2)}s.png`);

  const worker = await openRenderPage(browser, shared);
  const buf = await captureFrameWithRetry(worker, t, {
    firstForPage: true, type: "png",
    clip: { x: 0, y: 0, width: shared.W, height: shared.H },
  });
  writeFileSync(out, buf);
  console.log(`[vanillasky] frame at t=${t.toFixed(2)}s → ${out} (${(buf.length / 1024).toFixed(0)} KB, ${((Date.now() - shared.tStart) / 1000).toFixed(1)}s)`);
}

// ─── Mode: contact sheet ────────────────────────────────────────

async function runSheet(browser, shared, opts) {
  const outDir = resolve(opts.out ?? "sheet");
  mkdirSync(outDir, { recursive: true });

  const ranges = sceneTimeRanges(shared.config);
  // 5 evenly-spaced samples per scene at fractions .1/.3/.5/.7/.9 — stays
  // clear of the scene boundaries where transitions blend.
  const stamps = [];
  ranges.forEach((r, si) => {
    for (let i = 0; i < 5; i++) {
      const t = r.start + ((i + 0.5) / 5) * (r.end - r.start);
      stamps.push({ t, file: `scene${String(si + 1).padStart(2, "0")}-${r.templateId}-${i + 1}_t${t.toFixed(2)}s.png` });
    }
  });

  const worker = await openRenderPage(browser, shared);
  const clip = { x: 0, y: 0, width: shared.W, height: shared.H };
  const tileDir = join(shared.tmpDir, "tiles");
  mkdirSync(tileDir, { recursive: true });

  for (let i = 0; i < stamps.length; i++) {
    const { t, file } = stamps[i];
    const buf = await captureFrameWithRetry(worker, t, { firstForPage: i === 0, type: "png", clip });
    const p = join(outDir, file);
    writeFileSync(p, buf);
    copyFileSync(p, join(tileDir, `tile-${String(i).padStart(3, "0")}.png`));
    process.stdout.write(`\r[vanillasky] sheet ${i + 1}/${stamps.length}`);
  }
  process.stdout.write("\n");

  // Composited sheet: 5 columns × one row per scene, thumbnails at 270px wide.
  if (shared.ffmpegPath) {
    const sheetPath = join(outDir, "sheet.png");
    const ff = spawn(shared.ffmpegPath, [
      "-y", "-loglevel", "error",
      "-i", join(tileDir, "tile-%03d.png"),
      "-vf", `scale=270:-1,tile=5x${ranges.length}`,
      "-frames:v", "1", sheetPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let ffErr = "";
    ff.stderr.on("data", (d) => { ffErr += d; });
    const [code] = await once(ff, "close");
    if (code === 0) console.log(`[vanillasky] composited sheet → ${sheetPath}`);
    else console.warn(`[vanillasky] sheet composite failed (${ffErr.slice(-200)}) — individual PNGs are in ${outDir}`);
  } else {
    console.warn("[vanillasky] ffmpeg unavailable — skipping composited sheet (individual PNGs written)");
  }
  console.log(`[vanillasky] ${stamps.length} frames across ${ranges.length} scene(s) → ${outDir} (${((Date.now() - shared.tStart) / 1000).toFixed(1)}s)`);
}

// ─── Mode: draft (WebCodecs in-browser export) ──────────────────

async function runDraft(browser, shared, opts) {
  const out = resolve(opts.out ?? "video.mp4");
  if (opts.fps !== 30 || shared.scale !== 1) {
    console.warn("[vanillasky] --draft runs the in-browser WebCodecs pipeline at fixed 30fps / full resolution — --fps/--scale ignored");
  }
  const audioPath = await resolveAudioFile(shared.config, shared.tmpDir);

  const page = await browser.newPage({ viewport: { width: shared.baseW, height: shared.baseH } });
  page.setDefaultTimeout(READY_TIMEOUT_MS);
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const qs = new URLSearchParams({
    id: shared.config.scenes[0].templateId,
    orientation: shared.orientation,
    config: JSON.stringify(shared.config),
  });
  await page.goto(`${shared.baseUrl}/qa/template?${qs}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__qa?.ready === true, { timeout: 30_000 });
  console.log("[vanillasky] draft: running in-browser export (WebCodecs)...");

  const result = await page.evaluate(async () => {
    try {
      return { ok: true, ...(await window.__qa.exportMp4()) };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });
  if (!result.ok) {
    throw new Error(`draft export failed: ${result.error}${errors.length ? `\npage errors:\n  ${errors.join("\n  ")}` : ""}`);
  }
  const mp4 = Buffer.from(result.dataUrl.split(",")[1], "base64");

  if (audioPath && shared.ffmpegPath) {
    const silentPath = join(shared.tmpDir, "draft-silent.mp4");
    writeFileSync(silentPath, mp4);
    const filter = audioFilterFor(shared.config, shared.duration);
    const ff = spawn(shared.ffmpegPath, [
      "-y", "-loglevel", "error",
      "-i", silentPath,
      "-stream_loop", "-1", "-i", audioPath,
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      ...(filter ? ["-af", filter] : []),
      "-t", shared.duration.toFixed(3), "-movflags", "+faststart", out,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let ffErr = "";
    ff.stderr.on("data", (d) => { ffErr += d; });
    const [code] = await once(ff, "close");
    if (code !== 0) {
      console.warn(`[vanillasky] audio mux failed (${ffErr.slice(-200)}) — writing silent video`);
      writeFileSync(out, mp4);
    } else {
      verifyAudioTail(shared.ffmpegPath, out, shared.duration);
    }
  } else {
    if (audioPath && !shared.ffmpegPath) console.warn("[vanillasky] ffmpeg unavailable — draft written without audio");
    writeFileSync(out, mp4);
  }
  const size = statSync(out).size;
  console.log(`[vanillasky] draft → ${out} (${(size / 1024).toFixed(0)} KB, ${result.duration}s, ${((Date.now() - shared.tStart) / 1000).toFixed(1)}s wall)`);
  return out;
}

// ─── Mode: full render (screenshot path + ffmpeg) ───────────────

async function runFullRender(browser, shared, opts) {
  const out = resolve(opts.out ?? "video.mp4");
  const { W, H, fps, duration, ffmpegPath, config } = shared;
  const totalFrames = Math.ceil(duration * fps);
  const pageCount = Math.max(1, Math.min(Math.round(opts.pages), 8, totalFrames));

  const audioPath = await resolveAudioFile(config, shared.tmpDir);

  const tWarm0 = Date.now();
  const workers = await Promise.all(
    Array.from({ length: pageCount }, () => openRenderPage(browser, shared)),
  );
  const warmupMs = Date.now() - tWarm0;
  console.log(`[vanillasky] ${pageCount} page(s) warm in ${(warmupMs / 1000).toFixed(1)}s — capturing ${totalFrames} frames`);

  const filter = audioPath ? audioFilterFor(config, duration) : null;
  const ffmpeg = spawn(ffmpegPath, [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "pipe:0",
    ...(audioPath ? ["-stream_loop", "-1", "-i", audioPath] : []),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    ...(audioPath ? ["-c:a", "aac", "-b:a", "192k", ...(filter ? ["-af", filter] : []), "-t", duration.toFixed(3)] : []),
    "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffmpegError = "";
  ffmpeg.stderr.on("data", (d) => { ffmpegError += d.toString(); });
  // Swallow EPIPE on stdin if ffmpeg dies mid-render — the exit-code check
  // below surfaces the real error (ffmpeg's stderr), not the pipe symptom.
  ffmpeg.stdin.on("error", () => {});
  const ffmpegClosed = new Promise((resolveP) => {
    ffmpeg.on("error", (err) => resolveP({ code: -1, spawnErr: err }));
    ffmpeg.on("close", (code) => resolveP({ code, spawnErr: null }));
  });

  // Ordered drain: workers capture any frame; ffmpeg's stdin only ever sees
  // frames in sequence. Buffered out-of-order frames are bounded by the
  // backpressure check in the worker loop.
  const buffers = new Map();
  let nextFrame = 0;
  let written = 0;
  let captured = 0;
  let flushing = false;

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      while (buffers.has(written)) {
        const buf = buffers.get(written);
        buffers.delete(written);
        if (!ffmpeg.stdin.write(buf)) await once(ffmpeg.stdin, "drain");
        written++;
      }
    } finally {
      flushing = false;
    }
  };

  const tCap0 = Date.now();
  // opts.onProgress is the machine-readable channel — the Studio consumes
  // this rather than scraping the console line below, which is presentation
  // text (\r in a TTY, 2s cadence when piped) and not an interface.
  const progress = setInterval(() => {
    const elapsed = (Date.now() - tCap0) / 1000;
    const rate = captured / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? (totalFrames - captured) / rate : 0;
    opts.onProgress?.({ phase: "capture", frames: captured, total: totalFrames, fps: rate, etaSec: Math.ceil(eta) });
    const line = `[vanillasky] ${captured}/${totalFrames} frames  ${rate.toFixed(1)} fps  ETA ${Math.ceil(eta)}s`;
    if (process.stdout.isTTY) process.stdout.write(`\r${line}   `);
    else console.log(line);
  }, process.stdout.isTTY ? 500 : 2000);

  const clip = { x: 0, y: 0, width: W, height: H };
  const runWorker = async (worker) => {
    let firstForPage = true;
    for (;;) {
      const frame = nextFrame++;
      if (frame >= totalFrames) return;
      // Backpressure: don't let fast pages race ahead of the encoder.
      while (buffers.size > pageCount * 8) await sleep(25);
      const buf = await captureFrameWithRetry(worker, frame / fps, {
        firstForPage, type: "jpeg", quality: 92, clip,
      });
      firstForPage = false;
      buffers.set(frame, buf);
      captured++;
      await flush();
    }
  };

  try {
    await Promise.all(workers.map(runWorker));
    await flush();
  } finally {
    clearInterval(progress);
    if (process.stdout.isTTY) process.stdout.write("\n");
  }
  const captureMs = Date.now() - tCap0;

  ffmpeg.stdin.end();
  const tEnc0 = Date.now();
  const { code, spawnErr } = await ffmpegClosed;
  if (spawnErr) throw new Error(`ffmpeg failed to start: ${spawnErr.message}`);
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${ffmpegError.slice(-500)}`);
  const encodeTailMs = Date.now() - tEnc0;
  if (audioPath) verifyAudioTail(ffmpegPath, out, duration);

  const size = statSync(out).size;
  const totalS = (Date.now() - shared.tStart) / 1000;
  console.log(
    `[vanillasky] done → ${out} (${(size / 1024 / 1024).toFixed(1)} MB)\n` +
    `[vanillasky] ${totalFrames} frames @ ${(totalFrames / (captureMs / 1000)).toFixed(1)} fps capture · ` +
    `warmup ${(warmupMs / 1000).toFixed(1)}s · capture ${(captureMs / 1000).toFixed(1)}s · ` +
    `encode tail ${(encodeTailMs / 1000).toFixed(1)}s · total ${totalS.toFixed(1)}s` +
    (audioPath ? " · audio muxed" : ""),
  );
  return out;
}

// ─── Post-render output affordances ─────────────────────────────

/**
 * Completion block after a successful full/draft render: where the MP4 is,
 * plus zero-install links to watch it in the browser and open it in the
 * Studio for chat-driven iteration. shared.b64 is the exact config that was
 * rendered (post DESIGN.md merge / Pexels fill / style injection).
 *
 * The links carry the config in the URL fragment, so they need no server of
 * ours — but a config that inlines a screenshot or logo as a `data:` URL
 * blows past any usable URL length. In that case say so instead of printing
 * a quarter-megabyte link nobody can use.
 */
function printOutputAffordances(out, shared, opts) {
  const base = (opts.base ?? "https://vanillasky.ai").replace(/\/+$/, "");
  const size = statSync(out).size;
  const header = `\n  Output:           ${out} (${shared.duration.toFixed(1)}s, ${(size / 1024 / 1024).toFixed(1)} MB)`;

  const inline = hasInlineMedia(shared.config);
  if (inline || shared.b64.length > MAX_USABLE_FRAGMENT) {
    console.log(
      `${header}\n` +
      `  Share links:      none — this config is ${(shared.b64.length / 1024).toFixed(0)}KB in a URL.\n` +
      (inline
        ? `                    It embeds media as data: URLs. Reference that media by https URL\n` +
          `                    or a local file path to get shareable links back.`
        : `                    Trim it below ${MAX_USABLE_FRAGMENT / 1024}KB to get shareable links back.`),
    );
  } else {
    console.log(
      `${header}\n` +
      `  Watch in browser: ${base}/render#config=${shared.b64}\n` +
      `  Open in Studio:   ${base}/create#config=${shared.b64}\n` +
      `  (links require the deployed site to support inline configs — use --base for previews)`,
    );
  }
  if (opts.open) openWithPlatformViewer(out);
}

/** Best-effort platform opener — a failed viewer launch never fails the render. */
function openWithPlatformViewer(path) {
  try {
    const [cmd, args] = process.platform === "darwin" ? ["open", [path]]
      : process.platform === "win32" ? ["cmd", ["/c", "start", "", path]]
      : ["xdg-open", [path]];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", (err) => {
      console.warn(`[vanillasky] --open: could not launch a viewer (${err.message}) — open ${path} manually`);
    });
    child.unref();
  } catch (err) {
    console.warn(`[vanillasky] --open: could not launch a viewer (${err?.message ?? err}) — open ${path} manually`);
  }
}
