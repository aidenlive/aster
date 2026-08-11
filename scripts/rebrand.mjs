#!/usr/bin/env node
// scripts/rebrand.mjs — one-shot white-label rename of this framework.
//
//   node scripts/rebrand.mjs --name brandx --i-am-forking [--verify]
//
// WHAT THIS IS ................ a clean way to fork. It rewrites the package
//   name, bin, import specifiers (aster/tools → brandx/tools), CLI strings,
//   env-var prefix (ASTER_ → BRANDX_), state directory (.aster → .brandx),
//   templates, examples, docs, and tests, then optionally proves the rename
//   is complete by running the full test suite.
//
// WHAT THIS IS NOT ............ a supported customization. A renamed install
//   is a hard fork: `npm update aster` can no longer reach it, upstream fixes
//   and security patches stop arriving, and public docs/examples no longer
//   match your import paths. If you only need to brand *your agent* (its
//   name, personality, endpoints), you do not need this — that is per-project
//   already. The --i-am-forking flag exists so this trade-off is accepted
//   explicitly, not stumbled into.

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    "i-am-forking": { type: "boolean" },
    verify: { type: "boolean" },
    "dry-run": { type: "boolean" },
  },
});

const name = values.name?.toLowerCase();
if (!name || !/^[a-z][a-z0-9-]{1,30}$/.test(name) || name === "aster") {
  console.error("Usage: node scripts/rebrand.mjs --name <new-name> --i-am-forking [--verify] [--dry-run]");
  console.error("       <new-name>: lowercase, alphanumeric/hyphen, not 'aster'");
  process.exit(1);
}
if (!values["i-am-forking"]) {
  console.error(`Refusing to rebrand without --i-am-forking.

Renaming creates a hard fork of the framework:
  - npm can no longer deliver upstream updates or security fixes
  - public docs, examples, and community answers stop matching your imports
  - you own every future merge from upstream

If you only want to brand your *agent* (name, personality, endpoints), that is
already per-project — no rename needed. If you are deliberately building an
internal platform fork, re-run with --i-am-forking.`);
  process.exit(1);
}

const lower = name; // brandx
const capital = name.replace(/(^|-)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase()); // BrandX-ish
const envPrefix = name.replace(/-/g, "_").toUpperCase() + "_"; // BRANDX_

const root = new URL("..", import.meta.url).pathname;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".aster", "dist-deploy"]);
const SKIP_FILES = new Set(["LICENSE", "package-lock.json", "rebrand.mjs"]);
const TEXT_EXT = /\.(ts|mts|js|mjs|json|md|yml|yaml|sh|txt)$|^Dockerfile$|^gitignore$|^\.gitignore$|^\.env/;

const replacements = [
  [/\bASTER_/g, envPrefix],
  [/\.aster\b/g, `.${lower}`],
  [/\baster\b/g, lower],
  [/\bAster\b/g, capital],
];

let filesChanged = 0;
let hits = 0;
walk(root);

// Rename the create-aster wrapper package directory to match.
const wrapperOld = join(root, "packages", "create-aster");
const wrapperNew = join(root, "packages", `create-${lower}`);
try {
  if (statSync(wrapperOld).isDirectory() && !values["dry-run"]) renameSync(wrapperOld, wrapperNew);
} catch {}

console.log(`${values["dry-run"] ? "[dry-run] would rewrite" : "rewrote"} ${hits} occurrences across ${filesChanged} files → "${lower}"`);
if (!values["dry-run"]) {
  rmSync(join(root, "package-lock.json"), { force: true });
  console.log("removed package-lock.json — run `npm install` to regenerate");
  console.log(`NOTE: state directories move from .aster/ to .${lower}/ — migrate existing session data by renaming the directory.`);
  if (values.verify) {
    console.log("verifying: npm install && npm test && npm run typecheck …");
    execSync("npm install && npm test && npm run typecheck", { cwd: root, stdio: "inherit" });
    console.log("rebrand verified: full suite green under the new name.");
  } else {
    console.log("run with --verify (or: npm install && npm test) to prove the rename is complete.");
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
      continue;
    }
    if (SKIP_FILES.has(entry.name) || !TEXT_EXT.test(entry.name)) continue;
    const path = join(dir, entry.name);
    const before = readFileSync(path, "utf8");
    let after = before;
    for (const [pattern, to] of replacements) after = after.replace(pattern, to);
    if (after !== before) {
      filesChanged++;
      hits += countDiffs(before, after);
      if (!values["dry-run"]) writeFileSync(path, after);
    }
  }
}

function countDiffs(before) {
  let n = 0;
  for (const [pattern] of replacements) n += (before.match(pattern) ?? []).length;
  return n;
}
