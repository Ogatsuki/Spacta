#!/usr/bin/env node
/**
 * Spacta mutate — 「一度も落ちるのを見ていない検査は検査ではない」を機械にやらせる。
 *
 * この道具が存在する理由は、手でやったら当たったからである。v0.11 の作業中に3つ穴を植えて
 * 3つとも何かが見つかり、そのうち1つ——**pageview がサーバの割り当てた id を採用しない**——は
 * `verify` 緑・`crosscheck` 14 checks 緑・`runtime.serialization` 45 assertions 緑を**全部素通り**した。
 * tempId のまま残る trace は完全に決定論的なので、リプレイは自分自身と一致する。往復という機構が
 * 存在する唯一の理由が、機能の全期間にわたって一度も検算されていなかった。
 *
 * 打率3/3は「まだある」の意味である。手で植えるのをやめて、列挙できる形にしたのがこれ。
 *
 * 何をするか:
 *   `verify` に段位を訊き、**T3 の機能**（往復を閉じていると申告した機能）の `core.ts` に、
 *   往復を壊す変異を1つずつ植え、行動を見るゲートを回し、**生き残った変異**を報告する。
 *   生き残り = その振る舞いを守っている検査が1つも無い、ということ。
 *
 *   node tools/mutate.mjs ../livingdoc
 *
 * 終了コード:
 *   0 = 全変異が殺された（= T3 と申告した機能の往復に、実際に検査が届いている）
 *   1 = 生き残りがある。**これは故障ではなく測定結果である。** 何が無防備かを印字して 1 で返す。
 *   2 = 走らせられなかった（対象が無い、verify が段位を返さない、復元に失敗した等）
 *
 * 意図的にやらないこと:
 *   - **tsc をゲートに入れない。** 挿入した `return` の後ろが到達不能になるので、tsc は変異を
 *     「捕まえた」ように見えてしまう。それは往復を守ったのではなく、変異の作り方を検出しただけで、
 *     偽の安心になる。ここが見たいのは*振る舞い*の検査だけである。
 *   - **`verify` も殺し手として数えない。** 静的解析なので原理的にこの変異を捕まえられない。
 *     それでも回して印字するのは、「verify 緑は振る舞いの正しさを意味しない」を
 *     毎回この目で見るためである（`verify` 自身が `NOT guaranteed` でそう書いている）。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VERIFY = join(ROOT, "verify", "verify.mjs");
const posix = (p) => p.replace(/\\/g, "/");

function die(headline, lines = []) {
  console.error(`\nmutate: ${headline}\n`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(2);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (positional.length !== 1) {
  die("expects exactly one target path", [
    "node tools/mutate.mjs ../livingdoc",
    "node tools/mutate.mjs starter",
  ]);
}
const targetRoot = resolve(process.cwd(), positional[0]);
if (!existsSync(targetRoot)) die(`no such target: ${targetRoot}`);

// ───────────────────────── 変異 ─────────────────────────
// 往復の**両端**を1つずつ壊す。どちらも Spacta が名指しで潰してきた実在のバグの形である:
// 前者は v0.10 の「3つに分岐した loop のうち2つが答えを捨てていた」、後者は v0.11 以前の
// moderation の「失敗が pending を丸ごと消すだけで、動かした行を戻さなかった」。
//
// 挿入するのは早期 return 1文だけで、case ラベルの直後に置く。T3 の全 core が
// `export function update(state: State, action: Action)` と `case "X": {` の形をしているので
// 置換は一意に決まる —— 決まらなかったら**推測せずに止める**（下の適用箇所を参照）。
const MUTATIONS = [
  {
    id: "answer-ignored",
    caseName: "EFFECT_SUCCEEDED",
    what: "the server's answer changes nothing",
    why: "this is the shape of the v0.10 bug: an Effect's outcome came back and was dropped",
  },
  {
    id: "failure-uncompensated",
    caseName: "EFFECT_FAILED",
    what: "a rejected write is never undone",
    why: "an optimistic change stays on screen under a notice saying it failed",
  },
];

// ───────────────────────── ゲート ─────────────────────────
// `kills: false` は「回すが殺し手には数えない」。理由は冒頭のコメントを参照。
const GATES = [
  { id: "verify", kills: false, argv: [VERIFY, targetRoot] },
  { id: "crosscheck", kills: true, argv: [join(ROOT, "replay", "crosscheck.mjs")] },
  { id: "serialization", kills: true, argv: [join(ROOT, "replay", "runtime.serialization.test.mjs")] },
];

function runGate(gate) {
  const r = spawnSync(process.execPath, gate.argv, {
    encoding: "utf8",
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0;
}

// ───────────────────────── 段位を verify に訊く ─────────────────────────
// 段位判定をここで再実装しない（§8「内側の再発明」）。measure と同じく verify の申告を持ち上げる。
const tmpJson = join(tmpdir(), `spacta-mutate-${process.pid}.json`);
const verifyRun = spawnSync(process.execPath, [VERIFY, targetRoot, `--json=${tmpJson}`], {
  encoding: "utf8",
  cwd: ROOT,
  maxBuffer: 64 * 1024 * 1024,
});
if (!existsSync(tmpJson)) {
  die("the verifier produced no JSON, so no tier could be read", [
    `ran: ${process.execPath} ${posix(relative(ROOT, VERIFY))} ${positional[0]} --json=<tmp>`,
    (verifyRun.stderr || verifyRun.stdout || "").split("\n").slice(0, 6).join("\n  "),
  ]);
}
const verifyJson = JSON.parse(readFileSync(tmpJson, "utf8"));
rmSync(tmpJson, { force: true });
const rawTiers = Array.isArray(verifyJson?.tiers) ? verifyJson.tiers : null;
if (!rawTiers) die("the verifier reported no tiers");

const targets = rawTiers.filter((t) => t.tier === "T3").map((t) => t.feature).sort();
if (targets.length === 0) {
  die("no feature is graded T3, so there is no closed round trip to mutate", [
    "T1 and T2 are legitimate states; a project of only those has nothing for this tool to say.",
  ]);
}

// ───────────────────────── 記録セッションの退避 ─────────────────────────
// `crosscheck` は走るたび `replay-sessions/` を書き直す。変異下で走らせるとそこに**壊れた run の
// 記録**が残るので、走行の前後で丸ごと退避・復元する。ここを忘れると、この道具が「検査を確かめる
// ために証拠を汚す」ことになる。
const sessionsDir = join(targetRoot, "replay-sessions");
const sessionBackup = new Map();
if (existsSync(sessionsDir)) {
  for (const name of readdirSync(sessionsDir)) {
    sessionBackup.set(name, readFileSync(join(sessionsDir, name)));
  }
}
function restoreSessions() {
  if (sessionBackup.size === 0) return;
  mkdirSync(sessionsDir, { recursive: true });
  for (const name of readdirSync(sessionsDir)) {
    if (!sessionBackup.has(name)) rmSync(join(sessionsDir, name), { force: true });
  }
  for (const [name, body] of sessionBackup) writeFileSync(join(sessionsDir, name), body);
}

// ───────────────────────── 走行 ─────────────────────────

console.log("spacta mutate — is the round trip a T3 feature declares actually checked?\n");
console.log("  a mutation that SURVIVES is not a bug in the code. It is a hole in the checks:");
console.log("  the behaviour it broke is one no gate is watching.\n");

const results = [];
const originals = new Map();

try {
  for (const feature of targets) {
    const coreRel = `src/features/${feature}/core.ts`;
    const coreAbs = join(targetRoot, coreRel);
    if (!existsSync(coreAbs)) {
      die(`${feature} is graded T3 but has no ${coreRel}`, [
        "verify and this tool disagree about where a feature's state machine lives.",
      ]);
    }
    const original = readFileSync(coreAbs, "utf8");
    originals.set(coreAbs, original);

    for (const mutation of MUTATIONS) {
      const needle = `case "${mutation.caseName}": {`;
      const hits = original.split(needle).length - 1;
      // 推測しない。1箇所でなければ、変異が意図した場所に入った保証がないので止める。
      if (hits !== 1) {
        die(`cannot place ${mutation.id} in ${coreRel}: found ${hits} occurrences of \`${needle}\``, [
          "This tool inserts one early return directly after that case label, and refuses to guess",
          "when the shape it was written against is not the shape on disk.",
        ]);
      }
      const mutated = original.replace(needle, `${needle}\n      return [state, []]; // MUTANT`);
      writeFileSync(coreAbs, mutated);

      const caught = [];
      const blind = [];
      for (const gate of GATES) {
        const passed = runGate(gate);
        if (!passed && gate.kills) caught.push(gate.id);
        else if (passed && gate.kills) blind.push(gate.id);
      }
      writeFileSync(coreAbs, original);

      const survived = caught.length === 0;
      results.push({ feature, mutation: mutation.id, what: mutation.what, caught, blind, survived });
      const mark = survived ? "SURVIVED" : "killed  ";
      const by = survived ? "no gate noticed" : `by ${caught.join(", ")}`;
      console.log(`  ${mark}  ${feature.padEnd(16)} ${mutation.id.padEnd(24)} ${by}`);
    }
  }
} finally {
  // 復元は例外経路でも必ず通す。ここを落とすと、この道具は検査ではなく破壊になる。
  for (const [abs, text] of originals) writeFileSync(abs, text);
  restoreSessions();
}

// ───────────────────────── 報告 ─────────────────────────

const survivors = results.filter((r) => r.survived);
console.log(`\n  ${results.length} mutation(s) across ${targets.length} T3 feature(s): ` +
  `${results.length - survivors.length} killed, ${survivors.length} survived`);

if (survivors.length > 0) {
  console.log("\n  Unprotected behaviour — each of these can be broken with every gate still green:");
  for (const s of survivors) {
    console.log(`    ${s.feature}: ${s.what}`);
  }
  console.log("\n  A surviving mutation is a measurement, not a defect. Close it by writing the");
  console.log("  assertion that would have failed — a state assertion in");
  console.log("  `replay/runtime.serialization.test.mjs`, not a cross-check scenario: the cross-check");
  console.log("  compares a run against its own replay, so a wrong-but-deterministic feature passes it.");
}

console.log("\n  What this does NOT measure:");
console.log("    - anything outside a T3 feature's two outcome cases. Effect construction, validation,");
console.log("      rendering and the data layer are untouched by these mutations.");
console.log("    - `verify` is run but never counted as a killer: it reads the AST and cannot see");
console.log("      behaviour. Its green next to a SURVIVED line is the honest picture, not a failure.");
console.log("    - a killed mutation says some gate noticed, not that the gate noticed for a good reason.");

console.log(survivors.length === 0
  ? "\nmutate: every mutation was killed\n"
  : `\nmutate: ${survivors.length} mutation(s) survived\n`);
process.exit(survivors.length === 0 ? 0 : 1);
