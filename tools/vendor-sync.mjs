/**
 * Everything an app vendors from Spacta has one source here and copies out there.
 *
 * Spacta is not a package (yet). livingdoc holds its own copy of the engine *and* its own copy
 * of the verifier, because an app that vendors Spacta should be able to check itself without
 * the Spacta repository sitting next to it. That is a deliberate distribution choice, and its
 * price is a standing synchronisation obligation. Before this script the obligation was carried
 * by hand: v0.10 found `livingdoc/verify/` still on v0.9.x, missing L3, L9, L10 and roles
 * entirely, and it had gone stale without any signal at all.
 *
 * A copy nothing propagates to and nothing checks is a copy that will be wrong. So:
 *
 *   bun tools/vendor-sync.mjs           push every source out to every site
 *   bun tools/vendor-sync.mjs --check   report staleness, exit 1 if any
 *
 * `replay/runtime.serialization.test.mjs` independently compares the engine against `engine/`,
 * so a forgotten engine sync also fails the replay gate. The verifier bundle has no second
 * guard — `--check` is its only one, which is why it exits non-zero.
 *
 * A real package would replace all of this: an adopter would install the engine and the verifier
 * instead of holding copies. That is the right answer and it is not this file's job to decide —
 * it is a distribution question the author has deferred (v0.11: vendor for now).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const livingdoc = join(repo, "..", "livingdoc");

/**
 * What gets vendored, and where it lands.
 *
 * `files` names an explicit list; `tree` copies a directory whole. A new site belongs here the
 * day it is made — and so does a new engine file, which is why the engine bundle lists them.
 */
const BUNDLES = [
  {
    name: "engine",
    from: join(repo, "engine"),
    files: ["runtime.ts", "react.ts"],
    sites: [
      { name: "starter", dir: join(repo, "starter", "src", "shared", "spacta") },
      { name: "livingdoc", dir: join(livingdoc, "src", "shared", "spacta"), root: livingdoc },
      { name: "livingdoc/verify corpus", dir: join(livingdoc, "verify", "starter", "src", "shared", "spacta"), root: livingdoc },
    ],
  },
  {
    name: "verifier",
    from: join(repo, "verify"),
    tree: true,
    sites: [{ name: "livingdoc/verify", dir: join(livingdoc, "verify"), root: livingdoc }],
  },
  {
    // The corpus the bundled verifier's wiring test needs. `starter/` is the reference corpus
    // when verify runs from the Spacta repo; the bundled copy needs one of its own, which is
    // why the engine lands in three places rather than two.
    name: "corpus",
    from: join(repo, "starter"),
    tree: true,
    sites: [{ name: "livingdoc/verify/starter", dir: join(livingdoc, "verify", "starter"), root: livingdoc }],
  },
];

/**
 * Everything under `dir`, as paths relative to it. Skips the noise no copy should carry.
 *
 * `garden-report.json` is on the list because it is *written into the corpus* by `garden`, and
 * a generated file inside a vendored tree makes the staleness check depend on what was run last:
 * run `garden` and the corpus is suddenly one file out of date. That is a false red, and a false
 * red on the only staleness alarm there is costs more than the file is worth. It is gitignored
 * for the same reason and excluded from the published package by `files`.
 */
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "garden-report.json"]);
function treeOf(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...treeOf(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

const checkOnly = process.argv.includes("--check");
let stale = 0;
let written = 0;
let absent = 0;

for (const bundle of BUNDLES) {
  const files = bundle.tree ? treeOf(bundle.from) : bundle.files;
  for (const site of bundle.sites) {
    // A site whose repository is not checked out here is *absent*, which is not the same thing
    // as stale. CI for this repository has no `../livingdoc` beside it, and reporting every one
    // of its files as out of date would turn the only staleness alarm there is into noise that
    // is always on — the fastest way to teach everyone to ignore it.
    //
    // Absent is printed, counted, and repeated in the summary. A skip nobody is told about is
    // the failure this whole script exists to stop, and it would be a poor trade to fix it for
    // the engine and reintroduce it here.
    if (site.root && !existsSync(site.root)) {
      absent += 1;
      console.log(`  -- ${bundle.name.padEnd(9)} ${site.name.padEnd(24)} not checked out here, skipped`);
      continue;
    }
    let siteStale = 0;
    for (const file of files) {
      const source = readFileSync(join(bundle.from, file));
      const target = join(site.dir, file);
      const current = existsSync(target) ? readFileSync(target) : null;
      if (current && current.equals(source)) continue;
      siteStale += 1;
      stale += 1;
      if (checkOnly) {
        console.log(`  x  ${bundle.name.padEnd(9)} ${site.name.padEnd(24)} ${file}`);
      } else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, source);
        written += 1;
        console.log(`  -> ${bundle.name.padEnd(9)} ${site.name.padEnd(24)} ${file}`);
      }
    }
    if (siteStale === 0) {
      console.log(`  ok ${bundle.name.padEnd(9)} ${site.name.padEnd(24)} ${files.length} file(s)`);
    }
  }
}

/** What was not looked at, said out loud, so a green is never read as covering more than it did. */
const skipped = absent === 0 ? "" : ` (${absent} site(s) not checked out here — nothing was compared for them)`;

if (checkOnly) {
  console.log(
    stale === 0
      ? `\nvendor: every copy present here matches its source${skipped}`
      : `\nvendor: ${stale} file(s) stale - run \`bun tools/vendor-sync.mjs\`${skipped}`,
  );
  process.exit(stale === 0 ? 0 : 1);
}

console.log(
  written === 0
    ? `\nvendor: nothing to do, every copy present here already matches its source${skipped}`
    : `\nvendor: ${written} file(s) written${skipped}`,
);
