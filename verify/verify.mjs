#!/usr/bin/env node
/**
 * Membrain verify — 設計論考 I/II の「不変条件をツールで物理強制する」を実装した例。
 *
 * 設計上の要点（なぜ grep ではないか）:
 *   旧 BENCHMARK_PROTOCOL の純度チェックは `grep "Date.now\\|Math.random"` だったため
 *   `new Date()` を**見逃して緑を出した**（ニセの緑）。本スクリプトは TypeScript の
 *   AST を歩いて構文として検出する＝prevent-strong。
 *
 * チェック（MEMBRAIN.md §1 の Law に対応）:
 *   L1 cross-feature-imports : feature が他 feature の内部を import していないか
 *   L2 core-purity           : <feature>/core.ts に IO(async/await/new Date/Date.now/Math.random/fetch/prisma/window…) が無いか
 *   L4 effect-runtime        : shell の effect.type switch に assertNever/:never 終端があるか
 *   L5 source-purity         : app server 境界(page.tsx/route.ts) が非決定性(時刻/乱数/id)を直書き生成していないか（集計は warn）
 *   L7 shared-reverse-dep     : shared/* が features/* の内部を import していないか（逆依存）
 *   L6 self-test             : fixtures/ の「わざと壊した検体」を上記チェッカが必ず弾くか
 *                              ＝検証器自身を検証する。これが無いと L1–L5 はメタレベルで hope に戻る。
 *   L8 presentation-purity   : shell/components に生色(#hex)/arbitrary値/無彩色パレット/色名＋透過度を直書きしていないか（info・burn-in。ステータス色とセマンティックトークンは許容）
 *   clone (B3)               : feature の shell/components 間で UI(JSX/className) が重複していないか（info・burn-in）
 *   おまけ: dead-export / single-owner-export / types.ts 行数（共有予算）/ tsconfig が app/ を include しているか
 *
 * 使い方:
 *   node verify.mjs <projectRoot>        # 既定: このスクリプトから見た ../../project
 *   node verify.mjs <projectRoot> --tsc  # 最後に tsc --noEmit も走らせる
 *
 * 終了コード: L1/L2/L4/L6 のいずれかに違反があれば 1。warn のみなら 0。
 */

import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, relative, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const positional = process.argv.slice(2).find((a) => !a.startsWith("--"));
const projectRoot = resolve(positional || join(__dirname, "..", "..", "project"));
const RUN_TSC = process.argv.includes("--tsc");
// --json=<path> : 結果を機械可読 JSON で書き出す（garden 等のツール向け）。--json 単独なら stdout。
const jsonFlag = process.argv.find((a) => a === "--json" || a.startsWith("--json="));
const JSON_OUT = jsonFlag ? (jsonFlag.startsWith("--json=") ? resolve(jsonFlag.slice("--json=".length)) : null) : undefined;
const FIXTURES = join(__dirname, "fixtures");

// typescript はターゲットプロジェクトの node_modules から解決する
// （このスクリプトを実際にプロジェクトへ置けば、ただの import 'typescript' で済む）
const require = createRequire(join(projectRoot, "package.json"));
let ts;
try {
  ts = require("typescript");
} catch {
  console.error(`typescript をプロジェクトから解決できません: ${projectRoot}\n  -> cd ${projectRoot} && npm install を先に。`);
  process.exit(2);
}

// ───────────────────────── ユーティリティ ─────────────────────────

function walkFiles(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TSX);
}

function eachNode(node, fn) {
  fn(node);
  ts.forEachChild(node, (c) => eachNode(c, fn));
}

const V = (file, line, col, rule, msg) => ({ file, line, col, rule, msg });
function locOf(sf, node) {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { line: line + 1, col: character + 1 };
}
function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

const fileLinesCache = new Map();
function getFileLine(file, lineNumber) {
  if (!fileLinesCache.has(file)) {
    try {
      const content = readFileSync(file, "utf8");
      fileLinesCache.set(file, content.split(/\r?\n/));
    } catch {
      fileLinesCache.set(file, []);
    }
  }
  const lines = fileLinesCache.get(file);
  return lines[lineNumber - 1] ?? "";
}

function getViolationDetails(v) {
  let name = "";
  let why = v.msg;
  let fix = "";

  switch (v.rule) {
    case "L1":
      name = "Isolation";
      why = v.msg;
      fix = "Avoid direct cross-feature imports. Go through the @/shared layer or communicate via API/DB/URL boundaries.";
      break;
    case "L2":
      name = "Purity";
      why = v.msg;
      if (v.msg.includes("async")) {
        fix = "Remove the 'async' keyword. Move asynchronous logic/side-effects out of Core.";
      } else if (v.msg.includes("await")) {
        fix = "Remove the 'await' keyword. Move side-effects out of Core.";
      } else if (v.msg.includes("Date") || v.msg.includes("Math.random")) {
        fix = "Do not generate time or random values inside Core. Inject them via InitData or Action arguments (L3).";
      } else if (v.msg.includes("IO")) {
        fix = "Remove IO/global dependencies (fetch, window, document, etc.). Delegate IO to Shell/runEffect and pass pure values to Core.";
      } else {
        fix = "Move IO/framework dependencies outside Core to Shell or runEffect.";
      }
      break;
    case "L4":
      name = "Exhaustiveness";
      why = v.msg;
      fix = "Use the shared runEffect runtime or add an exhaustiveness check (assertNever or ': never') at the end of the switch statement.";
      break;
    case "L5":
      name = "Source Purity";
      why = v.msg;
      if (v.msg.includes("reduce")) {
        fix = "Move aggregation/formatting logic to a pure function in Core.";
      } else {
        fix = "Do not generate time, random values, or UUIDs at server boundaries. Read them at the Source edge and inject them.";
      }
      break;
    case "L7":
      name = "Reverse Dependency Prevention";
      why = v.msg;
      fix = "Remove imports targeting the features layer from the shared layer.";
      break;
    case "L8":
      name = "Presentation Purity";
      why = v.msg;
      if (v.msg.includes("arbitrary")) {
        fix = "Avoid hardcoded Tailwind arbitrary values. Use theme.extend tokens or shared/ui recipes.";
      } else if (v.msg.includes("Raw color")) {
        fix = "Avoid raw color hex codes. Use semantic theme tokens.";
      } else {
        fix = "Avoid hardcoded grayscales or color/opacity. Use semantic theme tokens (e.g. bg-background, text-foreground).";
      }
      break;
    case "clone":
      name = "UI Duplication";
      why = v.msg;
      fix = "Deduplicate into components/ if 100% identical and within the same feature, otherwise duplicate is acceptable.";
      break;
    case "dead-export":
      name = "Dead Export";
      why = v.msg;
      fix = "Delete the unused export, or add a '// garden:keep <reason>' comment to retain it.";
      break;
    case "single-owner-export":
      name = "Single Owner Export";
      why = v.msg;
      fix = "Consider colocating this type/constant inside its single consumer file.";
      break;
    default:
      name = "Unknown Violation";
      why = v.msg;
      fix = "Resolve the violation according to Membrain conventions.";
  }

  return { name, why, fix };
}

function getFeatureNameFromPath(absPath) {
  const norm = absPath.replace(/\\/g, "/");
  const m = norm.match(/\/features\/([^/]+)/);
  if (m) return m[1];
  const v = norm.match(/\/verify\/([^/]+)/);
  if (v && v[1] !== "fixtures") return v[1];
  return null;
}

// ───────────────────────── L2 Core純度 ─────────────────────────
// 純粋な「テキスト→違反配列」関数。本体スキャンと self-test の両方から呼ぶ。
const FORBIDDEN_IMPORT = /(^|\/)(prisma|@prisma|.*client-gateway|.*gateway)(\/|$)|^next(\/|$)|^react(-dom)?$/i;
const FORBIDDEN_GLOBALS = new Set(["window", "document", "localStorage", "sessionStorage", "fetch"]);

export function checkCorePurity(file, text) {
  const sf = parse(file, text);
  const out = [];
  eachNode(sf, (n) => {
    const loc = locOf(sf, n);
    // async functions
    if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) &&
        n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      out.push(V(file, loc.line, loc.col, "L2", "async functions are prohibited in Core"));
    }
    // await
    if (ts.isAwaitExpression(n)) out.push(V(file, loc.line, loc.col, "L2", "await is prohibited in Core"));
    // new Date(...)
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Date") {
      out.push(V(file, loc.line, loc.col, "L2", "new Date() is non-deterministic IO. Inject now via InitData or Action (L3)"));
    }
    // Date.now / Math.random
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const k = `${n.expression.text}.${n.name.text}`;
      if (k === "Date.now") out.push(V(file, loc.line, loc.col, "L2", "Date.now() is non-deterministic. Inject now (L3)"));
      if (k === "Math.random") out.push(V(file, loc.line, loc.col, "L2", "Math.random() is non-deterministic. Inject seed (L3)"));
    }
    // Prohibited global identifiers (calls/references)
    if (ts.isIdentifier(n) && FORBIDDEN_GLOBALS.has(n.text)) {
      const parent = n.parent;
      // Exclude property names (e.g. foo.fetch) or import bindings, only grab pure references
      const isPropName = parent && ts.isPropertyAccessExpression(parent) && parent.name === n;
      const isDecl = parent && (ts.isImportSpecifier(parent) || ts.isBindingElement(parent) || ts.isParameter(parent));
      if (!isPropName && !isDecl) out.push(V(file, loc.line, loc.col, "L2", `${n.text} is external IO. Prohibited in Core`));
    }
    // Prohibited module imports
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      if (FORBIDDEN_IMPORT.test(spec)) out.push(V(file, loc.line, loc.col, "L2", `Import of '${spec}' is prohibited in Core (framework/IO leakage)`));
    }
  });
  return out;
}

// ───────────────────────── L1 cross-feature import ─────────────────────────
// featureName: Feature name this file belongs to (specified in self-test)
export function checkCrossFeatureImport(file, text, featureName) {
  const sf = parse(file, text);
  const out = [];
  eachNode(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      const loc = locOf(sf, n);
      
      let absSpec = null;
      if (spec.startsWith(".")) {
        absSpec = resolve(dirname(file), spec);
      } else if (spec.startsWith("@/")) {
        const src = join(projectRoot, "src");
        absSpec = resolve(src, spec.slice(2));
      } else {
        // Fallback for absolute/non-relative imports that don't use @/
        const m = spec.match(/(?:^|\/)features\/([^/]+)\//);
        if (m && m[1] !== featureName) {
          out.push(V(file, loc.line, loc.col, "L1", `Direct import of adjacent feature '${m[1]}' internals`));
        }
        return;
      }
      
      const importedFeature = getFeatureNameFromPath(absSpec);
      if (importedFeature && importedFeature !== featureName) {
        out.push(V(file, loc.line, loc.col, "L1", `Direct import of adjacent feature '${importedFeature}' internals`));
      }
    }
  });
  return out;
}

// ───────────────────────── L4 effect-runtime (Exhaustiveness) ─────────────────────────
// If there is a switch statement using effect.type as the discriminant but it lacks assertNever/:never termination, it violates exhaustiveness.
export function checkEffectRuntime(file, text) {
  const sf = parse(file, text);
  const out = [];
  let hasEffectSwitch = false;
  let switchLoc = { line: 0, col: 0 };
  let hasNever = false; // Evaluated via AST (not fooled by comments containing ": never")
  eachNode(sf, (n) => {
    if (ts.isSwitchStatement(n)) {
      const expr = n.expression;
      const isEffectType =
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        /effect/i.test(expr.expression.text) &&
        expr.name.text === "type";
      if (isEffectType) {
        hasEffectSwitch = true;
        switchLoc = locOf(sf, n);
      }
    }
    // never type annotation (e.g. const _exhaustive: never = ...)
    if (n.kind === ts.SyntaxKind.NeverKeyword) hasNever = true;
    // assertNever(...) call
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "assertNever") hasNever = true;
  });
  if (!hasEffectSwitch) return out; // OK if routing through shared runEffect
  if (!hasNever) {
    out.push(V(file, switchLoc.line, switchLoc.col, "L4",
      "Handwritten switch on effect.type lacks exhaustiveness check (assertNever or ': never'). Effect additions might be silently ignored. Use the shared runEffect runtime or add never termination."));
  }
  return out;
}

// ───────────────────────── L5 source-purity (Server boundary: page + route) ─────────────────────────
// Non-deterministic generation (time, random, ids) is an error. Direct aggregation is a warning.
export function checkSourcePurity(file, text) {
  const sf = parse(file, text);
  const out = [];
  eachNode(sf, (n) => {
    const loc = locOf(sf, n);
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Date") {
      out.push(V(file, loc.line, loc.col, "L5", "new Date() at server boundary. Read time at the Source edge and inject as InitData or arguments (L3)"));
    }
    if (ts.isPropertyAccessExpression(n)) {
      if (ts.isIdentifier(n.expression)) {
        const k = `${n.expression.text}.${n.name.text}`;
        if (k === "Date.now" || k === "Math.random")
          out.push(V(file, loc.line, loc.col, "L5", `${k} at server boundary. Non-determinism must be injected, not generated here (L3)`));
      }
      // crypto.randomUUID() / crypto.getRandomValues()
      if (n.name.text === "randomUUID" || n.name.text === "getRandomValues")
        out.push(V(file, loc.line, loc.col, "L5", `${n.name.text}() at server boundary. UUIDs/random values must be injected, not generated here (L3)`));
    }
    // Prohibited imports at server boundaries (e.g. uuid, nanoid)
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      if (spec === "uuid" || spec === "nanoid" || spec.startsWith("uuid/") || spec.startsWith("nanoid/")) {
        out.push(V(file, loc.line, loc.col, "L5", `Import of '${spec}' is prohibited at server boundaries. IDs must be injected (L3)`));
      }
    }
    // Direct reduce aggregation is a warning
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "reduce") {
      out.push({ ...V(file, loc.line, loc.col, "L5", "Direct aggregation using .reduce(). Move to a pure function in Core to share between tests, SSR, and routes"), warn: true });
    }
  });
  return out;
}

// ───────────────────────── L7 Reverse Dependency Prevention ─────────────────────────
export function checkSharedReverseDependency(file, text) {
  const sf = parse(file, text);
  const out = [];
  eachNode(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      // Importing features/<any>
      const m = spec.match(/(?:^|\/)features\/([^/]+)/);
      // Importing features/ via relative path
      const rel = spec.match(/(?:\.\.\/)+features\/([^/]+)/);
      if (m || rel) {
        const featureName = m ? m[1] : rel[1];
        const loc = locOf(sf, n);
        out.push(V(file, loc.line, loc.col, "L7", `Shared layer imports feature '${featureName}' internals (reverse dependency)`));
      }
    }
  });
  return out;
}

// ───────────────────────── L8 提示純度（burn-in / info）─────────────────────────
// shell/components に「生色(#hex)」や「Tailwind arbitrary値(bg-[...])」を直書きしていないか。
// 提示語彙は tailwind.config.ts theme.extend・shared/ui の cva/tailwind-variants レシピから使う
// （完成UIではなく語彙を共有する。クラス文字列を束ねた中央 tokens.ts は置かない）。
// UI は例外が多いため初期は info（fail させない・burn-in）。将来 fail へ昇格しうる。
// AST の文字列/テンプレート/JSXテキストだけを見る＝コメントや import パスに騙されない。
const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
// class風トークン + arbitrary角括弧: bg-[#fff] / text-[13px] / w-[42px] / grid-cols-[1fr_2fr]
const ARBITRARY_RE = /[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/g;

// 色ユーティリティの分類（option D）。無彩色パレットと「色名＋透過度の隠れハードコード」だけを info 化し、
// ステータス色とセマンティックトークン(theme由来)は許容する。詳細は verify/README「L8 の色トークン判定」。
const COLOR_PREFIX = "(?:bg|text|border|ring|ring-offset|fill|stroke|from|via|to|divide|outline|decoration|shadow|accent|caret|placeholder)";
const COLOR_UTIL_RE = new RegExp(`^${COLOR_PREFIX}-([a-z]+)(?:-(\\d{1,3}))?(?:/(?:\\d{1,3}|\\[[^\\]]+\\]))?$`);
// Tailwind 既定パレットの色名。ここに無い色名は theme.extend のセマンティックトークンとみなし許容する。
const TAILWIND_PALETTE = new Set(["slate","gray","zinc","neutral","stone","red","orange","amber","yellow","lime","green","emerald","teal","cyan","sky","blue","indigo","violet","purple","fuchsia","pink","rose","white","black"]);
const ACHROMATIC = new Set(["slate","gray","zinc","neutral","stone","white","black"]); // 外郭配色 → 常に info
const STATUS = new Set(["red","orange","amber","yellow","green","emerald","blue","sky"]); // 状態表示 → 許容

// core: variant プレフィックス(dark: 等)を剥がした後のクラストークン。
// 返り値: null(許容) / "achromatic"(無彩色) / "hidden"(色名＋透過度の隠れハードコード)
function classifyColorToken(core) {
  const m = core.match(COLOR_UTIL_RE);
  if (!m) return null;
  const color = m[1];
  const hasOpacity = core.includes("/");
  if (!TAILWIND_PALETTE.has(color)) return null; // セマンティックトークン → 許容
  if (ACHROMATIC.has(color)) return "achromatic"; // 無彩色は透過度の有無を問わず info
  if (STATUS.has(color)) return null; // ステータス色 → 許容（エスケープハッチ）
  return hasOpacity ? "hidden" : null; // brand/accent は透過度付きだけ叩く（ノイズ回避）
}

export function checkPresentationPurity(file, text) {
  const sf = parse(file, text);
  const out = [];
  const seen = new Set(); // Avoid duplicate reporting of same token on same line

  function scan(node, raw) {
    if (!raw) return;
    const loc = locOf(sf, node);
    let m;
    // arbitrary values (with square brackets)
    ARBITRARY_RE.lastIndex = 0;
    while ((m = ARBITRARY_RE.exec(raw))) {
      const key = `${loc.line}|arb|${m[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...V(file, loc.line, loc.col, "L8",
        `Tailwind arbitrary value '${m[0]}'. Use theme/shared-ui tokens instead.`), info: true });
    }
    // raw hex codes (excluding hex inside arbitrary brackets which are handled above)
    const bare = raw.replace(/\[[^\]]*\]/g, "");
    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(bare))) {
      const key = `${loc.line}|hex|${m[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...V(file, loc.line, loc.col, "L8",
        `Raw color hex '${m[0]}'. Use theme tokens instead.`), info: true });
    }
    // color utilities (grayscale palette / color+opacity hidden hardcoding)
    for (const token of raw.split(/\s+/)) {
      if (!token) continue;
      const core = token.slice(token.lastIndexOf(":") + 1); // strip hover: / dark: etc.
      const kind = classifyColorToken(core);
      if (!kind) continue;
      const key = `${loc.line}|col|${core}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...V(file, loc.line, loc.col, "L8", kind === "achromatic"
        ? `Achromatic palette '${core}'. Migrate to semantic tokens like bg-background, text-foreground, bg-card, or border-border.`
        : `Hidden hardcoded color/opacity '${core}'. Migrate to semantic tokens with opacity (e.g., bg-primary/10).`), info: true });
    }
  }

  eachNode(sf, (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) scan(n, n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) scan(n, n.text);
    else if (ts.isJsxText(n)) scan(n, n.text);
  });
  return out;
}

// ───────────────────────── クローン検知（UI重複 / info・burn-in・B3）─────────────────────────
// 「同じUIが2回」を検知して info（＝庭師への指示書）にする。
// Tailwind クラスの順不同問題に必ず対処する：className を集合（順序無視）に正規化し、
// JSX 部分木を「子孫タグ名 + className トークン」の集合へ落として Jaccard 類似度で比較する。
// 比較対象は「根 JSX 要素」（親が JSX 要素/フラグメントでない JSX 要素/フラグメント）に限る
//   ＝入れ子の重複を二重報告しない（return が返すブロック単位で見る）。
// 小さすぎる要素（トークン数 < CLONE_MIN_TOKENS）はノイズなので無視する。
// info・burn-in（fail させない）。実際に潰すか否かは庭師が判断する（§5：重複のまま放置が既定、
// 同一 feature 内の完全一致だけ事後抽出。80〜90%類似は許容）。
const CLONE_MIN_TOKENS = 5; // これ未満の小さな JSX は比較しない（誤検出抑制）
const CLONE_SIMILARITY = 0.9; // Jaccard 類似度がこの値以上なら「重複の疑い」とみなす

function classNameTokens(attrsHost) {
  const out = [];
  const attrs = attrsHost.attributes?.properties ?? [];
  for (const a of attrs) {
    if (!ts.isJsxAttribute(a) || !a.name || a.name.getText() !== "className") continue;
    const init = a.initializer;
    let raw = null;
    if (init && ts.isStringLiteral(init)) raw = init.text;
    else if (init && ts.isJsxExpression(init) && init.expression) {
      const e = init.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) raw = e.text;
    }
    if (raw) for (const t of raw.split(/\s+/).filter(Boolean)) out.push("cls:" + t); // 集合化＝順序無視
  }
  return out;
}

// JSX 部分木を集合（子孫タグ + className トークン）に落とす。className を集合化することで
// クラス記述順（Tailwind 順不同問題）に依存しない比較になる。
function bagOfJsx(node) {
  const bag = new Set();
  eachNode(node, (n) => {
    if (ts.isJsxElement(n)) {
      bag.add("tag:" + n.openingElement.tagName.getText());
      for (const t of classNameTokens(n.openingElement)) bag.add(t);
    } else if (ts.isJsxSelfClosingElement(n)) {
      bag.add("tag:" + n.tagName.getText());
      for (const t of classNameTokens(n)) bag.add(t);
    } else if (ts.isJsxFragment(n)) {
      bag.add("tag:Fragment");
    }
  });
  return bag;
}

function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

// JSX 祖先（親要素・.map() コールバックが返す親の子孫など）を持つかを判定する。
// 構文木上は別ルートでも、意味上は親要素の中身なので clone 候補から外す（親子入れ子の誤検知防止）。
function hasJsxAncestor(node) {
  let p = node.parent;
  while (p) {
    if (ts.isJsxElement(p) || ts.isJsxFragment(p) || ts.isJsxExpression(p)) return true;
    p = p.parent;
  }
  return false;
}

// files: [{ file, text }]。クローンは本質的にファイル横断なので、per-file ではなく集合を受け取る。
export function checkClones(files) {
  const candidates = [];
  for (const { file, text } of files) {
    const sf = parse(file, text);
    eachNode(sf, (n) => {
      if (!ts.isJsxElement(n) && !ts.isJsxFragment(n)) return;
      // Compare root JSX elements only to prevent duplicate nesting reports
      if (hasJsxAncestor(n)) return;
      const bag = bagOfJsx(n);
      if (bag.size < CLONE_MIN_TOKENS) return;
      const loc = locOf(sf, n);
      candidates.push({ file, line: loc.line, col: loc.col, bag });
    });
  }
  const out = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.file === b.file && a.line === b.line) continue;
      const sim = jaccard(a.bag, b.bag);
      if (sim >= CLONE_SIMILARITY) {
        out.push({ ...V(b.file, b.line, b.col, "clone",
          `Suspected UI duplication (Jaccard ${sim.toFixed(2)}): highly similar to ${basename(a.file)}:${a.line}. ` +
          `Deduplicate into components/ if 100% identical and within the same feature, otherwise duplicate is acceptable.`), info: true });
      }
    }
  }
  return out;
}

// ───────────────────────── export 所有状況（共有予算）─────────────────────────
// feature の types.ts の export 記号を、src/ + app/ の何ファイルが import しているかで分類する。
//   0  → dead-export（死蔵契約）
//   1  → single-owner-export（所有者のそばへ寄せる候補）
//   2+ → 真の共有契約
// どちらも初期重大度は info。single-owner は恒久 info。
//
// consumers: [{ file, text }] の配列。本体スキャンでは types.ts 自身を除いた src/+app/ の全 .ts/.tsx。
// srcRoot: '@/' エイリアス解決の基点（プロジェクトの src ディレクトリ）。self-test では null 可。
function collectExportUsage(typesFile, typesText, consumers, srcRoot) {
  const sf = parse(typesFile, typesText);
  const exported = new Map();

  function hasDiscriminantType(typeNode) {
    const types = ts.isUnionTypeNode(typeNode) ? typeNode.types : [typeNode];
    return types.some((t) => ts.isTypeLiteralNode(t) && t.members.some((m) =>
      ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === "type"));
  }

  function remember(name, node, membrane = false) {
    const loc = locOf(sf, node);
    exported.set(name, {
      line: loc.line,
      col: loc.col,
      membrane: membrane || /(?:Action|Effect|State|InitData)$/.test(name),
    });
  }

  eachNode(sf, (n) => {
    const hasExport = n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (hasExport && ts.isTypeAliasDeclaration(n) && n.name) {
      remember(n.name.text, n, hasDiscriminantType(n.type));
    }
    if (hasExport && (ts.isInterfaceDeclaration(n) || ts.isEnumDeclaration(n) ||
        ts.isClassDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name) {
      remember(n.name.text, n);
    }
    if (hasExport && ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations)
        if (ts.isIdentifier(d.name)) remember(d.name.text, d);
    }
    // export { A, B }（re-export 元が typesText 自身の記号）
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause) && !n.moduleSpecifier) {
      for (const el of n.exportClause.elements) remember(el.name.text, el);
    }
  });

  const stripExt = (p) => p.replace(/\\/g, "/").replace(/\.(ts|tsx)$/, "");
  const typesKey = stripExt(typesFile);

  function resolvesToTypes(consumerFile, spec) {
    const candidates = [];
    if (spec.startsWith(".")) candidates.push(resolve(dirname(consumerFile), spec));
    else if (spec.startsWith("@/") && srcRoot) {
      candidates.push(resolve(srcRoot, spec.slice(2)));
      candidates.push(resolve(dirname(srcRoot), spec.slice(2)));
    }
    return candidates.some((abs) => stripExt(abs) === typesKey);
  }

  // 各 export 記号が import された消費者ファイル数を数える
  const importRefs = new Map([...exported.keys()].map((e) => [e, new Set()]));
  // フォールバック用: 消費者内に識別子として出現するか（barrel/再エクスポート対策・低確度）
  const identifierSeen = new Set();

  for (const { file, text } of consumers) {
    const csf = parse(file, text);
    eachNode(csf, (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) &&
          resolvesToTypes(file, n.moduleSpecifier.text) && n.importClause?.namedBindings &&
          ts.isNamedImports(n.importClause.namedBindings)) {
        for (const el of n.importClause.namedBindings.elements) {
          const local = el.propertyName?.text ?? el.name.text; // import { A as B } → A 側で照合
          if (importRefs.has(local)) importRefs.get(local).add(file);
        }
      }
      if (ts.isIdentifier(n) && exported.has(n.text)) identifierSeen.add(n.text);
    });
  }

  return { exported, importRefs, identifierSeen };
}

// feature の types.ts の export 記号が、src/ + app/ のどこからも参照されないなら「死蔵」。
// 幹（types.ts）に居座る使われない契約は「共有しているという嘘」であり、共有予算を食う。
export function checkDeadExports(typesFile, typesText, consumers, srcRoot) {
  const { exported, importRefs, identifierSeen } = collectExportUsage(typesFile, typesText, consumers, srcRoot);
  if (exported.size === 0) return [];

  const out = [];
  for (const [name, meta] of exported) {
    if (importRefs.get(name).size > 0) continue;
    if (identifierSeen.has(name)) continue; // low-confidence fallback (e.g. re-exports)
    out.push({ ...V(typesFile, meta.line, meta.col, "dead-export",
      `Export '${name}' is not imported anywhere in src/ or app/ (dead contract / wasted sharing budget). Candidate for deletion.`), info: true });
  }
  return out;
}

// feature の types.ts の export 記号がちょうど1ファイルからだけ参照されるなら、
// 所有者のそばへ寄せる候補として info を出す。Action/Effect/State/InitData などの膜語彙は除外する。
export function checkSingleOwnerExports(typesFile, typesText, consumers, srcRoot) {
  const { exported, importRefs } = collectExportUsage(typesFile, typesText, consumers, srcRoot);
  if (exported.size === 0) return [];

  const out = [];
  for (const [name, meta] of exported) {
    if (meta.membrane) continue;
    const owners = importRefs.get(name);
    if (owners.size !== 1) continue;
    const owner = [...owners][0];
    out.push({ ...V(typesFile, meta.line, meta.col, "single-owner-export",
      `Export '${name}' is only imported by a single file (${basename(owner)}). Consider colocating it with its consumer.`), info: true });
  }
  return out;
}

// ───────────────────────── スキャン本体 ─────────────────────────
function featureNameOf(file) {
  const m = file.replace(/\\/g, "/").match(/features\/([^/]+)\//);
  return m ? m[1] : null;
}

function runMainScan() {
  const srcRoot = join(projectRoot, "src");
  const appRoot = join(projectRoot, "app");
  const all = [];

  // L2: */core.ts
  for (const f of walkFiles(srcRoot, (p) => /(^|\/)core\.ts$/.test(p.replace(/\\/g, "/"))))
    all.push(...checkCorePurity(f, readFileSync(f, "utf8")));

  // L1: features/ 配下すべて
  for (const f of walkFiles(join(srcRoot, "features"), (p) => /\.(ts|tsx)$/.test(p))) {
    const fn = featureNameOf(f);
    if (fn) all.push(...checkCrossFeatureImport(f, readFileSync(f, "utf8"), fn));
  }

  // L4: */shell.tsx
  for (const f of walkFiles(srcRoot, (p) => /(^|\/)shell\.tsx$/.test(p.replace(/\\/g, "/"))))
    all.push(...checkEffectRuntime(f, readFileSync(f, "utf8")));

  // L5: app/**/page.tsx + app/**/route.ts（server 境界。純度の基準は page/route で同じ）
  for (const f of walkFiles(appRoot, (p) => /(^|\/)(page|route)\.tsx?$/.test(p.replace(/\\/g, "/"))))
    all.push(...checkSourcePurity(f, readFileSync(f, "utf8")));

  // L7: shared/ 配下すべて（逆依存防止）
  const sharedRoot = join(srcRoot, "shared");
  if (existsSync(sharedRoot)) {
    for (const f of walkFiles(sharedRoot, (p) => /\.(ts|tsx)$/.test(p))) {
      all.push(...checkSharedReverseDependency(f, readFileSync(f, "utf8")));
    }
  }

  // L8: feature の shell.tsx + components/ 配下の .tsx（提示純度・info）
  for (const f of walkFiles(join(srcRoot, "features"), (p) => {
    const q = p.replace(/\\/g, "/");
    return /(^|\/)shell\.tsx$/.test(q) || /\/components\/.*\.tsx$/.test(q);
  }))
    all.push(...checkPresentationPurity(f, readFileSync(f, "utf8")));

  // クローン検知（info・B3）: feature の shell.tsx + components/ を横断して UI 重複を拾う
  const cloneFiles = walkFiles(join(srcRoot, "features"), (p) => {
    const q = p.replace(/\\/g, "/");
    return /(^|\/)shell\.tsx$/.test(q) || /\/components\/.*\.tsx$/.test(q);
  }).map((f) => ({ file: f, text: readFileSync(f, "utf8") }));
  all.push(...checkClones(cloneFiles));

  // export 所有状況（info）: features/**/types.ts の死蔵 export / 単独所有 export を検知。
  // 消費者 = src/ + app/ の全 .ts/.tsx（その types.ts 自身は除外）。app/ を必ず含める
  //（API route や page が feature 型を import するため。src だけ見ると誤って dead 判定する）。
  const consumerFiles = [
    ...walkFiles(srcRoot, (p) => /\.(ts|tsx)$/.test(p)),
    ...walkFiles(appRoot, (p) => /\.(ts|tsx)$/.test(p)),
  ];
  for (const tf of walkFiles(join(srcRoot, "features"), (p) => /(^|\/)types\.ts$/.test(p.replace(/\\/g, "/")))) {
    const consumers = consumerFiles
      .filter((c) => c !== tf)
      .map((c) => ({ file: c, text: readFileSync(c, "utf8") }));
    const typesText = readFileSync(tf, "utf8");
    all.push(...checkDeadExports(tf, typesText, consumers, srcRoot));
    all.push(...checkSingleOwnerExports(tf, typesText, consumers, srcRoot));
  }

  return all;
}

// Info checks (non-blocking): types.ts line budget / tsconfig include
function runInfoChecks() {
  const notes = [];
  const srcRoot = join(projectRoot, "src");
  for (const f of walkFiles(srcRoot, (p) => /(^|\/)types\.ts$/.test(p.replace(/\\/g, "/")))) {
    const n = readFileSync(f, "utf8").split("\n").length;
    const limit = /shared\//.test(f.replace(/\\/g, "/")) ? 250 : 200;
    if (n > limit) notes.push(`types.ts sharing budget exceeded: ${relative(projectRoot, f)} = ${n} lines (> ${limit})`);
  }
  const tsconfigP = join(projectRoot, "tsconfig.json");
  if (existsSync(tsconfigP)) {
    const tc = readFileSync(tsconfigP, "utf8");
    const includesApp = /"app[\/*]|\*\*\/\*\.tsx?"/.test(tc) || /"include"[\s\S]*app/.test(tc);
    if (!includesApp) notes.push("tsconfig.json include might not cover app/ (server-client contracts won't be verified by tsc)");
  }
  return notes;
}

// ───────────────────────── L6 self-test (Verifier Self-Verification) ─────────────────────────
function runSelfTest() {
  const F = (name) => join(FIXTURES, name);
  const read = (name) => readFileSync(F(name), "utf8");
  const cases = [
    {
      exec: () => checkCorePurity(F("bad-core.core.ts"), read("bad-core.core.ts")),
      expect: [
        { rule: "L2", line: 6 },
        { rule: "L2", line: 8 },
        { rule: "L2", line: 9 },
        { rule: "L2", line: 10 },
        { rule: "L2", line: 11 },
        { rule: "L2", line: 12 },
        { rule: "L2", line: 13 },
        { rule: "L2", line: 13 }
      ],
      label: "L2 rejects new Date/await/prisma in Core"
    },
    {
      exec: () => checkCorePurity(F("good.core.ts"), read("good.core.ts")),
      expect: [],
      label: "L2 does not trigger false positives on a clean Core"
    },
    {
      exec: () => checkCrossFeatureImport(F("bad-cross-import.ts"), read("bad-cross-import.ts"), "alpha"),
      expect: [
        { rule: "L1", line: 5 },
        { rule: "L1", line: 6 }
      ],
      label: "L1 rejects direct adjacent feature imports"
    },
    {
      exec: () => checkEffectRuntime(F("bad-shell-switch.shell.tsx"), read("bad-shell-switch.shell.tsx")),
      expect: [
        { rule: "L4", line: 7 }
      ],
      label: "L4 rejects handwritten switch lacking exhaustiveness check"
    },
    {
      exec: () => checkSharedReverseDependency(F("bad-shared-import.shared.ts"), read("bad-shared-import.shared.ts")),
      expect: [
        { rule: "L7", line: 1 },
        { rule: "L7", line: 2 }
      ],
      label: "L7 rejects reverse dependency imports from shared to features"
    },
    {
      exec: () => checkSharedReverseDependency(F("good-shared.shared.ts"), read("good-shared.shared.ts")),
      expect: [],
      label: "L7 does not trigger false positives on a clean shared layer"
    },
    // L5(route): rejects non-deterministic generation in routes / avoids false positives
    {
      exec: () => checkSourcePurity(F("bad-route.route.ts"), read("bad-route.route.ts")),
      expect: [
        { rule: "L5", line: 6 },
        { rule: "L5", line: 9 },
        { rule: "L5", line: 10 },
        { rule: "L5", line: 11 } // warning from reduce
      ],
      label: "L5 rejects new Date/randomUUID generation and uuid import in routes"
    },
    {
      exec: () => checkSourcePurity(F("good-route.route.ts"), read("good-route.route.ts")),
      expect: [],
      label: "L5 does not trigger false positives on a clean route"
    },
    // L8: flags raw colors and arbitrary values / avoids false positives
    {
      exec: () => checkPresentationPurity(F("bad-presentation.shell.tsx"), read("bad-presentation.shell.tsx")),
      expect: [
        { rule: "L8", line: 8 },
        { rule: "L8", line: 8 },
        { rule: "L8", line: 8 },
        { rule: "L8", line: 8 },
        { rule: "L8", line: 9 },
        { rule: "L8", line: 9 },
        { rule: "L8", line: 9 },
        { rule: "L8", line: 10 },
        { rule: "L8", line: 10 },
        { rule: "L8", line: 11 }
      ],
      label: "L8 flags raw colors and arbitrary values"
    },
    {
      exec: () => checkPresentationPurity(F("good-presentation.shell.tsx"), read("good-presentation.shell.tsx")),
      expect: [],
      label: "L8 does not trigger false positives on clean presentation"
    },
    // clone(B3): detects UI duplication ignoring className order / avoids false positives
    {
      exec: () => checkClones([
        { file: F("clone-a.shell.tsx"), text: read("clone-a.shell.tsx") },
        { file: F("clone-b.shell.tsx"), text: read("clone-b.shell.tsx") }]),
      expect: [
        { rule: "clone", line: 8 }
      ],
      label: "clone detects UI duplication ignoring className order"
    },
    {
      exec: () => checkClones([
        { file: F("clone-a.shell.tsx"), text: read("clone-a.shell.tsx") },
        { file: F("clone-distinct.shell.tsx"), text: read("clone-distinct.shell.tsx") }]),
      expect: [],
      label: "clone does not trigger false positives on distinct UIs"
    },
    // clone(B3): avoids false positives on map callback nestings
    {
      exec: () => checkClones([
        { file: F("clone-map-callback.shell.tsx"), text: read("clone-map-callback.shell.tsx") }]),
      expect: [],
      label: "clone does not trigger false positives on map callback nestings"
    },
    // dead-export: flags unused exports / avoids false positives
    {
      exec: () => checkDeadExports(F("dead-export.types.ts"), read("dead-export.types.ts"),
        [{ file: F("dead-export.consumer.ts"), text: read("dead-export.consumer.ts") }], null),
      expect: [
        { rule: "dead-export", line: 7 }
      ],
      label: "dead-export flags unused exports"
    },
    {
      exec: () => checkDeadExports(F("shared-export.types.ts"), read("shared-export.types.ts"),
        [{ file: F("shared-export.consumer-a.ts"), text: read("shared-export.consumer-a.ts") },
         { file: F("shared-export.consumer-b.ts"), text: read("shared-export.consumer-b.ts") }], null),
      expect: [],
      label: "dead-export does not flag shared exports"
    },
    // single-owner: flags single-owner exports / excludes membrane vocabulary / avoids false positives
    {
      exec: () => checkSingleOwnerExports(F("single-owner-export.types.ts"), read("single-owner-export.types.ts"),
        [{ file: F("single-owner-export.consumer.ts"), text: read("single-owner-export.consumer.ts") }], null),
      expect: [
        { rule: "single-owner-export", line: 6 }
      ],
      label: "single-owner-export flags single-owner exports"
    },
    {
      exec: () => checkSingleOwnerExports(F("single-owner-export.types.ts"), read("single-owner-export.types.ts"),
        [{ file: F("single-owner-export.consumer.ts"), text: read("single-owner-export.consumer.ts") }], null)
          .filter((v) => /Action/.test(v.msg)),
      expect: [],
      label: "single-owner-export excludes membrane vocabulary"
    },
    {
      exec: () => checkSingleOwnerExports(F("shared-export.types.ts"), read("shared-export.types.ts"),
        [{ file: F("shared-export.consumer-a.ts"), text: read("shared-export.consumer-a.ts") },
         { file: F("shared-export.consumer-b.ts"), text: read("shared-export.consumer-b.ts") }], null),
      expect: [],
      label: "single-owner-export does not flag shared exports"
    }
  ];
  const failures = [];
  for (const c of cases) {
    const vs = c.exec();
    
    // Sort logic to match expected and actual elements consistently
    const sortFn = (a, b) => a.line - b.line || a.rule.localeCompare(b.rule);
    const actualSorted = vs.map(v => ({ rule: v.rule, line: v.line })).sort(sortFn);
    const expectedSorted = c.expect.sort(sortFn);
    
    let ok = actualSorted.length === expectedSorted.length;
    if (ok) {
      for (let i = 0; i < actualSorted.length; i++) {
        if (actualSorted[i].rule !== expectedSorted[i].rule || actualSorted[i].line !== expectedSorted[i].line) {
          ok = false;
          break;
        }
      }
    }
    
    if (!ok) {
      const actualStr = JSON.stringify(actualSorted);
      const expectedStr = JSON.stringify(expectedSorted);
      failures.push(`self-test failed: ${c.label}\n    expected: ${expectedStr}\n    got:      ${actualStr}`);
    }
  }
  return failures;
}

// ───────────────────────── JSON 出力（--json）─────────────────────────
// garden（庭師の「目」）などのツールが消費する機械可読の結果。人間表示とは独立。
function emitJson(payload) {
  if (JSON_OUT === undefined) return;
  const relV = (v) => ({
    rule: v.rule, file: relative(projectRoot, v.file), line: v.line, col: v.col ?? 1, msg: v.msg,
  });
  const body = {
    tool: "membrain-verify",
    schemaVersion: 1,
    projectRoot,
    selfTest: payload.selfTest,
    status: payload.status,
    errors: (payload.errors ?? []).map(relV),
    warns: (payload.warns ?? []).map(relV),
    infos: (payload.infos ?? []).map(relV),
    notes: payload.notes ?? [],
  };
  const text = JSON.stringify(body, null, 2);
  if (JSON_OUT === null) console.log(text);
  else writeFileSync(JSON_OUT, text + "\n");
}

// ───────────────────────── 実行 ─────────────────────────
function group(viols) {
  const byRule = {};
  for (const v of viols) (byRule[v.rule] ??= []).push(v);
  return byRule;
}

console.log(`\n[Membrain verify] target = ${projectRoot}\n`);

// Run L6 self-test first. If the verifier is broken, subsequent greens cannot be trusted.
const selfFail = runSelfTest();
if (selfFail.length) {
  console.error("✗ L6 self-test (Verifier Self-Verification) failed:");
  selfFail.forEach((m) => console.error("   " + m));
  console.error("\nThe verifier itself is malfunctioning. Other results cannot be trusted. Fix verify.mjs.\n");
  emitJson({ selfTest: { ok: false, failures: selfFail }, status: "red" });
  process.exit(1);
}
console.log("✓ L6 self-test: Verifier correctly rejects planted violations and avoids false positives.\n");

const viols = runMainScan();
const errors = viols.filter((v) => !v.warn && !v.info);
const warns = viols.filter((v) => v.warn);
const infoViols = viols.filter((v) => v.info);
const notes = runInfoChecks();

let failed = false;

if (errors.length > 0) {
  failed = true;
  console.log(`✗ Violations (Errors): ${errors.length} case(s)`);
  for (const v of errors) {
    const details = getViolationDetails(v);
    const relPath = relative(projectRoot, v.file);
    const codeLine = getFileLine(v.file, v.line).trim();
    console.log(`✗ [${v.rule}] [${details.name}]`);
    console.log(`  --> ${relPath}:${v.line}:${v.col ?? 1}`);
    console.log(`  Code: ${codeLine}`);
    console.log(`  Why: ${details.why}`);
    console.log(`  Fix: ${details.fix}`);
    console.log("");
  }
} else {
  console.log("✓ Laws (L1, L2, L4, L5, L7): No violations");
}

if (warns.length > 0) {
  console.log(`\nⓘ Warnings (detect layer - non-blocking): ${warns.length} case(s)`);
  for (const v of warns) {
    const details = getViolationDetails(v);
    const relPath = relative(projectRoot, v.file);
    const codeLine = getFileLine(v.file, v.line).trim();
    console.log(`⚠ [${v.rule}] [${details.name}]`);
    console.log(`  --> ${relPath}:${v.line}:${v.col ?? 1}`);
    console.log(`  Code: ${codeLine}`);
    console.log(`  Why: ${details.why}`);
    console.log(`  Fix: ${details.fix}`);
    console.log("");
  }
}

if (infoViols.length > 0) {
  console.log(`\nⓘ Info (non-blocking - burn-in phase): ${infoViols.length} case(s)`);
  for (const v of infoViols) {
    const details = getViolationDetails(v);
    const relPath = relative(projectRoot, v.file);
    const codeLine = getFileLine(v.file, v.line).trim();
    console.log(`ⓘ [${v.rule}] [${details.name}]`);
    console.log(`  --> ${relPath}:${v.line}:${v.col ?? 1}`);
    console.log(`  Code: ${codeLine}`);
    console.log(`  Why: ${details.why}`);
    console.log(`  Fix: ${details.fix}`);
    console.log("");
  }
}

if (notes.length) {
  console.log("\nⓘ Info:");
  notes.forEach((m) => console.log("   " + m));
}

if (RUN_TSC) {
  console.log("\n[tsc --noEmit] ...");
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["tsc", "--noEmit"], { cwd: projectRoot, stdio: "inherit", shell: true });
  if (r.status !== 0) { failed = true; console.log("✗ tsc failed"); } else console.log("✓ tsc passed");
}

emitJson({
  selfTest: { ok: true, failures: [] },
  status: failed ? "red" : "green",
  errors, warns, infos: infoViols, notes,
});

console.log("");
if (failed) { console.error("verify: Red (merge blocked until violations are resolved)\n"); process.exit(1); }
console.log("verify: Green\n");
