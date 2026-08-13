#!/usr/bin/env node
/**
 * The Stop hook: a turn that changed governed source cannot end on a red `verify`.
 *
 *   node hooks/verify-on-stop.mjs [target]     # target defaults to the session's cwd
 *
 * SPACTA.md §4-5 says "once implementation is complete, run `npm run verify` yourself and fix
 * all errors until green". By Spacta's own trust hierarchy that sentence is **Advice**: an agent
 * that remembers it runs the verifier, and one that does not, does not. This makes it something
 * the turn cannot end without.
 *
 * Read what this is and is not. A Law in Spacta is *physically enforced via failure*, and this
 * hook binds exactly one population: sessions in this harness with this hook installed. Human
 * commits, other agents and CI all pass straight through it. The Law lives in CI; this is the
 * same check moved earlier, where fixing costs one edit instead of ten.
 *
 * ── Three things it refuses to do ─────────────────────────────────────────────────────────
 *
 * 1. **Run when nothing governed changed.** A turn that answered a question should not pay for
 *    an AST walk of the whole tree. It asks git what is dirty, and caches a fingerprint of what
 *    it last saw green, so repeated stops over an unchanged tree cost one `git status`.
 * 2. **Block twice.** `stop_hook_active` is set when a Stop hook already blocked this turn. If
 *    the model could not get to green in that attempt, blocking again would trap the session in
 *    a loop it has no way out of. One block, then it gets out of the way and the human decides.
 * 3. **Fail loudly when it cannot check.** No verifier resolvable, no git, not a Spacta project
 *    — every one of those exits 0 in silence. A hook that turned an unrelated repository red
 *    would be uninstalled within the day, and then it protects nothing at all.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

/** Anything printed on stdout that is not the block JSON confuses the harness. Say nothing. */
function allow() {
  process.exit(0);
}

/**
 * Stop the turn and hand the model the failure to fix.
 *
 * `reason` is what it reads, so it carries the verifier's own output rather than a summary of
 * it: the tool already prints the file, the line and the fix, and paraphrasing that would lose
 * the part that makes it actionable.
 */
function block(reason, systemMessage) {
  process.stdout.write(JSON.stringify({ decision: "block", reason, systemMessage }));
  process.exit(0);
}

// ───────────────────────── input ─────────────────────────

let input = {};
try {
  const raw = readFileSync(0, "utf8");
  if (raw.trim()) input = JSON.parse(raw);
} catch {
  allow(); // Unparseable input is the harness's business, not a reason to hold up a turn.
}

// Already blocked once this turn. See (2) above.
if (input.stop_hook_active) allow();

const cwd = input.cwd || process.cwd();
const positional = process.argv.slice(2).find((a) => !a.startsWith("--"));
const target = resolve(cwd, positional || ".");

if (!existsSync(target)) allow();

// ───────────────────────── is there anything here to check? ─────────────────────────

/**
 * The verifier, wherever this project keeps it. Installed beats vendored: a project that has
 * both is mid-migration, and the package is the copy that cannot go stale.
 */
function findVerifier() {
  const candidates = [
    join(cwd, "node_modules", "spacta", "verify", "verify.mjs"),
    join(target, "node_modules", "spacta", "verify", "verify.mjs"),
    join(cwd, "verify", "verify.mjs"),
    join(target, "verify", "verify.mjs"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const verifier = findVerifier();
if (!verifier) allow(); // Not a Spacta project, or the verifier is not installed. See (3).

// ───────────────────────── has anything governed changed? ─────────────────────────

/**
 * The population `verify` reads: TypeScript under `src/` and the app router. A change anywhere
 * else — a doc, a lockfile, a JSON fixture — cannot move a law, so it cannot be worth an
 * AST walk.
 */
function governedDirt() {
  // No git, or not a repository: there is no cheap way to know what changed, so check. Paying
  // for a scan beats letting a violation through because the tree was not legible.
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: target, encoding: "utf8" });
  if (top.status !== 0) return null;
  const repoRoot = top.stdout.trim();

  const git = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: target,
    encoding: "utf8",
  });
  if (git.status !== 0) return null;

  return git.stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    // `--porcelain` reports paths from the repository root, not from where it was run. A target
    // that is a subdirectory — a reference app inside its framework's repo, a package in a
    // monorepo — would otherwise match nothing and this hook would silently never fire.
    .map((p) => {
      const arrow = p.lastIndexOf(" -> "); // a rename reads "old -> new"; the new path is ours
      const one = arrow === -1 ? p : p.slice(arrow + 4);
      return one.startsWith('"') && one.endsWith('"') ? one.slice(1, -1) : one;
    })
    .map((p) => relative(target, resolve(repoRoot, p)).split(sep).join("/"))
    .filter((p) => p && !p.startsWith("../") && /\.tsx?$/.test(p) && /^(src|app)\//.test(p));
}

const dirty = governedDirt();
if (dirty !== null && dirty.length === 0) allow(); // Nothing governed is dirty.

/**
 * A fingerprint of what was last seen green, so a session that stops ten times over an unchanged
 * working tree runs the verifier once. Size and mtime rather than contents: this decides whether
 * to *re-run a check*, and the check itself is the thing that has to be right.
 */
function fingerprint(paths) {
  const h = createHash("sha256");
  for (const p of [...paths].sort()) {
    try {
      const st = statSync(join(target, p));
      h.update(`${p}:${st.size}:${st.mtimeMs}\n`);
    } catch {
      h.update(`${p}:gone\n`);
    }
  }
  return h.digest("hex");
}

// Kept outside the project on purpose. A cache file inside the tree is one more thing every
// adopter has to gitignore, and in this repository it would land in `starter/` — which is copied
// wholesale into the vendored corpus and into the published tarball, making both depend on
// whether a hook had run. Losing the cache to a temp sweep costs one extra scan; a generated
// file inside a vendored tree costs a false red on a real gate.
const cacheFile = join(tmpdir(), `spacta-verify-${createHash("sha256").update(target).digest("hex").slice(0, 16)}.json`);
const stamp = dirty === null ? null : fingerprint(dirty);

if (stamp) {
  try {
    if (JSON.parse(readFileSync(cacheFile, "utf8")).green === stamp) allow();
  } catch {
    /* no usable cache — check */
  }
}

// ───────────────────────── run the gates ─────────────────────────

const failures = [];

const verify = spawnSync(process.execPath, [verifier, target], { encoding: "utf8", cwd: target });
if (verify.status !== 0) {
  failures.push({
    name: "spacta verify",
    output: (verify.stdout || "") + (verify.stderr || ""),
  });
}

/**
 * Type integrity is the first line of `verify`'s own "NOT guaranteed by this green" list, and it
 * names the remedy: run tsc separately. This runs whatever the project already calls that, so
 * the hook never invents a command the project does not have.
 */
function typecheckScript() {
  try {
    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    return pkg.scripts?.typecheck ? "typecheck" : null;
  } catch {
    return null;
  }
}

const script = typecheckScript();
if (script && failures.length === 0) {
  const tsc = spawnSync("npm", ["run", "--silent", script], { encoding: "utf8", cwd: target });
  if (tsc.status !== 0) {
    failures.push({ name: `npm run ${script}`, output: (tsc.stdout || "") + (tsc.stderr || "") });
  }
}

// ───────────────────────── verdict ─────────────────────────

if (failures.length === 0) {
  if (stamp) {
    try {
      writeFileSync(cacheFile, `${JSON.stringify({ target, green: stamp }, null, 2)}\n`);
    } catch {
      /* the cache is an optimisation; losing it costs a re-run, not a result */
    }
  }
  allow();
}

/** Trimmed from the end: the verifier puts the violations last and the banner first. */
function tail(text, lines = 60) {
  const all = text.trimEnd().split("\n");
  return all.length <= lines ? all.join("\n") : `… (${all.length - lines} earlier lines omitted)\n${all.slice(-lines).join("\n")}`;
}

const report = failures
  .map((f) => `── ${f.name} ──\n${tail(f.output)}`)
  .join("\n\n");

block(
  `This turn changed source that Spacta governs, and the gates are red. Do not end here.\n\n` +
    `${report}\n\n` +
    `Fix the violations and run the gates again. The rules are in SPACTA.md (§1 for the Laws); ` +
    `every message above names the file, the line and the remedy. If a violation is one you ` +
    `believe should be allowed, say so to the user rather than working around the check — ` +
    `changing what is enforced is their call, not yours.`,
  `Spacta: ${failures.map((f) => f.name).join(", ")} failed — the turn was held`,
);
