/**
 * Bundled audio track library — reads the audio/tracks.json manifest and
 * resolves `audio.trackId` references against the mp3s shipped in cli/audio/.
 *
 * Manifest shape (audio/tracks.json):
 *   {
 *     "tracks": [{
 *       "id": "vlog-vibes",          // slug used as audio.trackId
 *       "supabaseId": "<uuid>",      // track_configs id — Studio-exported configs match on this too
 *       "name": "Vlog Vibes",
 *       "file": "vlog-vibes.mp3",    // relative to the audio/ directory
 *       "duration": 30.1,
 *       "moods": ["upbeat", "positive"],
 *       "energy": "high",
 *       "description": "...",
 *       "beatMarkers": [],
 *       "source": "elevenlabs",
 *       "license": "commercial — ElevenLabs paid plan"
 *     }]
 *   }
 *
 * The manifest is written by scripts/fetch-tracks.mjs at the repo root —
 * don't hand-edit entries that script manages.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_AUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "audio");

/**
 * Load the track manifest. Never throws — a missing or malformed manifest
 * comes back as { tracks: [], error } so audio stays best-effort.
 */
export function loadTrackLibrary(audioDir = DEFAULT_AUDIO_DIR) {
  const manifestPath = join(audioDir, "tracks.json");
  if (!existsSync(manifestPath)) {
    return { tracks: [], audioDir, error: `no track manifest at ${manifestPath}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return { tracks: [], audioDir, error: `${manifestPath} is not valid JSON: ${err.message}` };
  }
  const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks.filter((t) => t && typeof t.id === "string" && typeof t.file === "string") : [];
  if (tracks.length === 0) {
    return { tracks: [], audioDir, error: `${manifestPath} has no valid tracks[] entries` };
  }
  return { tracks, audioDir, error: null };
}

/**
 * Resolve a trackId against the bundled library. Matches the manifest `id`
 * (slug) or `supabaseId` (track_configs uuid, so Studio-exported configs
 * resolve too), case-insensitively.
 *
 * Returns null when the id isn't in the manifest; { track, path: null } when
 * the manifest entry exists but its mp3 file is missing on disk.
 */
export function resolveBundledTrack(trackId, audioDir = DEFAULT_AUDIO_DIR) {
  const id = String(trackId ?? "").trim().toLowerCase();
  if (!id) return null;
  const { tracks } = loadTrackLibrary(audioDir);
  const track = tracks.find(
    (t) => t.id.toLowerCase() === id || (typeof t.supabaseId === "string" && t.supabaseId.toLowerCase() === id),
  );
  if (!track) return null;
  const path = join(audioDir, track.file);
  return { track, path: existsSync(path) ? path : null };
}

/** CLI entry for `vanillasky tracks` — lists the bundled library. */
export function tracksCommand({ json = false } = {}, audioDir = DEFAULT_AUDIO_DIR) {
  const { tracks, error } = loadTrackLibrary(audioDir);
  if (json) {
    console.log(JSON.stringify({ tracks, ...(error ? { error } : {}) }, null, 2));
    return error ? 1 : 0;
  }
  if (error) {
    console.error(`[vanillasky] ${error}`);
    return 1;
  }
  console.log(`${tracks.length} bundled track${tracks.length === 1 ? "" : "s"} (${audioDir}):\n`);
  for (const t of tracks) {
    const file = join(audioDir, t.file);
    const missing = existsSync(file) ? "" : "  [FILE MISSING]";
    const duration = typeof t.duration === "number" ? `${t.duration.toFixed(1)}s` : "?s";
    const moods = Array.isArray(t.moods) && t.moods.length ? t.moods.join(", ") : "—";
    const energy = t.energy ? `${t.energy} energy` : "";
    console.log(`  ${t.id}${missing}`);
    console.log(`      ${[duration, energy, moods].filter(Boolean).join("  ·  ")}`);
    if (t.description) console.log(`      ${t.description}`);
    if (t.license) console.log(`      license: ${t.license}`);
    console.log("");
  }
  console.log(`Use in a config:  "audio": { "trackId": "${tracks[0].id}" }`);
  return 0;
}
