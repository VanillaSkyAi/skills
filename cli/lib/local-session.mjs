/**
 * local-session — the state behind `vanillasky studio`.
 *
 * One config file, edited from two places at once: the human in the browser
 * and the agent in a terminal. That makes concurrency the whole problem, so
 * this module owns it rather than scattering it through the request handlers.
 *
 * Design notes worth keeping:
 *
 * - **Revisions, not last-write-wins.** Every published config has a revision.
 *   A save must carry the revision it was based on; a stale one is refused
 *   with 409 and the current config, so the page can offer reload-or-overwrite
 *   instead of silently destroying whichever side wrote second.
 *
 * - **Watch the directory, not the file.** Agents and editors save by writing
 *   a temp file and renaming it over the target. A watch on the file itself
 *   follows the replaced inode and goes deaf after the first such save; reads
 *   during the swap can also hit ENOENT.
 *
 * - **Atomic writes out, too.** We rename into place for the same reason, so a
 *   reader never catches a half-written config.
 *
 * - **Content hash decides "changed", the revision counter decides "who's
 *   current".** Hashing alone can't tell our write from an identical external
 *   one, so it is only used to suppress no-op events.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const WATCH_DEBOUNCE_MS = 120;
const READ_RETRIES = 5;
const READ_RETRY_MS = 40;

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export class LocalSession {
  constructor(configPath, { token } = {}) {
    this.path = configPath;
    this.dir = dirname(configPath);
    this.base = basename(configPath);
    this.token = token ?? randomBytes(24).toString("hex");
    this.revision = 0;
    this.contentHash = "";
    this.listeners = new Set();
    this.render = null; // { running, phase, frames, total, etaSec, path, error }
    this.lastRenderPath = null;
    this.watcher = null;
    this.debounce = null;

    const initial = this.readFromDisk();
    this.contentHash = hash(initial.raw);
  }

  // ─── Disk ──────────────────────────────────────────────────

  /** Read with retries — a rename-based save briefly unlinks the target. */
  readFromDisk() {
    let lastErr;
    for (let i = 0; i < READ_RETRIES; i++) {
      try {
        const raw = readFileSync(this.path, "utf8");
        return { raw, config: JSON.parse(raw) };
      } catch (err) {
        lastErr = err;
        // Proper synchronous sleep — a spin loop here would block the event
        // loop AND burn a core for the duration.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, READ_RETRY_MS);
      }
    }
    throw lastErr;
  }

  /** Current config plus the revision a save must quote back. */
  snapshot() {
    const { raw, config } = this.readFromDisk();
    const h = hash(raw);
    if (h !== this.contentHash) {
      this.contentHash = h;
      this.revision++;
    }
    return { config, path: this.path, revision: this.revision };
  }

  /**
   * Write a config, rejecting a save based on a revision that has since moved.
   * Returns { ok } or { conflict, config, revision }.
   */
  write(config, baseRevision) {
    const current = this.snapshot();
    if (baseRevision !== undefined && baseRevision !== current.revision) {
      return { conflict: true, ...current };
    }
    const raw = JSON.stringify(config, null, 2) + "\n";
    const tmp = join(this.dir, `.${this.base}.${process.pid}.tmp`);
    writeFileSync(tmp, raw);
    renameSync(tmp, this.path); // atomic — readers never see a partial file
    this.contentHash = hash(raw);
    this.revision++;
    return { ok: true, revision: this.revision };
  }

  // ─── Watching ──────────────────────────────────────────────

  /** Start watching the parent directory for changes to our file. */
  startWatching() {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.dir, (_event, filename) => {
        // filename can be null on some platforms — treat that as "maybe ours".
        if (filename && basename(filename) !== this.base) return;
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.checkForExternalChange(), WATCH_DEBOUNCE_MS);
      });
      this.watcher.on("error", () => { this.watcher = null; });
    } catch {
      // No watcher (unsupported platform, deleted dir) — the Studio still
      // works, it just won't live-update.
      this.watcher = null;
    }
  }

  checkForExternalChange() {
    if (!existsSync(this.path)) return; // mid-rename or deleted; a later event will catch it
    let snap;
    try {
      snap = this.snapshot();
    } catch {
      // Malformed JSON on disk — an agent mid-write, or a broken hand-edit.
      this.broadcast({ type: "config-invalid" });
      return;
    }
    this.broadcast({ type: "config", config: snap.config, revision: snap.revision });
  }

  // ─── Events ────────────────────────────────────────────────

  addListener(fn) {
    this.listeners.add(fn);
    // Replay current render state so a client that connects mid-render, or
    // reconnects near the end, isn't stuck on a stale progress bar.
    if (this.render) fn({ type: "render", ...this.render });
    return () => this.listeners.delete(fn);
  }

  broadcast(event) {
    for (const fn of [...this.listeners]) {
      try { fn(event); } catch { this.listeners.delete(fn); }
    }
  }

  setRender(state) {
    this.render = state;
    if (state?.path) this.lastRenderPath = state.path;
    this.broadcast({ type: "render", ...state });
  }

  close() {
    clearTimeout(this.debounce);
    try { this.watcher?.close(); } catch { /* already gone */ }
    this.watcher = null;
    this.listeners.clear();
    // Best-effort cleanup of a temp file from an interrupted write.
    const tmp = join(this.dir, `.${this.base}.${process.pid}.tmp`);
    if (existsSync(tmp)) { try { unlinkSync(tmp); } catch { /* nothing to do */ } }
  }
}
