#!/usr/bin/env node
/**
 * Does the published thing work where it lands?
 *
 * Everything else in this repository checks the source tree. This checks the *artifact*: it
 * packs the package, installs the tarball into a scratch project that has never seen this
 * repository, and then uses it the two ways an adopter will — importing the engine, and running
 * the CLIs. A green here means the `files` list, the `exports` map and the `bin` entries are all
 * correct, which nothing else in the repository can tell you.
 *
 * The failures this is built to catch are the ones that are invisible from inside the repo:
 * a corpus that did not ship (so the L6 wiring test silently has nothing to measure against),
 * fixtures that did not ship (so the self-test cannot plant anything), an `exports` path that
 * points at a file `files` excluded. Each of those leaves every in-repo gate green.
 *
 *   node tools/smoke-package.mjs                  # npm (what CI uses)
 *   node tools/smoke-package.mjs --packager=bun   # bun, for a machine with no npm
 *   node tools/smoke-package.mjs --keep           # leave the scratch project for inspection
 *
 * Exit 0 = the artifact is usable. Exit 1 = it is not, and the reason is printed rather than
 * left to be inferred from a stack trace.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

const packagerFlag = process.argv.find((a) => a.startsWith("--packager="));
const PACKAGER = packagerFlag ? packagerFlag.slice("--packager=".length) : "npm";
const KEEP = process.argv.includes("--keep");

if (!["npm", "bun"].includes(PACKAGER)) {
  console.error(`smoke: unknown packager '${PACKAGER}' — expected npm or bun`);
  process.exit(1);
}

let failures = 0;
function check(ok, what, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) {
    failures += 1;
    if (detail) console.log(detail.split("\n").map((l) => `         ${l}`).join("\n"));
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", failed: r.error };
}

console.log(`spacta package smoke test — packager: ${PACKAGER}\n`);

// ───────────────────────── 1. build and pack ─────────────────────────
// The build runs unconditionally rather than being left to `prepack`. npm runs that lifecycle
// and bun does not, and a smoke test whose meaning depends on which packager invoked it is not
// measuring the artifact any more.
const build = run(process.execPath, [join(repo, "node_modules", "typescript", "lib", "tsc.js"), "-p", "tsconfig.build.json"], { cwd: repo });
if (build.code !== 0) {
  console.error("smoke: the engine build failed, so there is nothing to pack.\n");
  console.error(build.out || build.err);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "spacta-smoke-"));
const consumer = join(work, "consumer");
mkdirSync(consumer, { recursive: true });

let tarball;
if (PACKAGER === "npm") {
  const packed = run("npm", ["pack", "--pack-destination", work, "--silent"], { cwd: repo });
  if (packed.code !== 0) {
    console.error("smoke: npm pack failed.\n" + (packed.err || packed.out));
    process.exit(1);
  }
  tarball = join(work, packed.out.trim().split("\n").pop().trim());
} else {
  const packed = run("bun", ["pm", "pack", "--destination", work], { cwd: repo });
  if (packed.code !== 0) {
    console.error("smoke: bun pm pack failed.\n" + (packed.err || packed.out));
    process.exit(1);
  }
  const tgz = readdirSync(work).find((f) => f.endsWith(".tgz"));
  tarball = tgz ? join(work, tgz) : null;
}

if (!tarball || !existsSync(tarball)) {
  console.error("smoke: no tarball was produced.");
  process.exit(1);
}
console.log(`  packed ${tarball}\n`);

// ───────────────────────── 2. install it somewhere that knows nothing ─────────────────────
writeFileSync(
  join(consumer, "package.json"),
  `${JSON.stringify({ name: "spacta-smoke-consumer", version: "1.0.0", private: true, type: "module" }, null, 2)}\n`,
);

const install =
  PACKAGER === "npm"
    ? run("npm", ["install", "--no-audit", "--no-fund", tarball, "react", "typescript"], { cwd: consumer })
    : run("bun", ["add", tarball, "react", "typescript"], { cwd: consumer });

if (install.code !== 0) {
  console.error("smoke: installing the tarball failed.\n" + (install.err || install.out));
  process.exit(1);
}

const pkgDir = join(consumer, "node_modules", "spacta");

// ───────────────────────── 3. the engine, imported the way an adopter imports it ──────────
console.log("the engine, out of node_modules:");

const roundTrip = `
import { createRuntime, createRecorder } from "spacta/runtime";
import * as root from "spacta";

const recorder = createRecorder({ seed: 1 });
const runtime = createRuntime({
  init: () => ({ n: 0, pending: [] }),
  update: (s, a) => {
    if (a.type === "BUMP") return [{ ...s, n: s.n + 1, pending: [a.correlationId] }, [{ type: "SAVE", correlationId: a.correlationId }]];
    if (a.type === "EFFECT_SUCCEEDED") return [{ ...s, n: s.n + (a.data?.bonus ?? 0), pending: [] }, []];
    if (a.type === "EFFECT_FAILED") return [{ ...s, pending: [] }, []];
    throw new Error("unhandled " + a.type);
  },
  perform: async () => ({ data: { bonus: 10 } }),
  record: recorder,
});
runtime.dispatch({ type: "BUMP", correlationId: "c1" });
await new Promise((r) => setTimeout(r, 50));
const s = runtime.getState();
const problems = [];
if (s.n !== 11) problems.push("the answer did not reach Core: n=" + s.n);
if (s.pending.length !== 0) problems.push("the write was never retired");
if (recorder.actions.map((a) => a.type).join(",") !== "BUMP,EFFECT_SUCCEEDED") problems.push("the recorder did not log both Actions");
if (typeof root.createRuntime !== "function") problems.push("the root export is missing createRuntime");
if (problems.length) { console.error(problems.join("\\n")); process.exit(1); }
`;
writeFileSync(join(consumer, "round-trip.mjs"), roundTrip);
const engineRun = run(process.execPath, ["round-trip.mjs"], { cwd: consumer });
check(engineRun.code === 0, "a write round trip completes through the installed engine", engineRun.err || engineRun.out);

check(existsSync(join(pkgDir, "dist", "runtime.d.ts")), "type declarations shipped");
check(existsSync(join(pkgDir, "engine", "runtime.ts")), "the readable .ts source shipped beside dist/");

// ───────────────────────── 3b. the behavioural gate ───────────────────────────────────────
// `spacta/replay` is the half of the harness that names no application. This drives a whole
// cross-check out of the installed package — live run, recording, replay, comparison — using a
// feature defined right here, which is exactly the shape an adopter's own scenario file takes.
console.log("\nthe replay harness, out of node_modules:");

const replayCheck = `
import { runCrossCheck } from "spacta/replay";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const core = {
  init: (d) => ({ n: d.start, pending: [] }),
  update: (s, a) => {
    if (a.type === "ADD") return [{ ...s, n: s.n + 1, pending: [a.correlationId] }, [{ type: "SAVE", correlationId: a.correlationId }]];
    if (a.type === "EFFECT_SUCCEEDED") return [{ ...s, pending: [] }, []];
    if (a.type === "EFFECT_FAILED") return [{ ...s, n: s.n - 1, pending: [], notice: a.message }, []];
    throw new Error("unhandled " + a.type);
  },
};

const { failed, rows } = await runCrossCheck({
  sessionDir: mkdtempSync(join(tmpdir(), "spacta-smoke-sessions-")),
  log: () => {},
  scenarios: [
    {
      id: "S1", title: "an optimistic add the server rejects", aims: "(2)", drivers: ["engine"],
      features: () => ({ cart: { init: core.init, update: core.update, initData: { start: 0 } } }),
      async script(d, io) {
        d.cart.dispatch({ type: "ADD", correlationId: "c1" });
        await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
      },
    },
  ],
});

if (failed !== 0) { console.error("the cross-check reported " + failed + " unmet expectation(s)"); process.exit(1); }
if (rows.length !== 1) { console.error("expected 1 checked run, got " + rows.length); process.exit(1); }
if (rows[0].outcome !== "pass") { console.error("the run did not replay"); process.exit(1); }
`;
writeFileSync(join(consumer, "replay-check.mjs"), replayCheck);
const replayRun = run(process.execPath, ["replay-check.mjs"], { cwd: consumer });
check(replayRun.code === 0, "a full cross-check runs through the installed harness", replayRun.err || replayRun.out);

// ───────────────────────── 4. the CLIs, against a real tree ───────────────────────────────
// The target is this repository's own `starter/`, which the installed package has never seen.
console.log("\nthe CLIs, run from the installed package:");

const target = join(repo, "starter");

const verify = run(process.execPath, [join(pkgDir, "verify", "verify.mjs"), target]);
check(verify.code === 0 && /verify: Green/.test(verify.out), "spacta-verify reaches Green on starter/", verify.err || verify.out);
// The three L6 lines are the point of this test: each one needs something that had to ship.
// The wiring test needs the corpus, the self-test needs the fixtures, and the docs check needs
// verify/README.md. An `exports`/`files` mistake that dropped any of them shows up only here.
check(/L6 self-test/.test(verify.out), "the L6 self-test ran — verify/fixtures/ shipped");
check(/L6 wiring test/.test(verify.out), "the L6 wiring test ran — the starter/ corpus shipped");
// The third L6 line is the one that deliberately does *not* survive installation. `verify/README.md`
// documents the CHECKS registry for people working on Spacta itself, so 0.12 stopped publishing it,
// and the drift check has nothing to compare against here. What must survive is the *saying so*:
// the verifier has to report that it did not check, rather than printing a green with one fewer
// line in it and letting the absence pass for a pass.
check(
  !/docs: the check table/.test(verify.out) && /check table drift not verified/.test(verify.out),
  "the docs check declares itself unverified — verify/README.md is repo-only, and its absence is stated",
  verify.out,
);

const measure = run(process.execPath, [join(pkgDir, "metrics", "measure.mjs"), target]);
let measured = null;
try { measured = JSON.parse(measure.out); } catch { /* reported below */ }
check(measure.code === 0 && measured !== null, "spacta-measure emits parseable JSON", measure.err);
check(measured !== null && typeof measured.effectUnion?.members === "number", "and the JSON carries the effectUnion tally");

const garden = run(process.execPath, [join(pkgDir, "garden", "garden.mjs"), target, `--out=${join(work, "garden.json")}`]);
check(garden.code === 0, "spacta-garden runs to completion", garden.err || garden.out);

// ───────────────────────── 5. what must NOT have shipped ──────────────────────────────────
// Shipping these would be shipping tools that cannot run where they land: their scenarios reach
// the reference application by relative path.
console.log("\nthe agent-facing half:");
check(existsSync(join(pkgDir, "skills", "spacta", "SKILL.md")), "the skill shipped");
check(existsSync(join(pkgDir, "hooks", "verify-on-stop.mjs")), "the Stop hook shipped");
check(existsSync(join(pkgDir, ".claude-plugin", "plugin.json")), "the plugin manifest shipped");

const init = run(process.execPath, [join(pkgDir, "tools", "init.mjs"), consumer, "--dry-run"]);
check(init.code === 0 && /would write .*skills\/spacta/.test(init.out), "spacta-init resolves its payload", init.err || init.out);

// ───────────────────────── 4c. how far into somebody else's tree this reaches (D-010) ──────
// The skill and the hook are the product: Spacta exists so an agent writes inside the Laws, and
// those two are how that happens. A project's CI, its git hooks, its package.json, its source —
// none of that is Spacta's to tidy. The line held only because `init.mjs` happened to be written
// that way; nothing stated it and nothing checked it, so the next good idea ("we could emit a
// workflow file too") had nothing to run into.
//
// The middle check is the real one. The other two close the doors either side of it: nothing may
// run at install time at all, and the repository's own CI is not part of the artifact.
console.log("\nhow far into an adopter's tree this reaches:");

const consumerLifecycle = ["preinstall", "install", "postinstall", "prepare"];
const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const present = consumerLifecycle.filter((s) => manifest.scripts?.[s]);
check(
  present.length === 0,
  "installing runs nothing — no preinstall/install/postinstall/prepare",
  present.length ? `defines: ${present.join(", ")}` : "",
);

// `--dry-run` names every destination without creating any of them, which is what makes this
// answerable without letting the tool write first and inspecting the damage after.
const destinations = [...init.out.matchAll(/^\s*would write\s+(.+?)\s*$/gm)].map((m) => m[1]);
const outside = destinations.filter((d) => !d.startsWith(".claude/"));
check(
  destinations.length > 0 && outside.length === 0,
  `spacta-init writes only under .claude/ (${destinations.length} destination(s))`,
  outside.length ? `outside .claude/: ${outside.join(", ")}` : "spacta-init named no destination at all",
);

check(!existsSync(join(pkgDir, ".github")), ".github/ is absent — this repository's CI is not the adopter's");

// The one document an installed agent is sent to by path. SKILL.md names it as
// `node_modules/spacta/docs_AI-ONLY/SPACTA.md`, so a `files` change that drops it turns a
// working reference into a dangling one, and nothing else here would notice.
check(existsSync(join(pkgDir, "docs_AI-ONLY", "SPACTA.md")), "the rulebook SKILL.md points at shipped");

// ───────────────────────── 4b. every link in the package resolves inside it ────────────────
// The repository and the tarball are not the same tree, and the documents do not automatically
// know which one they are being read from. `README.md` linked to the guides, the setup page, the
// decision log and the open questions by relative path — correct on GitHub, and four dead links
// the moment the same file is opened in `node_modules/spacta/`. The verifier printed the same
// mistake at runtime: "fix the Form, see docs_HUMAN-ONLY/setup.md", a directory `files` has never
// carried, said at the one moment the reader most needs it to be there.
//
// The rule this enforces is the only one that survives both readings: **a relative link may point
// only at something that shipped; everything else is an absolute URL.** Prose may still name an
// unshipped path — "it lives in the repository" is a true sentence — because a link is a promise
// that a path resolves and a sentence is not. So this walks links, not mentions.
console.log("\nevery relative link in the package resolves inside it:");

const markdown = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".md")) markdown.push(p);
  }
})(pkgDir);

const dangling = [];
for (const file of markdown) {
  const text = readFileSync(file, "utf8");
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const [path] = target.split("#");
    if (!path) continue; // a pure anchor
    if (!existsSync(join(dirname(file), path))) {
      dangling.push(`${relative(pkgDir, file)} -> ${target}`);
    }
  }
}
check(
  dangling.length === 0,
  `${markdown.length} shipped document(s) carry no link to a file the tarball lacks`,
  dangling.join("\n"),
);

console.log("\nwhat must not have shipped:");
for (const absent of ["docs_HUMAN-ONLY", "node_modules"]) {
  check(!existsSync(join(pkgDir, absent)), `${absent}/ is absent from the package`);
}
// Prose for people. Every one of these is a document somebody sits down and reads, none of them is
// reachable from anything the package installs, and together they were 80kB of a 169kB tarball. The
// survey that settled it: react, react-dom, next, typescript, eslint, @eslint/js, typescript-eslint
// and tailwindcss ship README and LICENSE and nothing else — all eight of them.
for (const absent of ["CHANGELOG.md", "verify/README.md", "starter/README.md"]) {
  check(!existsSync(join(pkgDir, absent)), `${absent} is absent — people read it, and the repository holds it`);
}
// The working record of the people building Spacta. Nothing installed links to either, and a
// tarball carrying them reads as if it held two rulebooks.
for (const absent of ["spacta-decisions.md", "spacta-open-questions.md"]) {
  check(!existsSync(join(pkgDir, "docs_AI-ONLY", absent)), `docs_AI-ONLY/${absent} is absent — it is repo-internal`);
}
// `tools/` ships one file. `mutate.mjs` reaches the reference app by relative path and
// `smoke-package.mjs` packs this repository — neither can run where this lands.
for (const absent of ["mutate.mjs", "smoke-package.mjs"]) {
  check(!existsSync(join(pkgDir, "tools", absent)), `tools/${absent} is absent — it is repo-internal`);
}
// The line inside `replay/`: the harness ships, the scenarios do not. If these ever appear in a
// tarball, the package is carrying imports that reach a directory the adopter does not have.
for (const absent of ["scenarios.mjs", "crosscheck.mjs", "runtime.serialization.test.mjs"]) {
  check(!existsSync(join(pkgDir, "replay", absent)), `replay/${absent} is absent — it names the reference app`);
}
check(existsSync(join(pkgDir, "replay", "runner.mjs")), "replay/runner.mjs is present — the generic half did ship");

if (!KEEP) rmSync(work, { recursive: true, force: true });
else console.log(`\n  kept: ${work}`);

console.log(
  failures === 0
    ? "\nsmoke: the packaged artifact is usable where it lands"
    : `\nsmoke: ${failures} check(s) failed — the artifact is not usable as published`,
);
process.exit(failures === 0 ? 0 : 1);
