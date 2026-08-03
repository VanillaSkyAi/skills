/**
 * ffmpeg binary resolution. Order:
 *   1. FFMPEG_PATH env override
 *   2. ffmpeg-static's bundled binary (may be absent if its postinstall
 *      download was blocked)
 *   3. system ffmpeg on PATH (with a note)
 *   4. loud failure with install instructions
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const INSTALL_HELP = `ffmpeg not found.

The bundled ffmpeg-static binary is missing (its postinstall download was
probably blocked) and no system ffmpeg is on PATH. Fix any of:
  - Reinstall with network access:  npm rebuild ffmpeg-static
  - Install ffmpeg system-wide:     https://ffmpeg.org/download.html
    (macOS: brew install ffmpeg · Debian/Ubuntu: apt install ffmpeg)
  - Or set FFMPEG_PATH=/path/to/ffmpeg`;

export function resolveFfmpeg() {
  const override = process.env.FFMPEG_PATH;
  if (override) {
    if (existsSync(override)) return override;
    throw new Error(`FFMPEG_PATH is set to "${override}" but no file exists there.`);
  }

  try {
    const require = createRequire(import.meta.url);
    const staticPath = require("ffmpeg-static");
    if (staticPath && existsSync(staticPath)) return staticPath;
  } catch {
    // ffmpeg-static not installed at all — fall through
  }

  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (probe.status === 0) {
    console.warn("[vanillasky] ffmpeg-static binary missing — falling back to system ffmpeg on PATH");
    return "ffmpeg";
  }

  throw new Error(INSTALL_HELP);
}

/** Like resolveFfmpeg but returns null instead of throwing (optional steps). */
export function tryResolveFfmpeg() {
  try {
    return resolveFfmpeg();
  } catch {
    return null;
  }
}
