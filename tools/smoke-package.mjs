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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
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
check(/docs: the check table/.test(verify.out), "the docs check ran — verify/README.md shipped");

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
console.log("\nwhat must not have shipped:");
for (const absent of ["tools", "docs_HUMAN-ONLY", "node_modules"]) {
  check(!existsSync(join(pkgDir, absent)), `${absent}/ is absent from the package`);
}

if (!KEEP) rmSync(work, { recursive: true, force: true });
else console.log(`\n  kept: ${work}`);

console.log(
  failures === 0
    ? "\nsmoke: the packaged artifact is usable where it lands"
    : `\nsmoke: ${failures} check(s) failed — the artifact is not usable as published`,
);
process.exit(failures === 0 ? 0 : 1);
