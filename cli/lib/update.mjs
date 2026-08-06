/**
 * `vanillasky update` — pull the latest release into this install.
 *
 * The skill ships as a git checkout of the artifact repo (see the README's
 * clone instructions), with the CLI symlinked onto PATH from inside it. So
 * updating is a pull, an npm install when deps moved, and — the step everyone
 * forgets — re-copying the agent skill, because ~/.claude/skills/vanillasky is
 * a plain copy that tracks nothing. Miss that and the CLI is current while the
 * instructions the agent reads are a release behind, which is worse than being
 * uniformly stale: the docs describe flags the agent then doesn't use.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, cpSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

/** Where this CLI is installed — the artifact checkout root, one level above cli/. */
export function installRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** The default agent-skill destination for Claude Code. */
export function defaultSkillDir(home = homedir()) {
  return join(home, ".claude", "skills", "vanillasky");
}

/**
 * Decide what an update needs to do, given the observable state.
 *
 * Split from the doing so the decision is testable without a network, a git
 * remote, or a real install on disk.
 */
export function planUpdate({ isGitRepo, isSourceCheckout, behind, depsChanged, skillDirExists, versionChanged }) {
  // The CLI also runs straight out of the source repo during development,
  // where installRoot() resolves to that repo rather than an install. Pulling
  // there would fast-forward somebody's main and npm-install over their dev
  // tree — refuse rather than "update" the wrong repository.
  if (isSourceCheckout) {
    return {
      ok: false,
      reason:
        "this is the VanillaSky source repo, not an installed skill — nothing to update here.\n" +
        "  Releases ship from CI; to update an install, run `vanillasky update` from the installed CLI.",
    };
  }
  if (!isGitRepo) {
    return {
      ok: false,
      reason:
        "this install is not a git checkout, so there is nothing to pull. Re-install with:\n" +
        "  git clone https://github.com/VanillaSkyAi/skills ~/vanillasky-skill",
    };
  }
  const steps = [];
  if (behind) steps.push("pull");
  // Even with nothing to pull, a skill copy can be stale — someone may have
  // pulled manually and never re-copied. Refresh whenever the version moved
  // or we actually pulled.
  if (depsChanged) steps.push("install");
  if (skillDirExists && (behind || versionChanged)) steps.push("skill");
  return { ok: true, steps, upToDate: steps.length === 0 };
}

const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function readVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, "cli", "package.json"), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Run the update. `check: true` reports without changing anything.
 */
export async function updateCommand({ check = false, skillDir = null, log = console.log, root = installRoot() } = {}) {
  const isGitRepo = (() => {
    try { return git(root, "rev-parse", "--is-inside-work-tree") === "true"; } catch { return false; }
  })();
  // Present in the source repo, never in the exported artifact.
  const isSourceCheckout = existsSync(join(root, "scripts", "export-public-repo.mjs"));

  const gate = planUpdate({ isGitRepo, isSourceCheckout });
  if (!gate.ok) {
    log(`[vanillasky] ${gate.reason}`);
    return 1;
  }

  const before = readVersion(root);
  log(`[vanillasky] install ${root}`);
  log(`[vanillasky] version ${before}`);

  try { git(root, "fetch", "--quiet", "origin", "main"); } catch (err) {
    log(`[vanillasky] could not reach the release repo — ${String(err?.message ?? err).split("\n")[0]}`);
    return 1;
  }

  const behind = git(root, "rev-list", "--count", "HEAD..origin/main") !== "0";
  if (!behind) {
    log("[vanillasky] already on the latest release");
    if (!check) refreshSkill({ root, skillDir, log, force: false });
    return 0;
  }

  const incoming = git(root, "log", "--oneline", "-1", "origin/main");
  log(`[vanillasky] update available: ${incoming}`);
  if (check) {
    log("[vanillasky] run `vanillasky update` to apply it");
    return 0;
  }

  // --ff-only: this checkout is a consumer of a linear release history. A
  // merge here would mean someone edited the artifact locally, which the
  // release overwrites anyway — better to fail and say so.
  try {
    git(root, "merge", "--ff-only", "origin/main");
  } catch {
    // Two different causes with two different fixes — reporting "local
    // commits" when the tree is merely dirty sends people to the wrong remedy.
    const dirty = (() => {
      try { return git(root, "status", "--porcelain") !== ""; } catch { return false; }
    })();
    const ahead = (() => {
      try { return git(root, "rev-list", "--count", "origin/main..HEAD") !== "0"; } catch { return false; }
    })();
    if (dirty) {
      log("[vanillasky] can't update — this install has uncommitted changes:");
      log(git(root, "status", "--short").split("\n").slice(0, 5).map((l) => "    " + l).join("\n"));
      log("[vanillasky] the release repo is a build artifact, so local edits are overwritten by the next release anyway.");
      log(`[vanillasky] set them aside with: git -C ${root} stash -u`);
    } else if (ahead) {
      log("[vanillasky] can't fast-forward — this install has local commits on top of the release.");
      log(`[vanillasky] set them aside with: git -C ${root} branch local-edits && git -C ${root} reset --hard origin/main`);
    } else {
      log(`[vanillasky] can't fast-forward to origin/main — resolve the checkout by hand at ${root}`);
    }
    return 1;
  }

  const after = readVersion(root);
  try {
    execFileSync("npm", ["install", "--silent"], { cwd: join(root, "cli"), stdio: "inherit" });
  } catch {
    log("[vanillasky] npm install failed — run it yourself in " + join(root, "cli"));
    return 1;
  }

  refreshSkill({ root, skillDir, log, force: true });
  log(`[vanillasky] updated ${before} -> ${after}`);
  return 0;
}

/** Re-copy the agent skill so its instructions match the CLI that just moved. */
function refreshSkill({ root, skillDir, log, force }) {
  const dest = skillDir || defaultSkillDir();
  const src = join(root, "vanillasky");
  if (!existsSync(src)) return;
  if (!existsSync(dest) && !force) return;
  if (!existsSync(dest)) {
    log(`[vanillasky] no agent skill at ${dest} — skipping (pass --skill-dir to install it elsewhere)`);
    return;
  }
  try {
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    log(`[vanillasky] refreshed agent skill → ${dest}`);
  } catch (err) {
    log(`[vanillasky] couldn't refresh the agent skill at ${dest} — ${String(err?.message ?? err).split("\n")[0]}`);
  }
}
