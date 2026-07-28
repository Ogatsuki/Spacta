#!/usr/bin/env node
/**
 * Spacta measure — 中心命題「アプリが大きくなっても、1機能を追加・変更するのに必要な参照範囲は
 * 増えない」を**測れる状態**にするための計測器。
 *
 * これは通信簿ではない。閾値・目標・良し悪しを一切印字しない。数を出すだけである。
 * 傾きを取るのは人間（と、次の版の diff）の仕事であり、この道具の仕事は「同じコミットなら
 * 同じ JSON」を機械的に約束することだけである。
 *
 * 三分割（§8「目と手の分離」）:
 *   検知 = verify / 測定 = measure / 変換 = garden
 * verify の緑は「掟が守られている」であって「数字が良い」ではない。ここを混ぜると緑の意味が
 * 濁るので、measure は verify の中に入らない。逆に、**段位（Tiers）は自分で判定しない** ——
 * 同じ意味の判定を2つ持つことは §8 の「内側の再発明」そのものなので、verify を `--json` で
 * 呼び、その申告を持ち上げるだけにしてある。
 *
 * Comment language boundary (verify.mjs と同じ): コメントは日本語でよい。**印字・出力される
 * 文字列はすべて英語。**
 *
 * 使い方:
 *   node metrics/measure.mjs <target>      # <target> は測るプロジェクトのパス
 *   node metrics/measure.mjs starter       # 例: このリポジトリの参照実装
 *   node metrics/measure.mjs ../livingdoc  # 例: 検証台アプリ
 *   （cwd 相対のパスを1つ取るだけ。JSON は標準出力へ。診断は標準エラーへ）
 *
 * 終了コード:
 *   0 = 測れた（JSON を標準出力に吐いた）
 *   1 = 測れなかった。数字を出す代わりに、なぜ出せないかを標準エラーに書いて止まる
 *       - `src/**` / app router 配下に、どのゾーンにも落ちないファイルがある
 *         （= verify の unclassified の測定版。黙って数えないことは数字を腐らせる）
 *       - 共有契約（`src/shared/types.ts`）や `Effect` union が見つからない
 *       - verify を走らせられない / verify が段位を1つも申告しない
 *       - import を解決できない（散らばりを数え落とすより止まる方を選ぶ）
 *
 * 決定論の担保:
 *   - 時刻・乱数・実行環境に依存する値を1つも出力に入れない
 *   - オブジェクトのキー順は「§4-② が定めた順（zones の並び・トップレベルの並び）」か
 *     「アルファベット順」のどちらかで、どちらかを各項目のコメントで明示する
 *   - 配列はすべて明示のキーでソートする（spread は 消費者数の降順 → symbol → file）
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
// app router がどこに住むか（`app/` か `src/app/`）は Next.js の命名規約であり、その表は
// verify/platform/nextjs.mjs の1箇所だけが所有している（§6.1）。ここで列挙し直すと、
// フレームワークが規約を足したときに直す場所が2つになる。
import { APP_ROOTS } from "../verify/platform/nextjs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFY = join(__dirname, "..", "verify", "verify.mjs");

// ───────────────────────── 止まり方 ─────────────────────────
// 穴があること自体は許されるが、隠すことは許されない（§6.4）。測れなかったときに部分的な
// JSON を吐くのが最悪の形なので、出力はすべて組み上がってから最後に一度だけ印字する。

function die(headline, lines) {
  console.error(`measure: cannot report a number — ${headline}\n`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(1);
}

// ───────────────────────── 引数 ─────────────────────────

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const askedForHelp = process.argv.includes("--help") || process.argv.includes("-h");
if (askedForHelp || positional.length !== 1) {
  console.error("usage: node metrics/measure.mjs <target>");
  console.error("       <target> is the path of the project to measure, e.g. `starter` or `../livingdoc`.");
  console.error("       The measurement is written to stdout as JSON; diagnostics go to stderr.");
  process.exit(askedForHelp ? 0 : 1);
}
const targetRoot = resolve(positional[0]);
if (!existsSync(join(targetRoot, "src"))) {
  die(`there is no src/ under ${targetRoot}`, [
    "measure zones `src/**` and the app router; a target with neither is not a Spacta project.",
  ]);
}
// 出力される名前。ディレクトリ名をそのまま使う（`.` を渡されても実体の名前になる）。
const targetName = targetRoot.split(/[\\/]/).filter(Boolean).pop();

// ───────────────────────── TypeScript コンパイラ ─────────────────────────
// verify と同じ作法: まず測る側のプロジェクトから、無ければこの道具自身の依存から解決する。
// 解決できた「何か」を検査するのも verify と同じ理由による（bun は node_modules を持たない
// ターゲットに対してスタブを返すことがあり、数百行あとで意味不明に落ちる）。

const isCompiler = (m) => !!(m && m.createSourceFile && m.forEachChild && m.ScriptTarget && m.SyntaxKind);
let ts;
for (const pkg of [join(targetRoot, "package.json"), join(__dirname, "..", "package.json")]) {
  try {
    const mod = createRequire(pkg)("typescript");
    if (isCompiler(mod)) { ts = mod; break; }
  } catch { /* not here — try the next location */ }
}
if (!ts) {
  die("the TypeScript compiler could not be loaded, so nothing was parsed", [
    `Looked for 'typescript' from the target (${targetRoot}) and from this tool (${resolve(__dirname, "..")}).`,
    "effectUnion and spread are read off the AST, so with no compiler there is no measurement to report.",
    "-> install dependencies in either location (npm install / bun install), then re-run.",
  ]);
}

// ───────────────────────── ファイルの母集団 ─────────────────────────
// 母集団は verify の走査と**同一**に取る: `src/` と app router 配下の `.ts` / `.tsx`。
// ここを verify とずらすと「83ファイル / 0 unclassified」と突き合わせられなくなり、
// 二つの道具が同じツリーについて違う人口を語りはじめる。
//
// 除くもの: 依存とビルド生成物とドットファイル。`livingdoc/verify/`（同梱の検証器と
// その参照コーパス）や `livingdoc/replay-sessions/`（変更⑤ の記録）は `src/` でも
// app router でもないので、この walk の定義から構造的に外れる。外れていることは
// 出力の `excluded` で名指しして、黙って落としていないことを示す。
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".wrangler", ".vercel", ".turbo", "dist", "build", "out"]);
const isSource = (name) => /\.(ts|tsx)$/.test(name);

function walk(dir, out = [], nonSource = []) {
  if (!existsSync(dir)) return { out, nonSource };
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out, nonSource);
    else if (isSource(name)) out.push(p);
    else nonSource.push(p);
  }
  return { out, nonSource };
}

const posix = (p) => p.replace(/\\/g, "/");
const relOf = (abs) => posix(relative(targetRoot, abs));

const zonedRoots = [join(targetRoot, "src"), ...APP_ROOTS.map((a) => join(targetRoot, ...a.split("/")))];
const walked = { out: [], nonSource: [] };
for (const d of zonedRoots) walk(d, walked.out, walked.nonSource);
const files = [...new Set(walked.out)].sort().map((abs) => ({ abs, rel: relOf(abs) }));

if (files.length === 0) {
  die(`0 source files were found under src/ or the app router of ${targetRoot}`, [
    "A measurement of nothing is not a zero — it is a measurement that did not happen.",
  ]);
}

// 変更⑤ の記録セッションは測定ゾーンに一切寄与してはならない（§4-⑤ の配置表）。walk の
// 定義からは外れているが、**外れていることを assert する**: 配置が変わった日に、この数字が
// 静かに増えるのを防ぐのはこの1行だけである。
const leaked = files.filter((f) => f.rel.split("/").includes("replay-sessions"));
if (leaked.length) {
  die("recorded replay sessions reached the zone tally", [
    ...leaked.map((f) => f.rel),
    "replay-sessions/ is neither src/ nor app/: it must contribute nothing to any zone (see §4-⑤ placement).",
  ]);
}

// ───────────────────────── ゾーン ─────────────────────────
// zones のキー順は §4-② が定めた並び（隔離済み → エンジン → 契約 → 共有 → フレームワーク）
// をそのまま使う。共有予算がどう育つかを読むための並びであり、アルファベット順にすると
// その意味が消える。
const ZONE_ORDER = ["feature", "engine", "contract", "sharedUi", "dataAdapter", "sharedOther", "framework"];

// `src/` 側のゾーン規則。**上から順に最初に一致したものを採る。**
// 意図的に catch-all（`^src\/.+`）を置いていない: どのゾーンにも落ちないファイルは
// 「その他」に飲ませるのではなく、走行を止めて名指しする。verify の platform 表が
// 貪欲な catch-all で塞いだ穴を開け直した前例（§4-③ の落とし穴1）と同じ罠である。
const SRC_ZONES = [
  [/^src\/features\/.+/, "feature"],
  [/^src\/shared\/spacta\/.+/, "engine"],
  [/^src\/shared\/types\.ts$/, "contract"],
  [/^src\/shared\/ui\/.+/, "sharedUi"],
  // starter は `shared/source.ts` の1ファイル、livingdoc は `shared/source/` のディレクトリ。
  // どちらも同じデータアダプターである（verify の platform 表と同じ書き方）。
  [/^src\/shared\/source(\/.+|\.ts)$/, "dataAdapter"],
  [/^src\/shared\/.+/, "sharedOther"],
];

const appPrefixes = APP_ROOTS.map((a) => a + "/");
const inAppRoot = (rel) => appPrefixes.some((p) => rel.startsWith(p));

function zoneOf(rel) {
  // app router を先に引く。`src/app/**` を `src/shared` 系より後に回すと、レイアウトを
  // 変えたプロジェクトでルートがゾーンを取り違える。
  if (inAppRoot(rel)) return "framework";
  for (const [re, zone] of SRC_ZONES) if (re.test(rel)) return zone;
  return null;
}

// 行数の定義: `wc -l` と同じ物理行数（末尾に改行が無い最終行も1行として数える）。
// AST 由来の「有効行」を数えないのは、定義を1つに保つ方が傾きを読むときに強いからである。
const textOf = new Map();
function read(abs) {
  if (!textOf.has(abs)) textOf.set(abs, readFileSync(abs, "utf8"));
  return textOf.get(abs);
}
function lineCount(text) {
  if (text === "") return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith("\n") ? n : n + 1;
}

const zones = Object.fromEntries(ZONE_ORDER.map((z) => [z, { files: 0, lines: 0 }]));
const unzoned = [];
for (const f of files) {
  const zone = zoneOf(f.rel);
  if (!zone) { unzoned.push(f.rel); continue; }
  f.zone = zone;
  zones[zone].files += 1;
  zones[zone].lines += lineCount(read(f.abs));
}
if (unzoned.length) {
  die(`${unzoned.length} file(s) under src/ or the app router landed in no zone`, [
    ...unzoned,
    "",
    "Every file in the measured population must belong to exactly one zone, or the totals stop",
    "meaning anything. This is the measurement's equivalent of verify's `unclassified`: staying",
    "silent here would let the numbers rot.",
    `-> either place the file inside a zone, or name the zone it belongs to in ${posix(relative(process.cwd(), fileURLToPath(import.meta.url)))} (SRC_ZONES).`,
  ]);
}

// ───────────────────────── 測らなかったもの（隠さないために書く）─────────────────────────
// カバレッジ%を上げるための表ではない。「数えられたのに数えなかった」ものだけを名指しする:
//   (a) 測定ゾーンの中にある非 TypeScript ファイル
//   (b) 測定ゾーンの外にあって `.ts` / `.tsx` を含むディレクトリ（同梱の検証器など、
//       二重計上しうるもの）
//   (c) `replay-sessions/`（§4-⑤ が明示的に除外を要求している）
// ソート順: path の昇順。
function countFiles(dir, pred) {
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of readdirSync(d)) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (pred(name)) n += 1;
    }
  }
  return n;
}

const excluded = [];
for (const abs of [...new Set(walked.nonSource)].sort()) {
  excluded.push({ path: relOf(abs), files: 1, why: "inside a zoned root but not a TypeScript source (.ts/.tsx) file" });
}
const zonedRootNames = new Set(["src", ...APP_ROOTS.map((a) => a.split("/")[0])]);
for (const name of readdirSync(targetRoot).sort()) {
  if (name.startsWith(".") || SKIP_DIRS.has(name) || zonedRootNames.has(name)) continue;
  const p = join(targetRoot, name);
  if (!statSync(p).isDirectory()) continue;
  if (name === "replay-sessions") {
    excluded.push({ path: name + "/", files: countFiles(p, () => true), why: "recorded replay sessions: neither src/ nor app/, excluded from every zone" });
    continue;
  }
  const n = countFiles(p, isSource);
  if (n > 0) excluded.push({ path: name + "/", files: n, why: "outside the zoned roots (src/ and the app router): holds .ts/.tsx that no zone counts" });
}
excluded.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

// ───────────────────────── 機能の数 ─────────────────────────
const featuresDir = join(targetRoot, "src", "features");
const featureNames = existsSync(featuresDir)
  ? readdirSync(featuresDir).filter((n) => !n.startsWith(".") && statSync(join(featuresDir, n)).isDirectory()).sort()
  : [];

// ───────────────────────── 所有者の名前 ─────────────────────────
// 「誰が」を1つの語彙で言う。機能なら機能名、app router 配下ならルートのパス（§4-② の例が
// `app/m/[material]/[page]` を消費者に挙げているのに従う。結合がサーバ境界に寄っている事実は
// ルート名でしか見えない）、それ以外はファイルのパス。
// null = 共有予算の内側。散らばり（＝共有予算の外へ何箇所散ったか）の消費者には数えない。
function ownerOf(rel) {
  const m = /^src\/features\/([^/]+)\//.exec(rel);
  if (m) return m[1];
  if (inAppRoot(rel)) {
    const d = rel.slice(0, rel.lastIndexOf("/"));
    return d; // e.g. "app", "app/api/traces", "app/m/[material]/[page]"
  }
  if (rel.startsWith("src/shared/")) return null;
  return rel;
}

// ───────────────────────── AST ヘルパ ─────────────────────────
const parse = (abs) => ts.createSourceFile(abs, read(abs), ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TSX);
const sfCache = new Map();
function sourceFile(abs) {
  if (!sfCache.has(abs)) sfCache.set(abs, parse(abs));
  return sfCache.get(abs);
}
function eachNode(node, fn) {
  fn(node);
  ts.forEachChild(node, (c) => eachNode(c, fn));
}
const hasExport = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

// ───────────────────────── ② 膜語彙の大きさ（effectUnion）─────────────────────────
// 名前を grep しない。`Effect` union を AST で読み、メンバのタグ（判別プロパティの文字列
// リテラル）を取り、**構築点も AST で**探す。grep だと型宣言側の `type: "SAVE_TRACE"` と
// 構築側の `{ type: "SAVE_TRACE", … }` を区別できず、9メンバが常に「構築者あり」になる。
//
// 構築点の判定: オブジェクトリテラルであって、判別プロパティにそのメンバのタグを文字列で
// 持ち、書かれているプロパティ名がすべてそのメンバの宣言済みフィールドに含まれること。
// 型解決はしない（tsc の型チェッカを持ち出すと決定論の担保が重くなる）。同名の Action が
// 偶然あっても、フィールド集合が違えば混ざらない。

const contractRel = "src/shared/types.ts";
const contractAbs = join(targetRoot, "src", "shared", "types.ts");
if (!existsSync(contractAbs)) {
  die(`the shared contract ${contractRel} does not exist in ${targetRoot}`, [
    "The membrane vocabulary is measured off that one file; without it there is no Effect union to count.",
  ]);
}

const contractSf = sourceFile(contractAbs);
let effectAlias = null;
eachNode(contractSf, (n) => {
  if (ts.isTypeAliasDeclaration(n) && n.name.text === "Effect") effectAlias = n;
});
if (!effectAlias) {
  die(`no \`Effect\` type alias was found in ${contractRel}`, [
    "effectUnion measures the membrane vocabulary declared there. A renamed or moved Effect union is a",
    "change to the contract, not something to guess at.",
  ]);
}

const unionMembers = (ts.isUnionTypeNode(effectAlias.type) ? effectAlias.type.types : [effectAlias.type])
  .map((t) => (ts.isParenthesizedTypeNode(t) ? t.type : t));
const literalMembers = unionMembers.filter((t) => ts.isTypeLiteralNode(t));
if (literalMembers.length !== unionMembers.length) {
  die(`the \`Effect\` union in ${contractRel} has ${unionMembers.length - literalMembers.length} member(s) that are not object types`, [
    "Members are read as object types with a string-literal tag; anything else cannot be tagged, counted,",
    "or matched against a construction site. Report the shape instead of half-measuring it.",
  ]);
}

// 判別プロパティを union 自身から決める。「全メンバが持ち、値がすべて異なる文字列リテラル」
// の候補のうちアルファベット順で最初のもの（実際には `type`）。名前を決め打ちしない。
function literalProps(member) {
  const out = new Map();
  for (const m of member.members) {
    if (!ts.isPropertySignature(m) || !m.type || !m.name || !ts.isIdentifier(m.name)) continue;
    if (ts.isLiteralTypeNode(m.type) && ts.isStringLiteral(m.type.literal)) out.set(m.name.text, m.type.literal.text);
  }
  return out;
}
const propNames = (member) => member.members
  .filter((m) => m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)))
  .map((m) => m.name.text);

const candidates = [...new Set(literalMembers.flatMap((m) => [...literalProps(m).keys()]))].sort().filter((name) => {
  const values = literalMembers.map((m) => literalProps(m).get(name));
  return values.every((v) => v !== undefined) && new Set(values).size === values.length;
});
if (candidates.length === 0) {
  die(`the members of the \`Effect\` union in ${contractRel} share no discriminant`, [
    "A tagged union is what makes a member nameable and a construction site findable.",
  ]);
}
const tagProp = candidates[0];

const memberFields = new Map(); // tag -> Set(field names)
for (const m of literalMembers) memberFields.set(literalProps(m).get(tagProp), new Set(propNames(m)));

// 構築点の探索は**測定ゾーン全体**を歩く。機能の中で構築されたものは機能名になり、共有や
// app router で構築されたものはそのパスで現れる。「機能しか構築しないはずだ」を仮定して
// 機能だけ歩くと、仮定が破れた日に出力が黙る。
const constructors = new Map([...memberFields.keys()].map((tag) => [tag, new Set()]));
for (const f of files) {
  // 共有予算の中で構築されていたら、機能名の代わりにそのパスで現れる（spread の `file` と同じ書き方）。
  const owner = ownerOf(f.rel) ?? f.rel.replace(/^src\//, "");
  eachNode(sourceFile(f.abs), (n) => {
    if (!ts.isObjectLiteralExpression(n)) return;
    let tag = null;
    const written = [];
    for (const p of n.properties) {
      const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
      if (name) written.push(name);
      if (name === tagProp && ts.isPropertyAssignment(p) && ts.isStringLiteralLike(p.initializer)) tag = p.initializer.text;
    }
    if (tag === null || !memberFields.has(tag)) return;
    const fields = memberFields.get(tag);
    if (!written.every((w) => fields.has(w))) return; // 同名の別語彙（Action 等）
    constructors.get(tag).add(owner);
  });
}

// キーはタグのアルファベット順、値も同順。宣言順ではなくアルファベット順にするのは、
// 契約の並べ替えで diff が動かないようにするため。
const effectUnion = {
  members: memberFields.size,
  constructors: Object.fromEntries([...constructors.keys()].sort().map((tag) => [tag, [...constructors.get(tag)].sort()])),
};

// ───────────────────────── ③ 散らばり（spread）─────────────────────────
// 「1つの複雑性が何箇所に散っているか」。カバレッジ% を置き換える指標であり（§8「散らばり」）、
// 測定であると同時に道具である: 共有シンボルを触ろうとするエージェントに「これは3機能から
// 読まれている」と機械的に開示できる。
//
// 消費者の定義は「隔離された機能」か「app router のルート」のどちらか。共有予算の内側
// （`shared/**` → `shared/**`）は消費者に数えない —— それは散らばりではなく共有予算の内部構造で
// あり、混ぜると「共有ファイルが1つ増えるだけで全シンボルの散らばりが増える」ことになって
// 指標が意味を失う。
// 消費者0のシンボルも落とさない: 0は「共有されているが散っていない」という事実であり、
// あとから消費者が増えたときに既存の行の diff として見える方が傾きを読める。

// tsconfig は JSONC（コメントと末尾カンマが許される）なので、文字列の中と外を区別しながら
// 剥がす。正規表現で剥がそうとすると `"app/**/*.ts"` の中の `/*` をコメント開始と読んで
// ファイルを食い潰す —— 実際に一度食い潰した。
function stripJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { // 文字列はそのまま通す
      let j = i + 1;
      while (j < text.length && !(text[j] === '"' && text[j - 1] !== "\\")) j++;
      out += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && text[i + 1] === "*") { const end = text.indexOf("*/", i + 2); i = end === -1 ? text.length : end + 1; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1"); // 末尾カンマ。ここは文字列外にしか現れない形
}

// tsconfig の paths（`@/*` → `./src/*`）を読む。エイリアスを決め打ちしない。
function readTsconfigPaths() {
  const p = join(targetRoot, "tsconfig.json");
  if (!existsSync(p)) return { baseUrl: targetRoot, paths: {} };
  const raw = stripJsonc(readFileSync(p, "utf8"));
  let json;
  try { json = JSON.parse(raw); } catch {
    die("the target's tsconfig.json could not be parsed, so import aliases are unknown", [
      `file: ${posix(relative(targetRoot, p))}`,
      "spread resolves every import; guessing the alias table would silently undercount consumers.",
    ]);
  }
  const co = json.compilerOptions ?? {};
  return { baseUrl: resolve(targetRoot, co.baseUrl ?? "."), paths: co.paths ?? {} };
}
const { baseUrl, paths: aliasPaths } = readTsconfigPaths();

const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".d.ts", "/index.ts", "/index.tsx"];
function firstExisting(base) {
  for (const s of CANDIDATE_SUFFIXES) {
    const p = base + s;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** module specifier → 絶対パス / null(外部パッケージ) / {unresolved} */
function resolveSpecifier(spec, fromAbs) {
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const hit = firstExisting(resolve(dirname(fromAbs), spec));
    return hit ?? { unresolved: spec };
  }
  for (const [pattern, targets] of Object.entries(aliasPaths)) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      if (!spec.startsWith(prefix)) continue;
      const rest = spec.slice(prefix.length);
      for (const t of targets) {
        const hit = firstExisting(resolve(baseUrl, t.replace(/\*$/, "") + rest));
        if (hit) return hit;
      }
      return { unresolved: spec };
    }
    if (spec === pattern) {
      for (const t of targets) {
        const hit = firstExisting(resolve(baseUrl, t));
        if (hit) return hit;
      }
      return { unresolved: spec };
    }
  }
  return null; // bare specifier = 外部パッケージ。散らばりの対象外
}

// shared/** の export を集める。`export * from` は名前を列挙できないので、黙って数え落とす
// のではなく止まる。
const sharedFiles = files.filter((f) => f.rel.startsWith("src/shared/"));
const exportsByFile = new Map(); // abs -> Set(exported name)
for (const f of sharedFiles) {
  const names = new Set();
  const sf = sourceFile(f.abs);
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (!st.exportClause) {
        die(`${f.rel} re-exports with \`export *\``, [
          "spread counts named symbols; a star re-export hides which names exist, so the count would be",
          "quietly incomplete. Name the exports, or teach this script how to follow the star.",
        ]);
      }
      if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) names.add(el.name.text);
      else names.add(st.exportClause.name.text); // export * as ns from …
      continue;
    }
    if (ts.isExportAssignment(st)) { names.add("default"); continue; }
    if (!hasExport(st)) continue;
    if (st.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) { names.add("default"); continue; }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
        else die(`${f.rel} exports a destructuring pattern`, ["spread names one symbol at a time; a pattern has no single name to count."]);
      }
      continue;
    }
    if (st.name && ts.isIdentifier(st.name)) names.add(st.name.text);
  }
  exportsByFile.set(f.abs, names);
}

// 消費側（機能 / app router のルート）の import を歩く。
const consumersOf = new Map(); // `${abs} ${symbol}` -> Set(owner)
const key = (abs, symbol) => `${abs} ${symbol}`;
for (const name of exportsByFile.keys()) for (const s of exportsByFile.get(name)) consumersOf.set(key(name, s), new Set());

function noteConsumer(abs, symbol, owner) {
  const k = key(abs, symbol);
  if (!consumersOf.has(k)) consumersOf.set(k, new Set()); // 未申告の名前を import している（型エラー相当）。落とさず数える
  consumersOf.get(k).add(owner);
}

for (const f of files) {
  const owner = ownerOf(f.rel);
  if (owner === null) continue; // 共有予算の内側からの import は散らばりではない
  const sf = sourceFile(f.abs);
  const specs = []; // { spec, node }
  eachNode(sf, (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      specs.push({ spec: n.moduleSpecifier.text, node: n });
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
      specs.push({ spec: n.arguments[0].text, node: null }); // dynamic import: 名前を特定できない
    }
  });
  for (const { spec, node } of specs) {
    const hit = resolveSpecifier(spec, f.abs);
    if (hit === null) continue;
    if (typeof hit !== "string") {
      die(`an import in ${f.rel} could not be resolved: '${spec}'`, [
        "spread is a count of who imports what; an unresolved local import means the count is wrong in a way",
        "that would not show up as a smaller number, only as a wrong one.",
      ]);
    }
    if (!exportsByFile.has(hit)) continue; // shared/** の外（feature 内 / app / css など）
    // 名前を1つずつ引けない形（`import * as ns` / dynamic import / re-export の star）は
    // 「そのモジュールを丸ごと消費した」として全 export に数える。過小に数える方が危険なので。
    const all = () => { for (const s of exportsByFile.get(hit)) noteConsumer(hit, s, owner); };
    if (node === null) { all(); continue; }
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause) continue; // side-effect import: 名前を消費していない
      if (clause.name) noteConsumer(hit, "default", owner);
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) all();
      else if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) noteConsumer(hit, (el.propertyName ?? el.name).text, owner);
      continue;
    }
    // `export { X } from "@/shared/…"` — この機能/ルートを通って外に出ていくのも消費である
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) noteConsumer(hit, (el.propertyName ?? el.name).text, owner);
    } else all();
  }
}

// ソート: 消費者数の降順 → symbol 名 → file。file は同名シンボルが2箇所にある場合の決定打。
// `file` は `shared/…` から書く（§4-② の例に合わせる。`src/` を毎行繰り返さない）。
const spread = [...consumersOf.entries()].map(([k, set]) => {
  const [abs, symbol] = k.split(" ");
  return { symbol, file: relOf(abs).replace(/^src\//, ""), consumers: [...set].sort() };
}).sort((a, b) =>
  b.consumers.length - a.consumers.length ||
  (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0) ||
  (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

// ───────────────────────── ④ 段位（tiers）── verify から持ち上げる ─────────────────────────
// 梯子を再実装しない。同じ意味の判定が2つあることは §8 の「内側の再発明」であり、3つに
// 分岐した `drain` と同種の失敗である。verify を `--json` で呼び、その申告をそのまま使う。
//
// 終了コードの扱い: verify は 0=Green / 1=Red / 2=INCONCLUSIVE。**赤いプロジェクトの測定は
// 正当**（むしろ赤を直す前後で測りたい）なので、exit code では受け入れを決めず、
// **段位が申告されたかどうか**で決める。申告が無ければ空の tiers を出さずに止まる。
// verify が緑でなかった事実は伏せない —— 標準エラーに1行出す（標準出力は JSON だけに保つ）。

const tmpJson = join(tmpdir(), `spacta-measure-${process.pid}.json`);
const run = spawnSync(process.execPath, [VERIFY, targetRoot, `--json=${tmpJson}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let verifyJson = null;
if (existsSync(tmpJson)) {
  try { verifyJson = JSON.parse(readFileSync(tmpJson, "utf8")); } catch { /* reported below */ }
  try { unlinkSync(tmpJson); } catch { /* best effort */ }
}
const rawTiers = Array.isArray(verifyJson?.tiers) ? verifyJson.tiers : null;
if (!rawTiers || rawTiers.length === 0) {
  die("the verifier reported no tiers, so the tier column cannot be filled", [
    `ran: ${process.execPath} ${posix(relative(process.cwd(), VERIFY))} ${positional[0]} --json=<tmp>`,
    `exit code: ${run.status === null ? `killed by signal ${run.signal}` : run.status}`,
    ...(run.error ? [`spawn error: ${run.error.message}`] : []),
    ...(verifyJson === null ? ["the verifier wrote no readable JSON"] : [`schemaVersion: ${verifyJson.schemaVersion}, status: ${verifyJson.status}`]),
    ...String(run.stderr || "").trim().split("\n").filter(Boolean).slice(-6).map((l) => `verify: ${l}`),
    "",
    "measure does not grade features itself: a second copy of that judgement would be the same meaning",
    "re-implemented slightly differently. An empty or partial tier map is not reported in its place.",
  ]);
}
if (verifyJson.schemaVersion !== 3) {
  console.error(`measure: note — the verifier emitted schemaVersion ${verifyJson.schemaVersion}, not 3; tiers were read from it anyway.`);
}
if (verifyJson.status !== "green") {
  console.error(`measure: note — the verifier is ${verifyJson.status} for this target (exit ${run.status}). The numbers below are measured against that tree as it stands.`);
}
// キーは機能名のアルファベット順。verify の印字順（段位の高い順）ではなく名前順にするのは、
// 段位が動いたときに diff が1行で出るようにするため。
const tiers = Object.fromEntries(rawTiers.map((t) => [t.feature, t.tier]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
const ungraded = featureNames.filter((n) => !(n in tiers));
if (ungraded.length) {
  die(`the verifier graded no tier for ${ungraded.length} feature(s)`, [
    ...ungraded,
    "A feature present in src/features/ but absent from the tier report means the two tools disagree about",
    "what a feature is. Reporting the subset would hide that.",
  ]);
}

// ───────────────────────── コミット ─────────────────────────
// 測る対象のリポジトリの HEAD。livingdoc と spacta は別リポジトリであり、`starter` を測ると
// これは spacta の HEAD になるので、どちらのリポジトリの sha かを `repo` で名指しする。
// dirty を印字するのは、コミットされていない作業に対して測った数字は**そう言わなければ
// ならない**からである（sha だけではその数字を再現できない）。
function git(args) {
  const r = spawnSync("git", ["-C", targetRoot, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}
const commit = git(["rev-parse", "HEAD"]);
const repoTop = git(["rev-parse", "--show-toplevel"]);
const repo = repoTop ? posix(repoTop).split("/").filter(Boolean).pop() : null;
// `dirty` は**測定対象のサブツリー**の汚れに限る（追跡外のファイルも含む）。リポジトリ全体に
// 広げないのは、`starter` を測るときに「この道具自身の未コミットの変更」で常に true になり、
// 常に true のフィールドは何も言わないからである。数字を動かしうるのは測った木だけである。
const dirtyTarget = commit ? git(["status", "--porcelain", "--untracked-files=all", "--", "."]) : null;
if (!commit) {
  console.error("measure: note — no git HEAD could be read for this target, so this measurement names no commit.");
}

// ───────────────────────── 出力 ─────────────────────────
// トップレベルのキー順は §4-② の並び。JSON は標準出力へ1回だけ、末尾に改行1つ。
const out = {
  target: targetName,
  repo,
  commit,
  dirty: commit ? dirtyTarget !== "" : null,
  featureCount: featureNames.length,
  zones,
  effectUnion,
  spread,
  tiers,
  excluded,
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
