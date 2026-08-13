#!/usr/bin/env node
/**
 * Install Spacta's agent-facing half into a project: the skill, and the Stop hook.
 *
 *   npx spacta-init                 # into the current directory
 *   npx spacta-init ../my-app       # into somewhere else
 *   npx spacta-init --dry-run
 *   npx spacta-init --write-settings
 *
 * ── Why this exists next to a plugin manifest ─────────────────────────────────────────────
 *
 * The same content is installable two ways, and that is on purpose rather than indecision.
 * `/plugin marketplace add Ogatsuki/Spacta` tracks the plugin's own release; this tracks the
 * version of `spacta` the project already installed. The second matters here because the hook
 * runs the verifier and the skill describes the Laws that verifier enforces — a skill one minor
 * version out from the tool it documents is worse than no skill, because it is confidently
 * wrong. Pinning them to the same `node_modules/spacta` is the whole point.
 *
 * ── What it will not do ───────────────────────────────────────────────────────────────────
 *
 * It never edits an existing `.claude/settings.json` unless asked with `--write-settings`, and
 * even then it backs the file up first. Settings are the user's, they usually hold work that
 * predates this package, and silently merging into them to save one paste is a bad trade.
 * Without the flag it prints the snippet and lets the human place it.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const WRITE_SETTINGS = args.includes("--write-settings");
const targetArg = args.find((a) => !a.startsWith("--"));
const target = resolve(process.cwd(), targetArg || ".");

if (!existsSync(target)) {
  console.error(`spacta-init: ${target} does not exist`);
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version;
console.log(`spacta-init ${version} -> ${target}${DRY ? "  (dry run)" : ""}\n`);

const claude = join(target, ".claude");
const plan = [
  { what: "skill", from: join(pkgRoot, "skills", "spacta"), to: join(claude, "skills", "spacta"), dir: true },
  { what: "hook", from: join(pkgRoot, "hooks", "verify-on-stop.mjs"), to: join(claude, "hooks", "spacta-verify-on-stop.mjs"), dir: false },
];

for (const item of plan) {
  if (!existsSync(item.from)) {
    console.error(`spacta-init: ${item.from} is missing from this package — refusing to write a partial install`);
    process.exit(1);
  }
  const shown = relative(target, item.to) || item.to;
  if (DRY) {
    console.log(`  would write  ${shown}`);
    continue;
  }
  mkdirSync(dirname(item.to), { recursive: true });
  if (item.dir) cpSync(item.from, item.to, { recursive: true });
  else copyFileSync(item.from, item.to);
  console.log(`  wrote        ${shown}`);
}

// ───────────────────────── settings ─────────────────────────

// `$CLAUDE_PROJECT_DIR` rather than a relative path: a hook command runs with the session's cwd,
// which is not necessarily the project root. The `:-.` fallback means that if the variable is
// ever absent the command degrades to a relative path instead of resolving to `/hooks/…` and
// printing a module-not-found error on every single turn.
const hookEntry = {
  Stop: [
    {
      hooks: [
        {
          type: "command",
          command: 'node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/spacta-verify-on-stop.mjs"',
          timeout: 180,
          statusMessage: "Spacta: checking the laws",
        },
      ],
    },
  ],
};

const settingsPath = join(claude, "settings.json");
const snippet = JSON.stringify({ hooks: hookEntry }, null, 2);

if (DRY) {
  console.log(`\n  would ${existsSync(settingsPath) ? "leave settings.json alone" : "create settings.json"}`);
} else if (!existsSync(settingsPath)) {
  mkdirSync(claude, { recursive: true });
  writeFileSync(settingsPath, `${snippet}\n`);
  console.log(`  wrote        ${relative(target, settingsPath)}`);
} else if (WRITE_SETTINGS) {
  const current = JSON.parse(readFileSync(settingsPath, "utf8"));
  copyFileSync(settingsPath, `${settingsPath}.bak`);
  const stop = current.hooks?.Stop ?? [];
  const already = JSON.stringify(stop).includes("spacta-verify-on-stop");
  if (already) {
    console.log(`  unchanged    ${relative(target, settingsPath)} (the hook is already there)`);
  } else {
    current.hooks = { ...current.hooks, Stop: [...stop, ...hookEntry.Stop] };
    writeFileSync(settingsPath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`  merged into  ${relative(target, settingsPath)}  (backup: settings.json.bak)`);
  }
} else {
  console.log(`\n  ${relative(target, settingsPath)} already exists and was NOT touched.`);
  console.log("  Add this to its \"hooks\" key, or re-run with --write-settings:\n");
  console.log(snippet.split("\n").map((l) => `    ${l}`).join("\n"));
}

console.log(`
What this installed
  .claude/skills/spacta/          the Laws, where code goes, and how to check behaviour
  .claude/hooks/…-on-stop.mjs     holds a turn that changed governed source and left verify red

The hook stays quiet unless a .ts/.tsx file under src/ or the app router is dirty, blocks at most
once per turn, and exits 0 without a word if it cannot find a verifier. It runs 'npm run
typecheck' too, when the project has that script.

Re-run this after upgrading spacta: the skill describes the Laws the installed verifier enforces,
and the two are meant to move together.`);
