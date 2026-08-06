#!/usr/bin/env node

/**
 * Install the VanillaSky CLI from the official public release checkout.
 *
 * The CLI is intentionally distributed with VanillaSkyAi/skills, not through
 * the npm registry. npm is only used to install the two dependencies declared
 * by that verified local checkout and to expose its `vanillasky` binary.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const RELEASE_URL = "https://github.com/VanillaSkyAi/skills.git";
const DEFAULT_ROOT = join(homedir(), ".vanillasky", "release");

function fail(message) {
  console.error(`[vanillasky] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const { inherit = false, ...execOptions } = options;
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      ...execOptions,
    })?.trim() ?? "";
  } catch (error) {
    const detail = error?.stderr?.toString().trim().split("\n").at(-1);
    fail(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
}

function hasCommand(command, args = ["--version"]) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root" && argv[i + 1]) {
      root = resolve(argv[++i]);
      continue;
    }
    if (argv[i] === "--help") {
      console.log("Usage: node install-cli.mjs [--root <release-directory>]");
      process.exit(0);
    }
    fail(`unknown option: ${argv[i]}`);
  }
  return { root };
}

function normalizedRemote(value) {
  const normalized = value
    .trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\/$/, "");
  return normalized.endsWith(".git") ? normalized : `${normalized}.git`;
}

const { root } = parseArgs(process.argv.slice(2));
const major = Number.parseInt(process.versions.node.split(".")[0], 10);
if (!Number.isFinite(major) || major < 18) fail("Node 18 or newer is required");
if (!hasCommand("git")) fail("git is required to install the official release checkout");
if (!hasCommand("npm")) fail("npm is required to install the CLI dependencies");

if (existsSync(root)) {
  if (!existsSync(join(root, ".git"))) {
    fail(`${root} exists but is not a git checkout; move it aside and run this installer again`);
  }
  const origin = normalizedRemote(run("git", ["-C", root, "remote", "get-url", "origin"]));
  if (origin !== RELEASE_URL) {
    fail(`${root} does not point at ${RELEASE_URL}; refusing to update an untrusted checkout`);
  }
  if (run("git", ["-C", root, "status", "--porcelain"])) {
    fail(`${root} has local changes; refusing to overwrite them`);
  }
  console.log(`[vanillasky] refreshing official release at ${root}`);
  run("git", ["-C", root, "pull", "--ff-only", "origin", "main"], { inherit: true });
} else {
  mkdirSync(dirname(root), { recursive: true });
  console.log(`[vanillasky] cloning official release to ${root}`);
  run("git", ["clone", "--depth", "1", "--branch", "main", RELEASE_URL, root], { inherit: true });
}

const packagePath = join(root, "cli", "package.json");
if (!existsSync(packagePath)) fail(`official checkout is missing ${packagePath}`);
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
if (packageJson.bin?.vanillasky !== "bin/vanillasky.mjs") {
  fail("official checkout has an unexpected CLI package shape");
}

console.log("[vanillasky] installing CLI dependencies from the verified checkout");
run("npm", ["install", "--prefix", join(root, "cli"), "--silent"], { inherit: true });
run("npm", ["install", "--global", join(root, "cli"), "--silent"], { inherit: true });

if (!hasCommand("vanillasky", ["help"])) {
  fail("the CLI installed, but `vanillasky` is not on PATH; restart the shell and try again");
}
run("vanillasky", ["help"]);
console.log(`[vanillasky] installed CLI ${packageJson.version} from ${RELEASE_URL}`);
