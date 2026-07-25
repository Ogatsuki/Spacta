#!/usr/bin/env node
/**
 * Spacta garden — 庭師の「目」（C1）。
 *
 * verify の info/warn（機械が見つけるが直す担い手が居なかったもの）を集約し、
 * AI（庭師エージェント）が機械的に消化できる「お掃除指示書」JSON に変換する。
 *
 * 設計原則:
 *   - 決定論的・AIなし。検知は verify に一元化し、garden は変換だけを行う（目と手の分離）。
 *   - verify が赤なら庭仕事より法（L1..L7）の修正が先。指示書にはその旨を明記し tasks を出さない。
 *   - 未知の rule を黙って落とさない。マッピングに無い rule は kind:"unknown" で必ず通す。
 *   - 意図的な保留は、対象行（または直前行）の `garden:keep <理由>` コメントで suppress できる。
 *     suppress された項目も指示書の suppressed に残る（隠蔽ではなく可視の保留）。
 *
 * 使い方:
 *   node garden/garden.mjs <projectRoot> [--out=<path>]
 *     既定の出力: <projectRoot>/garden-report.json（.gitignore 推奨。コミットしない）
 *     --out=- で stdout へ。
 *
 * 終了コード: 0（指示書の生成に成功。tasks の有無では失敗しない＝結果整合性）。
 *             verify の実行自体に失敗（typescript 未解決等）した場合のみ非ゼロ。
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const positional = args.find((a) => !a.startsWith("--"));
const projectRoot = resolve(positional || process.cwd());
const outFlag = args.find((a) => a.startsWith("--out="));
const outPath = outFlag ? outFlag.slice("--out=".length) : join(projectRoot, "garden-report.json");

// ───────────────────── rule → お掃除タスク種別のマッピング ─────────────────────
// 新しい info を verify に足したら、ここに1行足す（足し忘れても unknown で必ず出る）。
const TASK_KINDS = {
  "dead-export": {
    kind: "delete-dead-export",
    action:
      "この export を types.ts から削除する。定義だけでなく、残った import 文・関連コメントも掃除する。" +
      "削除後に npm run verify が緑のままであることを確認する。" +
      "近い将来の利用が確定している契約なら、削除せず対象行に `// garden:keep <理由>` を書いて保留にする。",
  },
  "single-owner-export": {
    kind: "colocate-type",
    action:
      "この export は1ファイルだけが参照している。types.ts から唯一の消費者ファイル内へ移動（同居）させ、" +
      "import を修正する。膜語彙（Action/Effect/State/InitData）は verify 側で除外済みなので出てこない。" +
      "近く2つ目の消費者が確定しているなら `// garden:keep <理由>` で保留にする。",
  },
  "L8": {
    kind: "tokenize-presentation",
    action:
      "生色（#hex）/ Tailwind arbitrary 値の直書きを、tailwind.config.ts theme.extend の語彙、" +
      "または shared/ui のレシピ（tailwind-variants）へくくり出す（清書）。見た目を変えない等価変換に限る。" +
      "theme に対応する語彙が無ければ theme.extend に追加してから参照する。",
  },
  "L5": {
    kind: "push-into-core",
    action:
      "server page の集計・整形ロジックを feature の core.ts の純関数へ移し、page からはそれを呼ぶだけにする（L5/押し出し）。",
  },
  "clone": {
    kind: "dedupe-clone",
    action:
      "UI(JSX/className) が別の場所と酷似している（B3）。ただし重複の除去は既定ではない：" +
      "§5 のとおり 80〜90%類似の UI は重複のまま許容する。潰すのは【同一 feature 内で 100% 一致】の場合だけで、" +
      "その feature の components/ へ表示部品として抽出し、両所から呼ぶ（見た目を変えない等価変換に限る）。" +
      "feature をまたぐ重複・部分的な類似は触らず、対象行に `// garden:keep <理由>` を書いて保留にする。" +
      "shared/ui への引き上げは庭師の職掌外（2つ以上の feature で実際に繰り返された後に人間/UI担当が判断）。",
  },
};

// ───────────────────── verify を --json で実行 ─────────────────────
const verifyPath = join(__dirname, "..", "verify", "verify.mjs");
if (!existsSync(verifyPath)) {
  console.error(`verify が見つかりません: ${verifyPath}`);
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), "spacta-garden-"));
const jsonPath = join(tmp, "verify.json");
const run = spawnSync(process.execPath, [verifyPath, projectRoot, `--json=${jsonPath}`], {
  encoding: "utf8",
});

let result;
try {
  result = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch {
  console.error("verify の JSON 出力を取得できませんでした。verify 自体の実行に失敗しています:");
  console.error(run.stdout || "");
  console.error(run.stderr || "");
  rmSync(tmp, { recursive: true, force: true });
  process.exit(2);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ───────────────────── garden:keep による保留（suppress） ─────────────────────
const fileCache = new Map();
function isSuppressed(relFile, line) {
  const abs = isAbsolute(relFile) ? relFile : join(projectRoot, relFile);
  if (!fileCache.has(abs)) {
    try { fileCache.set(abs, readFileSync(abs, "utf8").split("\n")); }
    catch { fileCache.set(abs, null); }
  }
  const lines = fileCache.get(abs);
  if (!lines) return null;
  for (const ln of [line - 1, line - 2]) { // 対象行と直前行（0-based）
    if (ln >= 0 && ln < lines.length && lines[ln].includes("garden:keep")) {
      const m = lines[ln].match(/garden:keep\s*(.*)$/);
      return (m && m[1].trim()) || "(理由未記入)";
    }
  }
  return null;
}

// ───────────────────── 指示書の組み立て ─────────────────────
const tasks = [];
const suppressed = [];
// Anything that is not an affirmative green blocks gardening — including the new
// "inconclusive" status (verify walked 0 files). Fail safe: never garden a tree that
// was never actually verified.
const verifyRed = result.status !== "green" || !result.selfTest?.ok;

if (!verifyRed) {
  const idSeen = new Map();
  for (const v of [...result.infos, ...result.warns]) {
    const map = TASK_KINDS[v.rule] ?? {
      kind: "unknown",
      action: `未知の rule '${v.rule}'。garden.mjs の TASK_KINDS に対応を追加すること（黙殺しない）。`,
    };
    const base = `${v.rule}:${v.file}:${v.line}`;
    const n = (idSeen.get(base) ?? 0) + 1;
    idSeen.set(base, n);
    const entry = {
      id: n === 1 ? base : `${base}#${n}`,
      kind: map.kind,
      rule: v.rule,
      file: v.file,
      line: v.line,
      detail: v.msg,
      action: map.action,
    };
    const keepReason = isSuppressed(v.file, v.line);
    if (keepReason !== null) suppressed.push({ ...entry, keepReason });
    else tasks.push(entry);
  }
}

const summary = {};
for (const t of tasks) summary[t.kind] = (summary[t.kind] ?? 0) + 1;

const report = {
  tool: "spacta-garden",
  schemaVersion: 1,
  projectRoot: result.projectRoot,
  verifyStatus: result.status,
  blocked: verifyRed,
  blockedReason: !verifyRed
    ? null
    : result.status === "inconclusive"
      ? "verify が 0 ファイルしか走査していない（INCONCLUSIVE）。検証されていない木を庭仕事してはならない。対象パスを確認せよ。"
      : "verify が赤（法違反 or self-test 失敗）。庭仕事の前に npm run verify を緑にせよ。",
  instructions:
    "このファイルは Spacta 庭師（garden）のお掃除指示書。手順とガードレールは Spacta/garden/GARDENER.md を読むこと。" +
    "tasks を上から機械的に消化し、各変更後に npm run verify の緑を保て。挙動を変える変更は庭仕事ではない。",
  summary,
  tasks,
  suppressed,
  notes: result.notes ?? [],
};

// ───────────────────── 出力 ─────────────────────
const text = JSON.stringify(report, null, 2) + "\n";
if (outPath === "-") process.stdout.write(text);
else writeFileSync(outPath, text);

console.log(`\n[Spacta garden] target = ${projectRoot}`);
console.log(`verify: ${report.verifyStatus}${verifyRed ? `（庭仕事は保留。${report.blockedReason}）` : ""}`);
if (!verifyRed) {
  if (tasks.length === 0) console.log("お掃除タスク: なし（庭は手入れ済み）");
  else {
    console.log(`お掃除タスク: ${tasks.length} 件`);
    for (const [kind, n] of Object.entries(summary)) console.log(`   ${kind}: ${n}`);
  }
  if (suppressed.length) console.log(`保留（garden:keep）: ${suppressed.length} 件`);
  if (report.notes.length) console.log(`notes: ${report.notes.length} 件`);
}
if (outPath !== "-") console.log(`指示書: ${outPath}`);
console.log("");
