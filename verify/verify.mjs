#!/usr/bin/env node
/**
 * Spacta verify — 設計論考 I/II の「不変条件をツールで物理強制する」を実装した例。
 *
 * 設計上の要点（なぜ grep ではないか）:
 *   旧 BENCHMARK_PROTOCOL の純度チェックは `grep "Date.now\\|Math.random"` だったため
 *   `new Date()` を**見逃して緑を出した**（ニセの緑）。本スクリプトは TypeScript の
 *   AST を歩いて構文として検出する＝prevent-strong。
 *
 * 掟の正本は SPACTA.md §1、走査対象（どの掟がどのファイルを見るか）の正本は下部の CHECKS レジストリ。
 * ここに一覧を書き写さない: 二重の正本が v0.9.1 のドリフトを生んだ。
 *
 * Comment language boundary: internal comments may be Japanese; every printed string and every CHECKS.promise must be English.
 *
 * 使い方:
 *   node verify.mjs <projectRoot>          # 既定: このスクリプトから見た ../../project
 *   node verify.mjs <projectRoot> --tsc    # 最後に tsc --noEmit も走らせる
 *   node verify.mjs <projectRoot> --json   # 機械可読 JSON（garden が消費）
 *   node verify.mjs --write-docs           # verify/README.md のチェック表を CHECKS から再生成する
 *
 * 終了コード:
 *   0 = Green（err 違反なし。warn/info のみなら 0）
 *   1 = Red（err 違反あり、または L6 自己テスト/配線テスト/役割主張テストの失敗）
 *   2 = INCONCLUSIVE（検証したと言えない状態。「違反が無かった」と区別するため緑を名乗らない）
 *       - 1 ファイルも走査していない
 *       - L6 配線テストの参照コーパス(starter/)が無く、レジストリの glob が未検証
 *       - 走査したファイルの役割を名指しできなかった（何を検査すべきかが分からない）
 */

import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, relative, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES, APP_ROOTS as PLATFORM_APP_ROOTS, classifyPath, platform } from "./platform/nextjs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const positional = process.argv.slice(2).find((a) => !a.startsWith("--"));
const projectRoot = resolve(positional || join(__dirname, "..", "..", "project"));
const RUN_TSC = process.argv.includes("--tsc");
// --json=<path> : 結果を機械可読 JSON で書き出す（garden 等のツール向け）。--json 単独なら stdout。
const jsonFlag = process.argv.find((a) => a === "--json" || a.startsWith("--json="));
const JSON_OUT = jsonFlag ? (jsonFlag.startsWith("--json=") ? resolve(jsonFlag.slice("--json=".length)) : null) : undefined;
// --write-docs : verify/README.md のチェック表を CHECKS から再生成する（保守モード。検査はしない）。
const WRITE_DOCS = process.argv.includes("--write-docs");
// --roles : 役割カバレッジを全文表示する。既定は1行の要約。
// verify の読者は write-run-fix ループを回すエージェントであり、毎回読み直す出力に「変化しない
// 参照表」を置くと、その分だけタスクから attention を奪う。全文が必要になる状況——未分類が出た /
// 表と実装が食い違った——では、フラグ無しでも自動的に全部出す。
const SHOW_ROLES = process.argv.includes("--roles");
const FIXTURES = join(__dirname, "fixtures");
// 名前→役割の表。未分類を申告する時、直す場所として名指しする（メッセージに書き写さない）。
const PLATFORM_TABLE = join(__dirname, "platform", "nextjs.mjs");

// Resolve `typescript` from the target project first (a project placing this script inside
// itself would just `import 'typescript'`). Fall back to the verifier's own dependency so a
// target without node_modules — notably `starter/` — can still be verified. Without this
// fallback the reference implementation cannot be part of the regression corpus.
//
// What comes back is inspected, not merely resolved. A resolver may answer with a stub rather
// than throwing — Bun does, for a target that has no node_modules above it — and the `try`
// then succeeds with an object that is not the compiler. The scan died several hundred lines
// later inside parse() with `ts.ScriptTarget is undefined`: exit 1, a stack trace pointing at
// the verifier, and no statement anywhere of what actually went wrong. "I could not verify"
// has to be said; it must not be crashed into, and it must never be said as Red.
const isCompiler = (m) => !!(m && m.createSourceFile && m.forEachChild && m.ScriptTarget && m.SyntaxKind);
let ts;
for (const pkg of [join(projectRoot, "package.json"), join(__dirname, "..", "package.json")]) {
  try {
    const mod = createRequire(pkg)("typescript");
    if (isCompiler(mod)) { ts = mod; break; }
  } catch { /* not here — try the next location */ }
}
if (!ts) {
  console.error("verify: INCONCLUSIVE — the TypeScript compiler could not be loaded, so nothing was parsed.\n");
  console.error(`  Looked for 'typescript' from the target project (${projectRoot})`);
  console.error(`  and from the verifier itself (${resolve(__dirname, "..")}).`);
  console.error("  Every check here walks the AST, so with no compiler there is no result to report —");
  console.error("  not a green, and not a red either.");
  console.error("  -> install dependencies in either location (npm install / bun install), then re-run.\n");
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
    case "L3":
      name = "Injection (write-path return)";
      why = v.msg;
      fix = "Add an Action that carries the correlationId back (EFFECT_SUCCEEDED / EFFECT_FAILED) and handle it in update(). The Shell turns runEffect's outcome into that Action; Core stays the only writer of state.";
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
    case "L9":
      name = "Presentation Purity";
      why = v.msg;
      if (v.msg.includes("non-deterministic")) {
        fix = "Receive time/ids/random values as props. Presentation never generates them (L3).";
      } else {
        fix = "Declare an Effect from Core and let shared/runEffect execute it. Presentation only renders.";
      }
      break;
    case "L10":
      name = "Component Statelessness";
      why = v.msg;
      fix = "Lift this state into Core (State + Action) and pass it down as props, or hold it in shell.tsx. shared/ui primitives may keep widget-local state; feature components may not.";
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
    case "docs-drift":
      name = "Documentation Drift";
      why = v.msg;
      fix = "Regenerate the table from the registry: node verify/verify.mjs --write-docs. Edit CHECKS in verify.mjs, never the table.";
      break;
    default:
      name = "Unknown Violation";
      why = v.msg;
      fix = "Resolve the violation according to Spacta conventions.";
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

// ───────────────────────── L3 effect-return（書き込み経路の帰り道）─────────────────────────
// L3 の「行き」（時刻・乱数・id を値として注入する）は L2/L5/L9 の純度チェックが守っている。
// 守られていなかったのは「帰り」——runEffect が実行した結果が Core に戻るか——である。
// 答えを必要とする Effect は correlationId を持ち、Shell がその結末を Action に変えて Core へ返す。
// ここで検査するのは**受け皿があるか**だけ。配線そのものは追跡しない（trust boundary に明記）。
//
// なぜ「宣言」ではなく「構築地点」で feature を切るのか:
//   Effect は shared/types.ts の単一のグローバル union であり（L7 がそれを強制する）、
//   「この feature の Effect」は型レベルには存在しない。だが構築地点は存在する——
//   core.ts は effect のオブジェクトリテラルを組み立て、core.ts はちょうど1つの feature に属する。
//
// 誤検出は見逃しより高くつくので、判断できない形（Action が見つからない / union のメンバを
// 解決できない）では黙って何も報告しない。以下はすべて「確信を持って言える時だけ言う」設計。

// オブジェクトリテラルのプロパティ名（{ a, b: 1, "c": 2 }）を集める。スプレッドは名前が無いので無視。
function objectLiteralPropNames(node) {
  const names = new Set();
  for (const p of node.properties) {
    if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
        (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
      names.add(p.name.text);
    }
  }
  return names;
}

// この構築地点を囲む `case "X":`（switch (action.type) のもの）の判別子を返す。
// = 「この Effect を要求したのはどの Action か」。判定できなければ null（＝後段でより緩く判定する）。
function enclosingActionCase(node) {
  let p = node.parent;
  while (p) {
    if (ts.isCaseClause(p)) {
      const sw = p.parent?.parent; // CaseClause → CaseBlock → SwitchStatement
      const expr = sw && ts.isSwitchStatement(sw) ? sw.expression : null;
      const isActionType =
        expr && ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) &&
        /action/i.test(expr.expression.text) && expr.name.text === "type";
      return isActionType && ts.isStringLiteral(p.expression) ? p.expression.text : null;
    }
    p = p.parent;
  }
  return null;
}

// 型リテラル / interface の members から「correlationId を持つか」「type の判別子」を読む。
function readMembers(node) {
  let correlationId = false;
  let discriminant = null;
  for (const m of node.members) {
    if (!ts.isPropertySignature(m) || !m.name) continue;
    const name = ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : null;
    if (name === "correlationId") correlationId = true;
    if (name === "type" && m.type && ts.isLiteralTypeNode(m.type) && ts.isStringLiteral(m.type.literal)) {
      discriminant = m.type.literal.text;
    }
  }
  return { correlationId, discriminant };
}

// union を平坦化してメンバの配列にする。1つでも解決できないメンバがあれば { unknown: true } を混ぜ、
// 呼び出し側はそれを見て報告を取り下げる（＝読めなかったものを違反と呼ばない）。
function flattenActionUnion(typeNode, decls, depth = 0) {
  if (!typeNode || depth > 4) return [{ unknown: true }];
  if (ts.isParenthesizedTypeNode(typeNode)) return flattenActionUnion(typeNode.type, decls, depth + 1);
  if (ts.isUnionTypeNode(typeNode)) return typeNode.types.flatMap((t) => flattenActionUnion(t, decls, depth + 1));
  if (ts.isTypeLiteralNode(typeNode)) return [readMembers(typeNode)];
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const target = decls.get(typeNode.typeName.text);
    if (!target) return [{ unknown: true }];
    return ts.isInterfaceDeclaration(target)
      ? [readMembers(target)]
      : flattenActionUnion(target, decls, depth + 1);
  }
  if (ts.isIntersectionTypeNode(typeNode)) {
    const parts = typeNode.types.flatMap((t) => flattenActionUnion(t, decls, depth + 1));
    if (parts.some((p) => p.unknown)) return [{ unknown: true }];
    return [{
      correlationId: parts.some((p) => p.correlationId),
      discriminant: parts.map((p) => p.discriminant).find(Boolean) ?? null,
    }];
  }
  return [{ unknown: true }];
}

// 型宣言（type alias / interface）を name → node で集める。ここに載らない名前＝この2ファイルからは
// 読めない型なので、候補にもならず、参照されれば unknown になる（＝報告しない）。
// 他モジュールから import / re-export された Action は、そうやって自動的に対象外になる。
function collectTypeDecls(file, text, into) {
  const sf = parse(file, text);
  eachNode(sf, (n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name && !into.has(n.name.text)) into.set(n.name.text, n.type);
    else if (ts.isInterfaceDeclaration(n) && n.name && !into.has(n.name.text)) into.set(n.name.text, n);
  });
}

// coreFile/coreText: feature の core.ts。typesFile/typesText: 同じ feature の types.ts（無ければ null）。
// self-test はこの関数に fixture のテキスト対を直接渡す。
export function checkEffectReturn(coreFile, coreText, typesFile, typesText) {
  const csf = parse(coreFile, coreText);

  // 1) 構築地点: type と correlationId の両方を持つオブジェクトリテラル ＝「答えを要求する Effect」。
  const sites = [];
  eachNode(csf, (n) => {
    if (!ts.isObjectLiteralExpression(n)) return;
    const names = objectLiteralPropNames(n);
    if (!names.has("type") || !names.has("correlationId")) return;
    sites.push({ ...locOf(csf, n), requestedBy: enclosingActionCase(n) });
  });
  if (sites.length === 0) return []; // correlationId を使っていない feature は対象外（opt-in）

  // 2) 受け皿の宣言を読む。types.ts を正とし、core.ts 内の宣言も拾う（Form は可変なので）。
  const decls = new Map();
  if (typesText !== null && typesText !== undefined) collectTypeDecls(typesFile ?? coreFile, typesText, decls);
  collectTypeDecls(coreFile, coreText, decls);

  const names = [...decls.keys()];
  const candidates = names.includes("Action") ? ["Action"] : names.filter((k) => /Action$/.test(k));
  if (candidates.length === 0) return []; // Action 宣言が見当たらない＝読めていない。tsc の領分に任せる

  const members = candidates.flatMap((k) => {
    const d = decls.get(k);
    return ts.isInterfaceDeclaration(d) ? [readMembers(d)] : flattenActionUnion(d, decls);
  });
  if (members.some((m) => m.unknown)) return []; // 解決できないメンバがある＝判断しない

  // 3) 「答えの受け皿」= correlationId を持ち、かつ書き込みを要求した側の Action ではないメンバ。
  //    要求側を除くのは、書き込みを頼む Action 自身が correlationId を運ぶのが常だから
  //    （Shell が採番して渡す）。それを受け皿と数えると、この検査は常に緑になり無意味になる。
  //    要求側の判別子が読めなかった場合は除外集合が空になり、判定は「correlationId を持つ
  //    メンバが1つでもあるか」に緩む＝迷ったら通す。
  const requesters = new Set(sites.map((s) => s.requestedBy).filter(Boolean));
  const receptacles = members.filter((m) => m.correlationId && (m.discriminant === null || !requesters.has(m.discriminant)));
  if (receptacles.length > 0) return [];

  const site = sites[0];
  const carriers = members.filter((m) => m.correlationId).map((m) => m.discriminant).filter(Boolean);
  const listed = carriers.slice(0, 4).map((c) => `'${c}'`).join(", ") + (carriers.length > 4 ? ", …" : "");
  const detail = carriers.length === 0
    ? "no Action member carries a correlationId"
    : `the only Action members carrying a correlationId (${listed}) are the ones requesting the write`;
  return [V(coreFile, site.line, site.col, "L3",
    `Core builds an Effect carrying a correlationId, but ${detail}. The result of that Effect has nowhere to land: ` +
    `declare an Action for the answer (e.g. EFFECT_SUCCEEDED / EFFECT_FAILED with a correlationId) and handle it in update() (L3, outbound half)`)];
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
const isEffectTypeSwitch = (n) =>
  ts.isSwitchStatement(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  ts.isIdentifier(n.expression.expression) &&
  /effect/i.test(n.expression.expression.text) &&
  n.expression.name.text === "type";

/** Does this return type annotation leave room for a function to fall off the end? */
function admitsUndefined(typeNode) {
  let found = false;
  const walk = (n) => {
    if (!n || found) return;
    const k = n.kind;
    if (k === ts.SyntaxKind.UndefinedKeyword || k === ts.SyntaxKind.VoidKeyword ||
        k === ts.SyntaxKind.AnyKeyword || k === ts.SyntaxKind.UnknownKeyword) {
      found = true;
      return;
    }
    n.forEachChild(walk);
  };
  walk(typeNode);
  return found;
}

/**
 * The second way a switch on `effect.type` can be exhaustive, and the only one available to a
 * feature whose Effect has a single member.
 *
 * `assertNever` needs a union of two or more: TypeScript collapses a one-element union, so
 * `const _: never = effect` does not compile when a feature declares exactly one Effect —
 * which feature-local `perform` functions make ordinary. (The old shape never met it: there
 * was one switch in the application and it had thirteen members.)
 *
 * A switch with no `default`, written as the last statement of a function whose declared return
 * type cannot be `undefined`, is checked by tsc instead: add a member the switch does not
 * handle and the function can complete without returning, which is TS2366. The guarantee is
 * the same one — a forgotten Effect is a compile error, not silence — carried by the return
 * type rather than by a `never`.
 *
 * All three conditions are load-bearing. Without "no default", the default swallows. Without
 * "last statement", a `return null` after the switch swallows and TS2366 never fires. Without
 * a return type that excludes `undefined`, falling off the end is legal and TS2366 never
 * fires either. The annotation is read syntactically and conservatively: `undefined`, `void`,
 * `any` or `unknown` appearing anywhere inside it disqualifies the form.
 */
function everyEffectSwitchClosedByReturnType(sf) {
  let switches = 0;
  let closed = 0;
  eachNode(sf, (n) => {
    if (isEffectTypeSwitch(n)) switches += 1;
    const isFn = ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) || ts.isMethodDeclaration(n);
    if (!isFn || !n.body || !ts.isBlock(n.body) || !n.type) return;
    if (admitsUndefined(n.type)) return;
    const last = n.body.statements[n.body.statements.length - 1];
    if (!last || !isEffectTypeSwitch(last)) return;
    if (last.caseBlock.clauses.some((c) => ts.isDefaultClause(c))) return;
    closed += 1;
  });
  return switches > 0 && closed === switches;
}

export function checkEffectRuntime(file, text) {
  const sf = parse(file, text);
  const out = [];
  let hasEffectSwitch = false;
  let switchLoc = { line: 0, col: 0 };
  let hasNever = false; // Evaluated via AST (not fooled by comments containing ": never")
  eachNode(sf, (n) => {
    if (isEffectTypeSwitch(n)) {
      hasEffectSwitch = true;
      switchLoc = locOf(sf, n);
    }
    // never type annotation (e.g. const _exhaustive: never = ...)
    if (n.kind === ts.SyntaxKind.NeverKeyword) hasNever = true;
    // assertNever(...) call
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "assertNever") hasNever = true;
  });
  if (!hasEffectSwitch) return out; // OK if routing through shared runEffect
  if (!hasNever && !everyEffectSwitchClosedByReturnType(sf)) {
    out.push(V(file, switchLoc.line, switchLoc.col, "L4",
      "Handwritten switch on effect.type lacks exhaustiveness termination. Add `assertNever` / a `: never` assignment, or — when the Effect has a single member and `never` cannot be written — make the switch the last statement of a function whose declared return type excludes `undefined`, so tsc reports TS2366 when a member is added."));
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

// ───────────────────────── L9 Presentation Purity ─────────────────────────
// Presentation files (feature components + shared/ui) must not perform IO and must not
// generate non-determinism. Uniform across both tiers — no exception clause.
//
// Deliberately NOT reusing L2's forbidden set: `react` and `next/link` are legitimate
// vocabulary for a presentation file, and applying checkCorePurity here produces 21 false
// positives with 0 true positives on a real codebase (measured on livingdoc).
//
// `window` / `document` are deliberately absent from this list. Wiring DOM events does not
// move data across the membrane, and banning it would make interactive primitives
// (Dialog, Tabs, Combobox) impossible to write in shared/ui.
const PRESENTATION_FORBIDDEN_IMPORT =
  /(^|\/)(prisma|@prisma|.*client-gateway|.*gateway)(\/|$)|^next\/navigation$/i;
const PRESENTATION_FORBIDDEN_GLOBALS = new Set(["fetch", "XMLHttpRequest", "localStorage", "sessionStorage"]);

export function checkPresentationBehaviour(file, text) {
  const sf = parse(file, text);
  const out = [];
  eachNode(sf, (n) => {
    const loc = locOf(sf, n);
    if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) &&
        n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      out.push(V(file, loc.line, loc.col, "L9", "async functions are prohibited in presentation files. Declare an Effect and let runEffect execute it"));
    }
    if (ts.isAwaitExpression(n)) {
      out.push(V(file, loc.line, loc.col, "L9", "await is prohibited in presentation files. Declare an Effect and let runEffect execute it"));
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Date") {
      out.push(V(file, loc.line, loc.col, "L9", "new Date() is non-deterministic. Receive 'now' as a prop (L3)"));
    }
    if (ts.isPropertyAccessExpression(n)) {
      if (ts.isIdentifier(n.expression)) {
        const k = `${n.expression.text}.${n.name.text}`;
        if (k === "Date.now") out.push(V(file, loc.line, loc.col, "L9", "Date.now() is non-deterministic. Receive 'now' as a prop (L3)"));
        if (k === "Math.random") out.push(V(file, loc.line, loc.col, "L9", "Math.random() is non-deterministic. Inject the value (L3)"));
      }
      if (n.name.text === "randomUUID" || n.name.text === "getRandomValues") {
        out.push(V(file, loc.line, loc.col, "L9", `${n.name.text}() is non-deterministic. Ids must be injected, never generated in presentation (L3)`));
      }
    }
    if (ts.isIdentifier(n) && PRESENTATION_FORBIDDEN_GLOBALS.has(n.text)) {
      const parent = n.parent;
      const isPropName = parent && ts.isPropertyAccessExpression(parent) && parent.name === n;
      const isDecl = parent && (ts.isImportSpecifier(parent) || ts.isBindingElement(parent) || ts.isParameter(parent));
      if (!isPropName && !isDecl) {
        out.push(V(file, loc.line, loc.col, "L9", `${n.text} is IO. Prohibited in presentation — route it through an Effect`));
      }
    }
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      if (PRESENTATION_FORBIDDEN_IMPORT.test(spec)) {
        out.push(V(file, loc.line, loc.col, "L9",
          `Import of '${spec}' is prohibited in presentation. Imperative navigation and data access belong in Effects (<Link> is fine)`));
      }
    }
  });
  return out;
}

// ───────────────────────── L10 Component Statelessness ─────────────────────────
// A feature component is a pure function of its props. All state lives in Core.
//
// Scoped to features/*/components/ only. shared/ui primitives legitimately own widget-local
// state (disclosure, focus trap, popover position) — that state is not domain state and it
// never crosses the membrane, so it is out of scope here rather than an exception to a rule.
const COMPONENT_STATE_HOOKS = new Set(["useState", "useReducer", "useEffect", "useLayoutEffect"]);

export function checkComponentStatelessness(file, text) {
  const sf = parse(file, text);
  const out = [];
  eachNode(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const callee = n.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) ? callee.name.text : null;
    if (!name || !COMPONENT_STATE_HOOKS.has(name)) return;
    const loc = locOf(sf, n);
    out.push(V(file, loc.line, loc.col, "L10",
      `${name}() in a feature component. Components are pure functions of their props — move this state or lifecycle into Core (State/Action) or the shell`));
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

// The single registry of "which law scans which files".
//
// Why a table instead of inline globs: the scan, the scanned-count report and the trust
// boundary printed at the end all read this one table. A law's declared scope and the file
// set actually walked therefore cannot drift apart — the recurring failure mode recorded in
// spacta-alpha-evaluation.md as "Loopholes in Law Scope" (a Law's name is broad, its scan is
// narrow, and the gap silently stays "hope").
//
//   roles    : [role]        => scope stated as "the files of these roles". Preferred whenever
//              it is exact: the registry then carries no framework file name at all, and a new
//              convention reaches the law through verify/platform/*.mjs instead of through a
//              regex here. `root`/`match` are not written when `roles` is.
//   root     : (projectRoot) => directory to walk, or an array of directories.
//   match    : (posix path)  => is this file in scope for this check?
//   run      : (file, text)  => violations          [per-file checks]
//   batch    : ([{file,text}]) => violations        [checks that are inherently cross-file]
//   promise  : one line stating what a green run guarantees. null for info-level checks,
//              which are deliberately excluded from the guarantee list.
//
// `roles` は「掟が役割を語る」ための入口である。ただし **綺麗に嵌る所にだけ** 使う:
// L1/L7 の対象は「feature の木」「shared の木」というディレクトリの事実であって役割の集合では
// ない —— 役割 edge は features/*/source と shared/source に、役割 contract は両方の types.ts に
// またがるので、どちらの掟の範囲も役割の和で書けない。L4 は意図的に src/ 全体である。
// 無理に役割で言い換えると、対応表が「同期させ続けねばならない第二の正本」になり、レジストリから
// 名前を追い出した利得をそのまま失う。どれを変換しどれを残したかは verify/README.md に書いてある。

const CHECKS = [
  {
    law: "L1", name: "cross-feature-imports", severity: "err",
    root: (r) => join(r, "src", "features"),
    match: (q) => /\.(ts|tsx)$/.test(q),
    run: (f, text) => {
      const fn = featureNameOf(f);
      return fn ? checkCrossFeatureImport(f, text, fn) : [];
    },
    promise: "No feature imports another feature's internals",
  },
  {
    // Role-driven. Narrower than the previous "any core.ts under src/": a core.ts sitting
    // somewhere the Form does not put one now classifies as another role (or as nothing at
    // all) instead of quietly borrowing L2. That narrowing is safe only because every walked
    // file is now accounted for by the role pass — a file that loses a law becomes visible in
    // the coverage block, or stops the run as unclassified. It could not be made silently.
    law: "L2", name: "core-purity", severity: "err",
    roles: ["core"],
    run: (f, text) => checkCorePurity(f, text),
    promise: "core.ts holds no IO and no non-determinism",
  },
  {
    // Scoped by construction site, not by declaration: `Effect` is one global union in
    // shared/types.ts (L7 forces that), so "this feature's Effect" does not exist at the type
    // level — but a core.ts does, and it belongs to exactly one feature. Needs the sibling
    // types.ts as well, hence batch.
    law: "L3", name: "effect-return", severity: "err",
    roles: ["core"],
    batch: (coreFiles) => coreFiles.flatMap(({ file, text }) => {
      const tf = join(dirname(file), "types.ts");
      const exists = existsSync(tf);
      return checkEffectReturn(file, text, exists ? tf : null, exists ? readFileSync(tf, "utf8") : null);
    }),
    promise: "An Effect that asks for an answer has an Action able to receive it",
  },
  {
    // Scope widened from `shell.tsx` to the whole feature tree. SPACTA.md states L4 without
    // limiting it to shells, and two blind spots followed from the narrower walk:
    // features that have no shell.tsx were never checked at all, and the canonical
    // `shared/runEffect.ts` — the one switch that most needs an exhaustive terminator —
    // was itself unscanned. No false positives can arise: checkEffectRuntime returns early
    // for any file without a switch on `effect.type`.
    //
    // **役割ではなく木で走査する数少ない検査**なので、その木を自分で正しく綴る責任がある。
    // `src` だけを歩いていた頃、同一のコードが `app/` レイアウトで 12 ファイル、`src/app/`
    // レイアウトで 15 ファイル走査され、**保証はどちらでも無条件に印字されていた** ——
    // v0.9.3 で塞いだ欠陥と同じ形が、役割に移らなかった検査の側に残っていた。
    // 役割リストで綴らないのは意図的である: 新しい規約に役割が与えられたとき、リストなら
    // 黙って L4 から外れるが、木なら自動的に入る。ここでは網羅の向きが逆になる。
    law: "L4", name: "effect-runtime", severity: "err",
    root: (r) => [join(r, "src"), ...appRootDirs(r)],
    match: (q) => /\.(ts|tsx)$/.test(q),
    run: (f, text) => checkEffectRuntime(f, text),
    promise: "Every handwritten switch on effect.type terminates exhaustively",
  },
  {
    // The check that made the case for this whole model. Its scope used to be the literal
    // strings `app/` and `/(page|route)\.tsx?$/`, so `src/app/` — a layout Next.js officially
    // supports — walked zero files while the trust boundary still printed L5's promise, and
    // `layout.tsx` was outside every err check even though a layout may legally `await` IO.
    //
    // Stated as roles the scope is one line and it moves with the platform table: `source` is
    // whatever the framework currently calls a server boundary (page, route, default, sitemap,
    // opengraph-image, …), `frame` is the chrome drawn around it (layout, template). Adding
    // `frame` here is not a widening of L5 — the table already claimed L5 for that role; until
    // now the claim was simply false. SPACTA.md still spells L5's scope as "(page.tsx /
    // route.ts)"; that parenthetical is the last enumeration-by-name left in the Law text.
    law: "L5", name: "source-purity", severity: "err",
    roles: ["source", "frame"],
    run: (f, text) => checkSourcePurity(f, text),
    promise: "Server boundaries and the frames around them generate no ids, time or randomness",
  },
  {
    law: "L7", name: "shared-features-isolation", severity: "err",
    root: (r) => join(r, "src", "shared"),
    match: (q) => /\.(ts|tsx)$/.test(q),
    run: (f, text) => checkSharedReverseDependency(f, text),
    promise: "shared/ does not import feature internals",
  },
  {
    // Role-driven as of 0.9.4. Until the platform table gained `boundary`, role `component`
    // also held the app router's error/loading/not-found — where a `useEffect` is idiomatic and
    // where SPACTA.md's src/-worded scope does not reach — so converting would have widened two
    // Laws past their own text and flagged correct code. With those names classified as
    // `boundary`, `component` is exactly src/features/*/components/*.tsx and `shared-ui` is
    // exactly src/shared/ui/*.tsx: the two presentation tiers this law is written for, and
    // nothing else. Measured file-set-identical to the globs it replaces on starter/ and on a
    // real project before the swap.
    //
    // The one deliberate narrowing the role pass brings: a colocated Foo.test.tsx inside
    // components/ classifies as `test`, so presentation checks no longer open it. Neither
    // corpus has one, but a test file is not presentation, and fetch mocks in it are not IO
    // crossing a membrane.
    law: "L9", name: "presentation-behaviour", severity: "err",
    roles: ["component", "shared-ui"],
    run: (f, text) => checkPresentationBehaviour(f, text),
    promise: "Components and shared/ui perform no IO and no non-determinism",
  },
  {
    // Role `component` alone: shared/ui is out of scope by design, not by omission — its
    // widget-local state is not domain state (see the checker's own comment).
    law: "L10", name: "component-statelessness", severity: "err",
    roles: ["component"],
    run: (f, text) => checkComponentStatelessness(f, text),
    promise: "Feature components are pure functions of their props",
  },
  {
    // The surfaces where presentation vocabulary is actually written: the shell and the
    // components under it. That is a union of two roles exactly — `shell` is only ever
    // src/features/*/shell.tsx — so stating it as one costs nothing and keeps the last
    // Form-shaped path out of the registry. `clone` below shares this scope on purpose;
    // leaving one of the two spelled as a glob would recreate the two-copies problem in
    // miniature.
    law: "L8", name: "presentation-purity", severity: "info",
    roles: ["shell", "component"],
    run: (f, text) => checkPresentationPurity(f, text),
    promise: null,
  },
  {
    law: "—", name: "clone", severity: "info",
    roles: ["shell", "component"],
    batch: (files) => checkClones(files),
    promise: null,
  },
  {
    // Not converted to `roles`: role `contract` also holds src/shared/types.ts, and the shared
    // membrane vocabulary is not a feature's sharing budget. The scope stays "a feature's
    // types.ts".
    // The consumer set, though, is exactly "every file Spacta can name" — which is what the
    // role pass already walked, so the app router no longer has to be spelled out here. Pages
    // and routes must be included: they import feature types, and walking src/ alone would
    // report those exports as dead.
    law: "—", name: "export-ownership", severity: "info",
    root: (r) => join(r, "src", "features"),
    match: (q) => /(^|\/)types\.ts$/.test(q),
    batch: (typeFiles) => {
      if (typeFiles.length === 0) return [];
      const srcRoot = join(projectRoot, "src");
      const consumerFiles = classifiedFiles(projectRoot).map((c) => c.file);
      const out = [];
      for (const { file: tf, text } of typeFiles) {
        const consumers = consumerFiles
          .filter((c) => c !== tf)
          .map((c) => ({ file: c, text: readFileSync(c, "utf8") }));
        out.push(...checkDeadExports(tf, text, consumers, srcRoot));
        out.push(...checkSingleOwnerExports(tf, text, consumers, srcRoot));
      }
      return out;
    },
    promise: null,
  },
];

// ───────────────────────── 役割による走査（platform 表の消費側）─────────────────────────
// フレームワークの命名規約は verify/platform/*.mjs にしか書かれていない。ここが引くのは役割だけ。
//
// 走査範囲は src/ と app router の両位置。プロジェクト直下の設定ファイルは対象外にしている:
// 「Spacta が管理するコード」の外周をどこに引くかは表ではなくこの walk の仕事で、外周を広げると
// 未分類の申告が「知らないファイルがある」ではなく「知らない道具がある」で埋まる。
const appRootDirs = (r) => PLATFORM_APP_ROOTS.map((a) => join(r, ...a.split("/")));

const classifiedCache = new Map();
function classifiedFiles(root) {
  if (classifiedCache.has(root)) return classifiedCache.get(root);
  const dirs = [join(root, "src"), ...appRootDirs(root)];
  const files = [...new Set(dirs.flatMap((d) => walkFiles(d, (p) => /\.(ts|tsx)$/.test(p))))].sort();
  const out = files.map((file) => {
    const rel = relative(root, file).replace(/\\/g, "/");
    return { file, rel, role: classifyPath(rel) };
  });
  classifiedCache.set(root, out);
  return out;
}

// root は1本でも配列でもよい。呼び出し側が毎回 Array.isArray を書かなくて済むようここで正規化する。
function rootsOf(c, r) {
  if (c.roles) return [join(r, "src"), ...appRootDirs(r)];
  const v = c.root(r);
  return Array.isArray(v) ? v : [v];
}

// 印字用の「このチェックが見ている範囲」。役割で書かれたチェックはディレクトリではなく役割を名乗る
// ——「app/ を歩いたが 0 件」より「役割 source のファイルが 0 件」の方が、次に何を直すかが分かる。
function scopeOf(c, r) {
  if (c.roles) return c.roles.map((x) => `role ${x}`).join(", ");
  return rootsOf(c, r).map((p) => relative(r, p).replace(/\\/g, "/") || ".").join(", ");
}

function filesOf(c, r) {
  if (c.roles) return classifiedFiles(r).filter((x) => c.roles.includes(x.role)).map((x) => x.file);
  const out = new Set();
  for (const root of rootsOf(c, r)) {
    for (const f of walkFiles(root, (p) => c.match(p.replace(/\\/g, "/")))) out.add(f);
  }
  return [...out];
}

const lawOrder = (a, b) => (Number(a.slice(1)) || 99) - (Number(b.slice(1)) || 99);

// 役割ごとのカバレッジ。ここが載せる「この役割を守っている掟」は **表の主張の写しではなく、
// 本スキャンが実際に歩いたファイル集合からの導出**である。写しにした瞬間これは第二の正本になる。
//
// 掲載するのは「その役割の **全** ファイルを歩いた掟」だけ。一部にしか届いていない掟を
// enforcing と呼ぶのは、この版が消しに来た嘘そのもの（L5 が app/ だけを見て「保証」と印字した）。
// 表が主張しているのに全ファイルに届かなかった掟は shortfall として別に申告する。
function roleCoverage(root, perCheck) {
  const classified = classifiedFiles(root);
  const lawsByFile = new Map(classified.map((c) => [c.file, new Set()]));
  for (const { law, files } of perCheck) {
    if (law === "—") continue; // info-only heuristics are not laws; they never appear as enforcement
    for (const f of files) lawsByFile.get(f)?.add(law);
  }

  const roles = [];
  for (const role of Object.keys(ROLES)) {
    const files = classified.filter((c) => c.role === role);
    if (files.length === 0) continue; // 0 files = nothing to say; not a hole
    const count = new Map();
    for (const f of files) for (const l of lawsByFile.get(f.file)) count.set(l, (count.get(l) ?? 0) + 1);
    const laws = [...count].filter(([, n]) => n === files.length).map(([l]) => l).sort(lawOrder);
    // 一つの役割が二か所に住んでいて片方にしか掟が届いていない状態（app/error.tsx と
    // src/features/*/components/ が同じ component になる、等）。全ファイルに届いた掟が
    // 一つも無い時だけ表に出す: そうしないと「掟ゼロ」と読めてしまい、これも一種の嘘になる。
    const partial = [...count].filter(([, n]) => n < files.length)
      .sort((a, b) => lawOrder(a[0], b[0])).map(([l, n]) => `${l}(${n}/${files.length})`);
    const shortfall = (ROLES[role].laws ?? []).filter((l) => !laws.includes(l));
    roles.push({
      role, count: files.length, laws, partial, shortfall,
      missedFiles: files.filter((f) => shortfall.some((l) => !lawsByFile.get(f.file).has(l))).map((f) => f.rel),
      unchecked: ROLES[role].unchecked ?? null,
    });
  }
  return { roles, unknown: classified.filter((c) => c.role === null).map((c) => c.rel), total: classified.length };
}

// ───────────────────────── 段位（Tiers）── どこまで採用したかの申告 ─────────────────────────
// verify は Spacta の深い部分（Effect の往復）を採用していない機能に対しても緑を出す。往復を
// 持たない機能に L3 の outbound が発火しないのは設計どおりだが、**緑がそれを黙っている**なら、
// 部分的に採用した利用者が受け取るのは「動いていない安心」である。それは穴より悪い。
//
//   T0  core.ts が無い（page.tsx → components/ だけ）              … L9 / L10 だけ
//   T1  + core.ts がある（純粋。InitData を受けるかは問わない）      … + L2 / L3(inbound)
//   T2  + shell.tsx があり Effect を宣言する（core は InitData を受ける）… + L1 / L4
//   T3  + 往復（Effect が識別子を運び、core が outcome を処理する）  … + L3(outbound)
//   T?  shell はあるのに状態機械が読めない（＝採点できなかった。黙って段位を与えない）
//
// **T1 が InitData を要求しないのは v0.11 の訂正である。** 読み取り専用の画面は状態機械を
// 必要とせず、その core.ts は純関数だけを持つ。それを T? に落としていたのは梯子の穴であって
// 実装の誤りではなかった（測定 t1 の `tracetype`）。詳細は judgeTier のコメント。
//
// **段位は Law ではない。** CHECKS に載せないのは意図的である —— 載せれば promise を持って
// 「Guaranteed by this green」に並ぶが、段位は保証ではなく **保証の範囲の申告** だからである。
// 同じ理由で **exit code には一切触れない。** T1 / T2 は正当な状態であり、往復を必要としない
// 機能に往復を強制することは判断基準2（潔癖症にならない）に反し、利用者に無視リストへ手を
// 伸ばす訓練をさせる。口に出すのが解決であって、走るのを拒むことではない。
//
// 変更① 以降、**すべての機能の core.ts が outcome の case を持つ**（エンジンが無条件に dispatch
// し、tsc の網羅性がそれを強制する）。したがって T2 と T3 を分けるのは case の有無ではなく、
// **その機能自身の Effect が識別子を運ぶか** である。運ばない Effect（`SAVE_MATERIAL_REQUEST` /
// `MODERATE`）は「答えが来ても、どの書き込みの答えか名指しできない」——それが往復の不在である。
const OUTCOME_ACTIONS = ["EFFECT_SUCCEEDED", "EFFECT_FAILED"];

// `[State, Effect[]]` のような戻り値注釈の中に Effect の配列があるか。型解決はしない: この
// 判定に必要なのは「この core が Effect を出す口を持つと宣言しているか」だけである。
function mentionsEffectArray(typeNode, depth = 0) {
  if (!typeNode || depth > 4) return false;
  const isEffectRef = (t) => t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && /Effect$/.test(t.typeName.text);
  if (ts.isParenthesizedTypeNode(typeNode)) return mentionsEffectArray(typeNode.type, depth + 1);
  if (ts.isTupleTypeNode(typeNode)) return typeNode.elements.some((t) => mentionsEffectArray(t, depth + 1));
  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) return typeNode.types.some((t) => mentionsEffectArray(t, depth + 1));
  if (ts.isArrayTypeNode(typeNode)) return isEffectRef(typeNode.elementType);
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName) && /^(Array|ReadonlyArray)$/.test(typeNode.typeName.text)) {
    return isEffectRef(typeNode.typeArguments?.[0]);
  }
  return false;
}

// Effect の構築地点。**位置で決める**: Core が返すタプル `[state, [ …effects… ]]` の第2要素の
// 直下にあるオブジェクトリテラルだけを Effect と呼ぶ。
// 「`type` を持つオブジェクトリテラル」を広く拾わないのは、Effect ではない別物を Effect と
// 数えないためである —— pageview の `pending: [{ correlationId, kind, tempId }]` が実例で、
// あれを構築地点と数えると「識別子を運んでいる」が常に真になり、T2/T3 の区別が消える。
function effectSitesIn(sf) {
  const sites = [];
  const fromTuple = (expr) => {
    if (!expr || !ts.isArrayLiteralExpression(expr) || expr.elements.length !== 2) return;
    const list = expr.elements[1];
    if (!ts.isArrayLiteralExpression(list)) return;
    for (const el of list.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const names = objectLiteralPropNames(el);
      if (!names.has("type")) continue;
      sites.push({ ...locOf(sf, el), correlationId: names.has("correlationId") });
    }
  };
  eachNode(sf, (n) => {
    if (ts.isReturnStatement(n)) fromTuple(n.expression);
    else if (ts.isArrowFunction(n)) fromTuple(n.body); // 式本体の `(s, a) => [s, []]`
  });
  return sites;
}

// core.ts から段位判定に使う事実だけを読む。**型参照を解決しない**のは意図的である:
// flattenActionUnion は解決できない型参照に出会うと `{unknown:true}` を返し、L3 はそこで
// 静かに空虚になった（緑のまま N ファイル走査を印字する）。ここで読むのは同じファイルの中に
// 構文として在るもの——引数の型注釈、戻り値の型注釈、case の判別子、構築地点——だけなので、
// 「解決できなかった」という状態が存在しない。読めなかったことは judgeTier が T? として印字する。
export function readCoreFacts(coreFile, coreText) {
  const sf = parse(coreFile, coreText);
  let initData = false;
  let effectReturn = false;
  const handled = new Set();
  eachNode(sf, (n) => {
    if (ts.isParameter(n) && n.type && ts.isTypeReferenceNode(n.type) && ts.isIdentifier(n.type.typeName) &&
        /InitData$/.test(n.type.typeName.text)) initData = true;
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) &&
        mentionsEffectArray(n.type)) effectReturn = true;
    // `switch (action.type)` の case 判別子だけを拾う。判定は既存の enclosingActionCase に
    // 委ねる（`switch (command.command)` 等を Action の case と数えないのはその関数の仕事）。
    if (ts.isCaseClause(n)) {
      const d = enclosingActionCase(n.expression);
      if (d) handled.add(d);
    }
  });
  return { initData, effectReturn, effectSites: effectSitesIn(sf), handled: [...handled] };
}

// 梯子を上から順に降りる。**満たした一番上の段**がその機能の段位である。
// 段位を推測しない: 読めなかったときは T? と理由を返し、印字側がそれを見せる。
export function judgeTier(f) {
  if (!f.hasCore) return { tier: "T0", why: "no core.ts — page and components only" };
  const c = f.core;
  if (!c) return { tier: "T?", why: "core.ts could not be read" };
  // 1段目は「core.ts があり、L2 がそれを走査している」であって「InitData を受ける」ではない。
  // 読み取り専用の画面は状態機械を必要とせず、その core.ts は型のパースやラベル付けのような
  // 純関数だけを持つ。掟には一切反していないのに、以前はこの検査が shell の検査より先に
  // 立っていたため T? に落ちた —— 測定 t1 の `tracetype` が実例で、**梯子側の穴であって
  // 実装の誤りではなかった**。L3 の inbound を施行しているのは L2 / L9 であり、InitData を
  // 持たない core にも L2 は等しく届く。持たないのは検査されていないからではなく、
  // 注入すべき値が無いからである。
  //
  // InitData を要求するのは shell を持つ機能に対してだけにする。shell があるということは
  // 状態と Effect があるということで、そこで状態機械が読めないなら、それは本当に採点でき
  // ていない —— T? はその場合のために残す。
  if (!f.hasShell) {
    return c.initData
      ? { tier: "T1", why: "no shell.tsx — a state machine fed by InitData that declares no Effect" }
      : { tier: "T1", why: "no shell.tsx and no *InitData parameter — core.ts holds pure helpers, which L2 covers all the same" };
  }
  if (!c.initData) {
    return { tier: "T?", why: "has a shell.tsx, but core.ts takes no parameter typed *InitData, so the inbound half of L3 cannot be read off it" };
  }
  if (!c.effectReturn && c.effectSites.length === 0) {
    return { tier: "T1", why: "has a shell, but core.ts neither declares nor builds an Effect" };
  }
  if (c.effectSites.length === 0) {
    return { tier: "T2", unsure: true, why: "core.ts declares Effect[] but no construction site could be read, so the round trip could not be judged — T2 is the floor, not a finding" };
  }
  if (!c.effectSites.some((s) => s.correlationId)) {
    return { tier: "T2", why: "this feature's Effects carry no correlationId, so an answer cannot name the write it belongs to" };
  }
  const missing = OUTCOME_ACTIONS.filter((a) => !c.handled.includes(a));
  if (missing.length > 0) {
    return { tier: "T2", why: `Effects carry a correlationId but core.ts writes no ${missing.join(" / ")} case` };
  }
  return { tier: "T3", why: "Effects carry a correlationId and core.ts handles both outcomes" };
}

// 機能の列挙は **役割パスから** 引く。ディレクトリ名の綴りをここに増やさない（§6.1）:
// core / shell が何という名前のファイルかを知っているのは verify/platform/*.mjs だけである。
// 役割が引けなかったファイルは走行を INCONCLUSIVE にするので、段位が黙って取りこぼす道はない。
function tierScan(root) {
  const byFeature = new Map();
  for (const c of classifiedFiles(root)) {
    const name = featureNameOf(c.file);
    if (!name) continue;
    const g = byFeature.get(name) ?? { name, hasCore: false, hasShell: false, core: null, coreLines: 0 };
    if (c.role === "core" && !g.hasCore) {
      const text = readFileSync(c.file, "utf8");
      g.hasCore = true;
      g.core = readCoreFacts(c.file, text);
      g.coreLines = text.split(/\r?\n/).length;
    }
    if (c.role === "shell") g.hasShell = true;
    byFeature.set(name, g);
  }
  const rank = (t) => (t === "T?" ? -1 : Number(t.slice(1)));
  // 段位の降順、同じ段では大きい機械から。読み手の attention は「深く採用しているもの」と
  // 「部分的なままの一番大きな機能」に先に向くべきである。名前順は最後の同値解消にだけ使う。
  return [...byFeature.values()]
    .map((g) => ({ name: g.name, coreLines: g.coreLines, ...judgeTier(g) }))
    .sort((a, b) => rank(b.tier) - rank(a.tier) || b.coreLines - a.coreLines || a.name.localeCompare(b.name));
}

function runMainScan() {
  const violations = [];
  const report = [];
  const perCheck = [];
  const seen = new Set(); // distinct files any check actually looked at

  for (const c of CHECKS) {
    const files = filesOf(c, projectRoot);
    for (const f of files) seen.add(f);
    perCheck.push({ law: c.law, files });

    const found = c.batch
      ? c.batch(files.map((f) => ({ file: f, text: readFileSync(f, "utf8") })))
      : files.flatMap((f) => c.run(f, readFileSync(f, "utf8")));

    violations.push(...found);
    report.push({
      law: c.law, name: c.name, severity: c.severity, promise: c.promise,
      scope: scopeOf(c, projectRoot),
      scanned: files.length, found: found.length,
    });
  }

  return {
    violations, report, scannedTotal: seen.size,
    coverage: roleCoverage(projectRoot, perCheck),
    tiers: tierScan(projectRoot),
  };
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

// ───────────────────────── README のチェック表（CHECKS からの生成物）─────────────────────────
// v0.9.1 で README の表が実装からずれた。原因は「手書きの写し」という形そのものなので、
// 表を CHECKS からの生成物にし、ずれていたら通常の verify が err で落ちるようにする。
// 生成できるだけでは足りない: ずれた表をコミットしても緑になれるなら、正本は再び2つになる。
const README_PATH = join(__dirname, "README.md");
const CHECKS_BEGIN = "<!-- checks:begin -->";
const CHECKS_END = "<!-- checks:end -->";

// match は関数なので、そのソースから正規表現リテラルを取り出して表に載せる。
// 文字クラス内の `/`（[^/]+ など）で切れないよう、素朴な走査で括弧とエスケープを見る。
function extractRegexLiterals(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] !== "/") { i++; continue; }
    let j = i + 1, inClass = false, closed = false;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "\\") { j++; continue; }
      if (ch === "\n") break;
      if (inClass) { if (ch === "]") inClass = false; continue; }
      if (ch === "[") { inClass = true; continue; }
      if (ch === "/") { closed = true; break; }
    }
    if (!closed) { i++; continue; }
    let k = j + 1;
    while (k < src.length && /[gimsuy]/.test(src[k])) k++;
    out.push(src.slice(i, k));
    i = k;
  }
  return out;
}

function renderChecksTable() {
  const cell = (s) => String(s).replace(/\|/g, "\\|"); // GFM: code span の中でも | は要エスケープ
  const rows = CHECKS.map((c) => {
    const roots = c.roles ? "(role pass)" : rootsOf(c, "").map((p) => `\`${cell(p.replace(/\\/g, "/"))}/\``).join(", ");
    // A role-driven check has no `match` regex to show: its scope *is* the role name, and the
    // names that resolve to it live in verify/platform/nextjs.mjs. Printing the roots it
    // happens to walk would put the framework name back into the document.
    const patterns = c.roles ? [] : extractRegexLiterals(c.match.toString());
    const match = c.roles
      ? c.roles.map((x) => `role \`${cell(x)}\``).join(" or ")
      : patterns.length ? patterns.map((p) => `\`${cell(p)}\``).join(" or ") : "—";
    const kind = c.batch ? "batch" : "per file";
    return `| ${c.law} | \`${c.name}\` | ${c.severity} | ${roots} | ${match} | ${c.promise ? cell(c.promise) : "—"} | ${kind} |`;
  });
  return [
    "<!-- Generated from the CHECKS registry in verify.mjs by `node verify/verify.mjs --write-docs`.",
    "     Do not edit by hand: a normal verify run reports an err when this block and CHECKS disagree. -->",
    "",
    "| Law | Check | Severity | Walks | Matches | Guarantee on green | Kind |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function readChecksBlock() {
  if (!existsSync(README_PATH)) return { missing: true };
  const text = readFileSync(README_PATH, "utf8");
  const b = text.indexOf(CHECKS_BEGIN);
  const e = text.indexOf(CHECKS_END);
  if (b < 0 || e < 0 || e < b) return { text, noMarkers: true };
  return { text, b, e, inner: text.slice(b + CHECKS_BEGIN.length, e), line: text.slice(0, b).split(/\r?\n/).length };
}

function writeChecksTable() {
  const blk = readChecksBlock();
  if (blk.missing) return { ok: false, message: `--write-docs: no README to write at ${README_PATH}` };
  if (blk.noMarkers) return { ok: false, message: `--write-docs: ${README_PATH} has no ${CHECKS_BEGIN} … ${CHECKS_END} block` };
  const next = blk.text.slice(0, blk.b + CHECKS_BEGIN.length) + "\n" + renderChecksTable() + "\n" + blk.text.slice(blk.e);
  if (next === blk.text) return { ok: true, message: `--write-docs: check table already up to date (${CHECKS.length} entries)` };
  writeFileSync(README_PATH, next);
  return { ok: true, message: `--write-docs: wrote the check table (${CHECKS.length} entries) into ${README_PATH}` };
}

function checkChecksTableDrift() {
  const blk = readChecksBlock();
  if (blk.missing) {
    // README ごと持ち出された verify.mjs 単体コピーを赤にはしない。ただし黙りもしない。
    return { violations: [], note: `check table drift not verified: no README at ${README_PATH}` };
  }
  if (blk.noMarkers) {
    return { violations: [V(README_PATH, 1, 1, "docs-drift",
      `verify/README.md has no ${CHECKS_BEGIN} … ${CHECKS_END} block, so the check table can no longer be generated from CHECKS. Restore the markers and run: node verify/verify.mjs --write-docs`)] };
  }
  if (blk.inner.trim() !== renderChecksTable().trim()) {
    return { violations: [V(README_PATH, blk.line, 1, "docs-drift",
      "The check table in verify/README.md no longer matches the CHECKS registry. The table is a generated artifact, not a hand-written copy: run `node verify/verify.mjs --write-docs`")] };
  }
  return { violations: [] };
}

// ───────────────────────── L6 self-test (Verifier Self-Verification) ─────────────────────────
// 走査対象の「配線」を検証する参照コーパス。検証器と同梱の starter を使う。
//
// 2箇所を見るのは、verify/ をプロジェクトの中に持ち込んだ場合の置き場が違うからである。
// この配布物では starter/ は verify/ の隣（利用者に見せるテンプレートでもあるため）だが、
// 検証器だけをコピーして使うプロジェクトでは、利用者の src/ の隣に見慣れないテンプレートを
// 並べるより verify/ の内側に同梱する方が正しい。**どちらでも見つかることが要点で、
// 見つからなければ INCONCLUSIVE である**（無ければ黙って skip、では配線テストを
// ディレクトリ1つ消すだけで外せてしまう）。
const CORPUS_CANDIDATES = [join(__dirname, "..", "starter"), join(__dirname, "starter")];
const CORPUS = CORPUS_CANDIDATES.find((p) => existsSync(p)) ?? CORPUS_CANDIDATES[0];

// L6 の第2部: レジストリの glob が実際にファイルを選べているかを証明する。
//
// runSelfTest が検証するのはチェッカ**関数**である。fixture のテキストを関数に直接渡すため、
// CHECKS の root / match（= どのファイルを渡すか）を一切通らない。したがって glob を書き
// 間違えて 0 ファイルしか選ばなくても、自己テストは緑のまま通り、違反 0 件なので本スキャンも
// 緑になる。これは「空スキャン Green」の一段下の再発である —— 全体で 80 ファイル走査していても、
// ある掟だけが 0 ファイルなら、その掟は存在しないのと同じで、しかも誰にも分からない。
//
// ここではチェッカを1つも実行しない。**ファイル選択だけ**が検査対象である。
// 判定は `> 0` であり、調整された閾値ではない。主張は「この glob が何かに繋がっている」のみ。
function runWiringTest() {
  if (!existsSync(CORPUS)) return null; // 呼び出し側が skip を必ず申告する（黙って通すのが穴そのもの）
  return CHECKS.map((c) => ({
    law: c.law,
    name: c.name,
    scope: scopeOf(c, CORPUS),
    scanned: filesOf(c, CORPUS).length,
  })).filter((r) => r.scanned === 0);
}

// L6 の第3部: 名前→役割の表そのものを参照コーパスに当てる。配線テストが「glob が何かに繋がって
// いるか」を測るのに対し、こちらは「表の主張が本当か」を測る。
//
//   (a) コーパスの全ファイルが役割を引ける  = walk と分類器が実際に噛み合っている
//   (b) 表が「この役割はこの掟が守る」と言うなら、その掟が実際に当該ファイルを歩いている
//
// (b) が無ければ ROLES.laws は印字されるだけの願いになる。v0.9.3 の frame/L5 がまさにそれで、
// 表は L5 を主張し、L5 は layout.tsx を一度も開いていなかった。ユーザのツリーではなく starter/
// に対して測る: 表と CHECKS の食い違いは検証器側の欠陥であって、利用者のコードの問題ではない。
function runRoleClaimTest() {
  if (!existsSync(CORPUS)) return null; // 呼び出し側が配線テストと同じく INCONCLUSIVE を申告する
  const cov = roleCoverage(CORPUS, CHECKS.map((c) => ({ law: c.law, files: filesOf(c, CORPUS) })));
  return {
    unknown: cov.unknown,
    overclaimed: cov.roles.filter((r) => r.shortfall.length)
      .map((r) => ({ role: r.role, missing: r.shortfall, files: r.missedFiles })),
    rolesSeen: cov.roles.map((r) => r.role),
  };
}

// 分類器の自己テスト。入力がパス文字列なので、fixture は **パスそのもの** である
// （空ファイルを fixtures/ に置くと、リテラルと実ファイルという2つの正本ができるだけ）。
// 効いているのは2組: 既知の規約が期待どおりの役割を引くこと、そして **でっち上げた名前が
// null を返すこと** ——後者が無いと、未分類の申告が「決して起きない機能」になりうる。
const CLASSIFIER_CASES = [
  ["app/page.tsx", "source", "the app router at app/"],
  ["src/app/page.tsx", "source", "the same convention at src/app/ (the v0.9.3 hole)"],
  ["app/api/things/route.ts", "source", "a nested route handler"],
  ["app/layout.tsx", "frame", "a layout is a frame, not a page"],
  ["src/app/(marketing)/layout.tsx", "frame", "route groups do not change the role"],
  ["app/m/[id]/page.tsx", "source", "dynamic segments do not change the role"],
  // The name that unblocked L9/L10. It must not resolve to `component`: L9/L10 now walk that
  // role, and SPACTA.md scopes both to src/ by path, so a drift back here would silently apply
  // two Laws to app-router error boundaries — where hooks are the framework's own idiom.
  ["app/error.tsx", "boundary", "an app-router UI boundary is not a feature component"],
  ["src/features/x/core.ts", "core", "Spacta owns this name"],
  ["src/features/x/types.ts", "contract", "membrane vocabulary"],
  ["src/features/x/shell.tsx", "shell", "client edge"],
  ["src/features/x/components/Y.tsx", "component", "feature presentation"],
  ["src/shared/ui/Button.tsx", "shared-ui", "presentation primitive"],
  ["src/shared/runEffect.ts", "runtime", "the one place an Effect becomes IO"],
  ["src/shared/source/db.ts", "edge", "designated entry point for the world"],
  ["next.config.ts", "ignored", "declared out of scope, not unknown"],
  // 未知の申告が「決して起きない機能」になっていないことの証明。**予約名を使う**のが要点:
  // 未分類が出た時に verify が勧める直し方は「その名前に役割を与えよ」なので、実在しうる名前で
  // これを書くと、勧めどおりに直した瞬間 L6 が落ちる ——「自己テストがユーザの表を縛る」という
  // 逆立ちが起きる。この2つの名前だけは、どのプロジェクトも役割を与えてはならない。
  ["app/__spacta_self_test_unknown__.tsx", null, "an invented convention is announced, never guessed at"],
  // ただし「専用の役割が無い」と「どこにいるか分からない」は別である。feature の中にいると
  // 分かっているファイルは未知ではない —— 弱い役割として申告できる。INCONCLUSIVE を前者にも
  // 使うと、コロケートしたテスト1つで走行が止まり、利用者は IGNORED に手を伸ばす訓練を受ける。
  ["src/features/x/labels.ts", "feature-internal", "an ordinary file inside a feature is weakly governed, not unknown"],
  ["src/lib/utils.ts", "unscoped", "a file outside the Form's layers is declared, not fatal"],
  ["src/features/x/core.test.ts", "test", "colocated tests must never block a run"],
  // 掟を間違えて当てるのは、当てないより悪い。app router の規約名は app router の中にしか
  // 存在しない: src/ に同名のファイルがあっても source ではないし、L5 を浴びる筋合いもない。
  ["src/features/x/route.ts", "feature-internal", "an app-router name inside src/ is a domain file, not a boundary"],
];

function runClassifierSelfTest() {
  const failures = [];
  for (const [path, expect, label] of CLASSIFIER_CASES) {
    const got = classifyPath(path);
    if (got !== expect) {
      failures.push(`self-test failed: classifier — ${label}\n    expected: ${path} -> ${JSON.stringify(expect)}` +
        `\n    got:      ${path} -> ${JSON.stringify(got)}`);
    }
  }
  // 期待値に使った役割が表に実在すること。ROLES から役割が消えたのにケースが残っている、
  // という静かな腐り方を塞ぐ（分類器は文字列を返すだけなので、綴り間違いも同じ穴になる）。
  for (const [, expect] of CLASSIFIER_CASES) {
    if (expect !== null && !ROLES[expect]) failures.push(`self-test failed: classifier expects role '${expect}', which ${PLATFORM_TABLE} does not define`);
  }
  return failures;
}

// 段位判定の自己テスト。**印字するだけの判定は、間違っていることを捕まえられなければ無価値
// である。** 挟み方は2段構えで、どちらか片方では抜ける:
//
//   (a) 検体テキストに対して段位が **区別できる**。T2 の検体が T3 と報告されたら落ちる。
//       これが無いと「常に T3 を返す判定」が通る。
//   (b) 参照コーパスに対して、**実際の役割パスを通って** 1件以上の機能が採点でき、最上段に届く。
//       これが無いと L6 の旧穴と同型になる —— 純関数だけをテストしていた頃、CHECKS の glob は
//       一度も通らず、0ファイル走査でも自己テストは緑だった。判定は `> 0` であり閾値ではない。
//
// 段位そのものは exit code に影響しないが、**この自己テストは L6 なので落ちれば exit 1 である。**
// 段位が壊れていることは利用者のコードの問題ではなく検証器の故障である。
function runTierSelfTest(F, read) {
  const facts = (name) => readCoreFacts(F(name), read(name));
  const tierOf = (core, hasShell) => judgeTier({ hasCore: core !== null, hasShell, core }).tier;
  const t3 = facts("tier-t3.core.ts");

  const cases = [
    { got: () => tierOf(t3, true), expect: "T3",
      label: "tiers: a closed round trip (identified Effects + both outcome cases) is T3" },
    // 嘘の緑が戻ってくる道。livingdoc の moderation / materialrequest がまさにこの形である。
    { got: () => tierOf(facts("tier-t2.core.ts"), true), expect: "T2",
      label: "tiers: Effects that carry no correlationId are T2 and must never be reported T3" },
    // 検体ファイルを増やさずに事実だけを削る。判定が handled を本当に読んでいるかの検算。
    { got: () => judgeTier({ hasCore: true, hasShell: true, core: { ...t3, handled: ["EFFECT_SUCCEEDED"] } }).tier,
      expect: "T2", label: "tiers: only half the round trip handled (no EFFECT_FAILED case) is not T3" },
    { got: () => tierOf(t3, false), expect: "T1",
      label: "tiers: without a shell the same core is T1 — a core alone declares no Effect" },
    { got: () => tierOf(facts("good.core.ts"), false), expect: "T1",
      label: "tiers: a pure state machine fed by InitData, with no Effects, is T1" },
    // v0.11 の訂正を固定する。測定 t1 の `tracetype` の形 —— 読み取り専用の画面で、core.ts は
    // 型のパースとラベルという純関数だけを持ち、update も InitData も無い。掟には反していない
    // ので、T0（core.ts が無い）でも T? でもなく T1 でなければならない。この行が落ちたら
    // 梯子の穴が戻っている。
    { got: () => judgeTier({ hasCore: true, hasShell: false,
        core: { initData: false, effectReturn: false, effectSites: [], handled: [] } }).tier,
      expect: "T1",
      label: "tiers: a read-only feature whose core.ts holds pure helpers — no InitData, no shell — is T1, not T?" },
    // その裏。**shell があるのに InitData が読めない**ときだけ T? に落ちること。片方だけだと
    // 「T? を廃止した」と「T? を正しく狭めた」が区別できない。
    { got: () => tierOf(facts("tier-ungraded.core.ts"), false), expect: "T1",
      label: "tiers: the ungraded specimen without a shell is T1 — the missing InitData only matters once a shell exists" },
    { got: () => tierOf(null, false), expect: "T0",
      label: "tiers: a feature with no core.ts is T0" },
    // 「読めなかった」が段位を名乗らないこと。L3 が unknown なメンバ1つで静かに空虚になった
    // 穴と同型なので、ここは沈黙ではなく T? として印字されなければならない。
    { got: () => tierOf(facts("tier-ungraded.core.ts"), true), expect: "T?",
      label: "tiers: a core the ladder cannot grade is announced as T?, never given a tier" },
  ];

  const failures = [];
  for (const c of cases) {
    const got = c.got();
    if (got !== c.expect) failures.push(`self-test failed: ${c.label}\n    expected: ${c.expect}\n    got:      ${got}`);
  }

  // (b) 参照コーパスに対する実走。CORPUS が無いときは黙って通す —— 直後の配線テストが
  // 同じ理由で INCONCLUSIVE を出すので、緑まで走れる道はここにも無い。
  if (existsSync(CORPUS)) {
    const tiers = tierScan(CORPUS);
    if (tiers.length === 0) {
      failures.push("self-test failed: tiers — 0 features were graded in the reference corpus, so the tier pass " +
        `is wired to nothing (${CORPUS})`);
    }
    const ungraded = tiers.filter((t) => t.tier === "T?");
    if (ungraded.length > 0) {
      failures.push(`self-test failed: tiers — the reference corpus holds ${ungraded.length} feature(s) the ladder ` +
        `could not grade: ${ungraded.map((t) => `${t.name} (${t.why})`).join("; ")}`);
    }
    if (tiers.length > 0 && !tiers.some((t) => t.tier === "T3")) {
      failures.push("self-test failed: tiers — no feature in the reference corpus reaches T3, so the top rung is " +
        "unreachable through the real role pass. A ladder whose top rung nothing climbs cannot be caught getting it wrong.");
    }
  }
  return failures;
}

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
    // L3: the write path's return leg. The planted violation is *partial adoption* — the
    // Effect asks for an answer, the Action union has no member able to receive one.
    {
      exec: () => checkEffectReturn(F("bad-effect-return.core.ts"), read("bad-effect-return.core.ts"),
        F("bad-effect-return.types.ts"), read("bad-effect-return.types.ts")),
      expect: [
        { rule: "L3", line: 14 }
      ],
      label: "L3 rejects an Effect carrying a correlationId with no Action to receive the answer"
    },
    {
      exec: () => checkEffectReturn(F("bad-effect-return.core.ts"), read("bad-effect-return.core.ts"),
        F("good-effect-return.types.ts"), read("good-effect-return.types.ts")),
      expect: [],
      label: "L3 does not trigger false positives when the return path is declared"
    },
    {
      // Opt-in by construction: no correlationId anywhere in Core means nothing to return.
      exec: () => checkEffectReturn(F("no-correlation.core.ts"), read("no-correlation.core.ts"),
        F("bad-effect-return.types.ts"), read("bad-effect-return.types.ts")),
      expect: [],
      label: "L3 stays silent on a feature that never adopts correlationId"
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
    // The second termination form, and the three conditions that make it a guarantee rather
    // than a loophole. Each bad specimen removes exactly one of them; if any of these three
    // starts passing, the form has become a way to write a switch nothing checks.
    {
      exec: () => checkEffectRuntime(F("good-perform-single.ts"), read("good-perform-single.ts")),
      expect: [],
      label: "L4 accepts a default-less switch that is the last statement of a function returning no undefined"
    },
    {
      exec: () => checkEffectRuntime(F("bad-perform-fallthrough.ts"), read("bad-perform-fallthrough.ts")),
      expect: [
        { rule: "L4", line: 12 }
      ],
      label: "L4 still rejects it when a statement follows the switch — TS2366 can never fire there"
    },
    {
      exec: () => checkEffectRuntime(F("bad-perform-untyped.ts"), read("bad-perform-untyped.ts")),
      expect: [
        { rule: "L4", line: 11 }
      ],
      label: "L4 still rejects it without a return type annotation — the inferred one admits undefined"
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
    // L9: rejects IO/non-determinism in presentation / does not flag react + next/link
    {
      exec: () => checkPresentationBehaviour(F("bad-presentation-io.component.tsx"), read("bad-presentation-io.component.tsx")),
      expect: [
        { rule: "L9", line: 4 },
        { rule: "L9", line: 6 },
        { rule: "L9", line: 7 },
        { rule: "L9", line: 7 },
        { rule: "L9", line: 8 },
        { rule: "L9", line: 9 },
        { rule: "L9", line: 10 },
        { rule: "L9", line: 11 }
      ],
      label: "L9 rejects IO and non-determinism in a presentation file"
    },
    {
      exec: () => checkPresentationBehaviour(F("good-presentation-io.component.tsx"), read("good-presentation-io.component.tsx")),
      expect: [],
      label: "L9 does not flag react type imports or next/link"
    },
    // L10: rejects state/lifecycle hooks in feature components
    {
      exec: () => checkComponentStatelessness(F("bad-component-state.component.tsx"), read("bad-component-state.component.tsx")),
      expect: [
        { rule: "L10", line: 6 },
        { rule: "L10", line: 7 }
      ],
      label: "L10 rejects state and lifecycle hooks in a feature component"
    },
    // Tier separation: an interactive shared/ui primitive keeps widget-local state and wires
    // DOM events. L9 must stay silent here — see the fixture's own comment for why.
    {
      exec: () => checkPresentationBehaviour(F("good-shared-ui.ui.tsx"), read("good-shared-ui.ui.tsx")),
      expect: [],
      label: "L9 allows hooks and DOM event wiring in a shared/ui primitive"
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
  return [...failures, ...runClassifierSelfTest(), ...runTierSelfTest(F, read)];
}

// ───────────────────────── JSON 出力（--json）─────────────────────────
// garden（庭師の「目」）などのツールが消費する機械可読の結果。人間表示とは独立。
function emitJson(payload) {
  if (JSON_OUT === undefined) return;
  const relV = (v) => ({
    rule: v.rule, file: relative(projectRoot, v.file), line: v.line, col: v.col ?? 1, msg: v.msg,
  });
  const body = {
    tool: "spacta-verify",
    // 2: `scan.checks[].roots` → `.scope`（役割で書かれたチェックはディレクトリを名乗らない）、
    //    および `roles` の追加。status "inconclusive" の原因が1つ増えた（未分類ファイル）。
    // 3: `tiers` の追加。**status には影響しない** —— 段位は保証ではなく保証範囲の申告であり、
    //    消費側（garden / measure）もこれを違反として扱ってはならない。
    schemaVersion: 3,
    projectRoot,
    selfTest: payload.selfTest,
    status: payload.status,
    // What was actually walked, per check. Consumers can tell "found nothing" from
    // "looked at nothing" — see status "inconclusive".
    scan: payload.scan ?? null,
    // What the walked files were understood to be. `unclassified` non-empty means this run
    // could not be green whatever the checks found: something was walked that Spacta cannot name.
    roles: payload.roles ?? null,
    // How deep each feature actually adopted Spacta. Not a finding and never a reason to fail:
    // a consumer that turns a tier into a task is asking a project to adopt a round trip it may
    // not need. Read it as the scope of the green next to it.
    tiers: payload.tiers ?? null,
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

// What each check actually walked. Printed on every run so "found nothing" can never be
// mistaken for "looked at nothing".
function printScanReport(report) {
  const w = Math.max(...report.map((r) => r.name.length));
  console.log("  Scanned:");
  for (const r of report) {
    const mark = r.scanned === 0 ? "—" : r.severity === "info" ? "ⓘ" : r.found ? "✗" : "✓";
    console.log(`    ${r.law.padEnd(3)} ${r.name.padEnd(w)}  ${String(r.scanned).padStart(4)} files   ${mark} ${r.found}`);
  }
  console.log("");
}

// 役割カバレッジ。既定は1行——「何ファイルを、何だと分かった上で見たか」。
// 全文（役割ごとの掟・宣言された弱さ）は --roles、または申告すべきことがある時に自動で出る。
function printRoleCoverage(cov) {
  const counts = cov.roles.map((r) => `${r.role} ${r.count}`).join(", ");
  const drift = cov.roles.filter((r) => r.shortfall.length);
  const full = SHOW_ROLES || cov.unknown.length > 0 || drift.length > 0;

  if (!full) {
    console.log(`  Roles (${platform.name}): ${cov.total} files, 0 unclassified — ${counts}`);
    console.log("    (--roles for what each role is and which laws reach it)\n");
    return;
  }

  console.log(`  Roles (${platform.name}) — ${cov.total} files, ${cov.unknown.length} unclassified:`);
  const w = Math.max(1, ...cov.roles.map((r) => r.role.length)); // 全ファイル未分類なら roles は空
  const pad = " ".repeat(w + 17); // 4 indent + role + 2 + 4-wide count + " files  "
  for (const r of cov.roles) {
    const laws = r.laws.length ? r.laws.join(", ")
      : r.partial.length ? `no Law reaches all of them — ${r.partial.join(", ")}`
      : "no Law reaches it";
    console.log(`    ${r.role.padEnd(w)}  ${String(r.count).padStart(4)} files  ${laws}`);
    console.log(`${pad}${ROLES[r.role].what}`);
    if (r.unchecked) console.log(`${pad}not checked: ${r.unchecked}`);
    // 表が「この役割はこの掟が守る」と言っているのに、その掟がこのプロジェクトの当該ファイルに
    // 届いていない。コードの違反ではなく **表の主張の誤り** なので落とさない（同じ検査を
    // starter/ に当てる L6 側が err で落とす）。ここは事実の申告に徹する。
    if (r.shortfall.length) {
      const list = r.missedFiles.slice(0, 3).join(", ") + (r.missedFiles.length > 3 ? `, +${r.missedFiles.length - 3} more` : "");
      console.log(`${pad}⚠ the platform table claims ${r.shortfall.join(", ")} for this role, which did not reach: ${list}`);
    }
  }
  if (cov.unknown.length > 0) {
    console.log(`\n    unclassified — no role could be named for these ${cov.unknown.length} file(s):`);
    for (const rel of cov.unknown) console.log(`      ${rel}`);
  }
  console.log("");
}

// 段位。役割カバレッジと同じ場所・同じ形で出す —— どちらも「何を、何だと分かった上で見たか」の
// 申告であり、違反の一覧ではない。
//
// 注記を段ごとに置くのは、段位そのものが目的ではないからである。読み手は「T2 と書かれている」
// ことではなく「**自分の緑が往復を含んでいない**」ことを知らなければならない。
const TIER_NOTES = {
  T2: [
    "T2 features declare Effects but do not receive their results — the write-path",
    "round trip is NOT verified for them.",
  ],
  T1: [
    "T1 features declare no Effects at all: they are state machines fed by InitData, so",
    "nothing on the write path is verified for them either.",
  ],
  T0: ["T0 features have no core.ts, so only L9 / L10 reach them."],
};

function printTiers(tiers) {
  // 0件を緑の顔で通さない。「機能を採点した」と「採点する機能が無かった」は別の主張である。
  if (tiers.length === 0) {
    console.log("  Tiers: none — no feature was found to grade, so this green says nothing about feature depth.\n");
    return;
  }
  console.log(`  Tiers: ${tiers.map((t) => `${t.name} ${t.tier}`).join(", ")}`);
  for (const tier of ["T2", "T1", "T0"]) {
    if (tiers.some((t) => t.tier === tier)) for (const line of TIER_NOTES[tier]) console.log(`    ${line}`);
  }
  // 読めなかったものは黙って段位を名乗らせない（理由まで印字する）。
  for (const t of tiers.filter((t) => t.tier === "T?" || t.unsure)) {
    console.log(`    ? ${t.name}: ${t.why}`);
  }
  console.log("    A tier states what this project adopted, not a violation: no tier changes the exit code.\n");
}

// 未分類は「違反」ではない。違反と呼ぶには「この掟に反している」と言えなければならず、役割が
// 分からないファイルについてそれは言えない——それこそが本版の消しに来た「検査していないことを
// 断言する」の裏返しである。よって err ではなく exit 2（＝この実行は性格づけできない）。
//
// 読者はこの出力を受け取って自分のタスクを続けるエージェントである。解決できない非ゼロ終了は
// ループか小細工を生むので、直せる場所と正当な直し方を必ず名指しする。
function printUnclassified(unknown) {
  console.error("verify: INCONCLUSIVE — Spacta could not name the role of every file it walked.\n");
  console.error(`  ${unknown.length} file(s) matched no convention in ${PLATFORM_TABLE}:`);
  for (const rel of unknown) console.error(`    ${rel}`);
  console.error("");
  console.error("  Spacta does not know what these files are, so it cannot say which laws should have");
  console.error("  applied to them, and it will not guess. This run is neither green nor red: the laws");
  console.error("  that did run found nothing, but \"was everything examined?\" has no answer.");
  console.error("");
  console.error("  Two legitimate fixes — pick the one that is true, then re-run:");
  console.error(`   1. Name the role. Edit ${PLATFORM_TABLE}: add the path to RULES with the role it`);
  console.error("      really has (the roles and what each one means are listed at the top of that file),");
  console.error("      or to IGNORED if Spacta genuinely does not govern it (config, generated output).");
  console.error("      That table is Form, not Law — a project is expected to edit it when its Form");
  console.error("      changes (docs_HUMAN-ONLY/setup.md step 5). A role with `laws: []` is a valid");
  console.error("      answer: a declared weakness is printed on every run, an unnameable file is not.");
  console.error("   2. Use a convention that already has a role — move or rename the file so it lands on");
  console.error("      one. The roles this project already uses are listed in the Roles block above.");
  console.error("");
  console.error("  Do not delete the file, and do not widen an existing check to swallow it: neither");
  console.error("  answers the question of what the file is, which is the only thing being asked.\n");
}

// The point of a green run is "accept this without reading it". The boundary of that
// permission therefore has to be printed, not reconstructed by reading verify.mjs.
// Entries below are the gaps that exist as of this version — each one is a real hole,
// stated so that nobody has to discover it the hard way.
const NOT_GUARANTEED = [
  ["Type integrity (props / contracts)", "run `tsc --noEmit` separately"],
  ["Judgement kept out of shell.tsx", "not checked (L10 covers components, not shells)"],
  ["Widget-local state in shared/ui staying non-domain", "not checked — by design, see L10's scope"],
  ["Effect results actually reaching Core at runtime", "partially checked — the Action receptacle is required (L3); the wiring is not traced"],
  // 旧文は「starter の drain は入場時の state から始まる」と書いていた。starter に drain は
  // もう無く、エンジンが直列化するので lost update は **構造で** 閉じている。ただしそれを
  // verify が検算しているわけではない —— 閉じ方が変わったことと、この走行が何を見たかは別の話で、
  // 後者を前者で言い換えると、この欄の存在意義（過大主張を止めること）が消える。
  ["Concurrent dispatch during an in-flight Effect", "not checked here — closed by construction instead: the engine applies Actions one at a time and is the only caller of perform. verify inspects none of that"],
  // この行が申告していた穴は、段位の印字が引き受けた。
  ["Write-path round trip in features below T3", "not checked — the Tiers line above names which features those are"],
  ["Build order when delegating to parallel agents", "not checked — a procedure, not a property of the tree"],
  ["Presentation consistency", "info only (L8), never blocks"],
  ["Semantic correctness", "never checked"],
];

// The role-claim test can only weigh ROLES[].laws against files the reference corpus actually
// has, so every role starter/ contains no file of carries an unmeasured claim — including any
// role this project added to the platform table.
//
// Derived from what the corpus turned out to hold, never listed by hand: starter/ grows and the
// table grows, and a hand-written list of what they do not cover between them is exactly the
// stale second copy this version exists to delete.
const unmeasuredRoles = (rolesSeen) => Object.keys(ROLES).filter((r) => !rolesSeen.includes(r));

// A check that matched 0 files enforced nothing, so its promise must never be printed as a
// guarantee — that would be the trust boundary itself lying. It is listed separately with its
// roots instead, because "this law found no problems" and "this law was never pointed at your
// code" look identical from the outside and only one of them is worth trusting.
// Deliberately NOT fatal: a project legitimately may have no app router, no shared/ui, or no
// components yet, and turning every such gap into INCONCLUSIVE would make the honest state
// unreachable. Saying so out loud is the fix; refusing to run is not.
function printTrustBoundary(report, rolesSeen) {
  const promised = report.filter((x) => x.promise && x.severity === "err");
  const verified = promised.filter((x) => x.scanned > 0);
  const unverified = promised.filter((x) => x.scanned === 0);

  console.log("  Guaranteed by this green:");
  if (verified.length === 0) console.log("    (none — no err-severity check matched a single file)");
  for (const r of verified) {
    console.log(`    ${r.law.padEnd(3)} ${r.promise}  (${r.scanned} files)`);
  }

  if (unverified.length > 0) {
    console.log("\n  NOT verified in this project (0 files matched — the law was not enforced here):");
    for (const r of unverified) {
      console.log(`    ${r.law.padEnd(3)} ${r.promise}`);
      console.log(`        ${r.name} matched 0 files (${r.scope})`);
    }
    console.log("    If this project does have such code, the check is pointed at the wrong place:");
    console.log("    fix its roles (or root/match) in CHECKS (docs_HUMAN-ONLY/setup.md step 5).");
  }

  const unmeasured = unmeasuredRoles(rolesSeen);
  const rows = unmeasured.length === 0 ? NOT_GUARANTEED : [...NOT_GUARANTEED,
    ["Law claims of roles the reference corpus has no file of",
     `unverified — L6 measures ROLES[].laws against starter/, which holds no file of role: ${unmeasured.join(", ")}`]];

  const w = Math.max(...rows.map(([k]) => k.length));
  console.log("\n  NOT guaranteed by this green:");
  for (const [what, how] of rows) {
    console.log(`    - ${what.padEnd(w)}  → ${how}`);
  }
}

// 保守モード: 表を書き出して終了する。検査は一切しない（緑を名乗らない）。
if (WRITE_DOCS) {
  const r = writeChecksTable();
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}

console.log(`\n[Spacta verify] target = ${projectRoot}\n`);

// Run L6 self-test first. If the verifier is broken, subsequent greens cannot be trusted.
const selfFail = runSelfTest();
if (selfFail.length) {
  console.error("✗ L6 self-test (Verifier Self-Verification) failed:");
  selfFail.forEach((m) => console.error("   " + m));
  // 読み手はタスクを持ったエージェントである。「verify.mjs を直せ」は、自分のタスクが製品機能で
  // ある相手には正当な行動ではない —— 回避策を捏造させるか、ループさせる。逃げ道ではなく
  // **エスカレーション先**を書く。
  console.error("\nThe verifier itself is malfunctioning. Every other result in this run is untrustworthy.");
  console.error("If fixing the verifier is your task, fix verify.mjs. If it is not, this is not yours to");
  console.error("route around: revert any local change under verify/ and report the failure above as a");
  console.error("blocker. Editing your own code to satisfy a broken verifier makes the damage permanent.\n");
  emitJson({ selfTest: { ok: false, failures: selfFail }, status: "red" });
  process.exit(1);
}
console.log("✓ L6 self-test: Verifier correctly rejects planted violations and avoids false positives.\n");

// L6 の続き: チェッカが動くことは示せた。次に、それが何かに向けられていることを示す。
const wiringDead = runWiringTest();
if (wiringDead === null) {
  // v0.9.1 が空スキャンに出した処方箋をここにも適用する。SKIPPED のまま緑まで走れるなら、
  // starter/ を消すだけで配線テストを黙って外せてしまう＝穴を隠す操作が可能になる。
  console.error("verify: INCONCLUSIVE — no reference corpus for the L6 wiring test.\n");
  console.error(`  Expected a reference corpus at ${CORPUS_CANDIDATES.join("\n  or at ")}`);
  console.error("  Without it the CHECKS registry globs are unverified: a glob that selects 0 files");
  console.error("  reports 0 violations and is indistinguishable from a law that passed.");
  console.error("  Restore starter/ next to verify/ (it ships with the verifier), or point this copy");
  console.error("  of the verifier at one. This run is not green and not red — it is unverified.");
  console.error("  If you do not have a corpus to restore, stop and report this: it cannot be resolved");
  console.error("  from inside a feature task, and no edit to your own code will clear it.\n");
  emitJson({
    selfTest: { ok: true, failures: [], wiring: "missing" },
    status: "inconclusive",
  });
  process.exit(2);
} else if (wiringDead.length > 0) {
  console.error("✗ L6 wiring test failed: these checks select 0 files in the reference corpus:");
  for (const r of wiringDead) {
      console.error(`   ${r.law.padEnd(3)} ${r.name} — ${r.scope} selects nothing under ${CORPUS}`);
  }
  console.error("\nA check that selects no files reports no violations, which is indistinguishable");
  console.error("from a check that passed. Fix its `roles` (or root/match) in CHECKS, or extend the corpus.");
  console.error("If you customised the Form on purpose (docs_HUMAN-ONLY/setup.md step 5), the fix is");
  console.error("not only the glob: the reference corpus starter/ must be updated to the new Form too,");
  console.error("because this test measures the globs against starter/, never against your tree.\n");
  emitJson({
    selfTest: {
      ok: false,
      failures: wiringDead.map((r) => `wiring: ${r.law} ${r.name} selects 0 files in ${CORPUS}`),
    },
    status: "red",
  });
  process.exit(1);
} else {
  console.log(`✓ L6 wiring test: all ${CHECKS.length} registry globs select files in the reference corpus.\n`);
}

// L6 の締め: 表の主張を参照コーパスに当てる。glob が繋がっていることと、掟が「守る」と名乗った
// 役割を本当に歩いていることは別の主張である。後者が崩れたのが v0.9.3 の frame/L5 だった。
const roleClaim = runRoleClaimTest(); // wiringDead が null でない ＝ CORPUS はここでは必ず在る
if (roleClaim.unknown.length > 0 || roleClaim.overclaimed.length > 0) {
  console.error("✗ L6 role-claim test failed against the reference corpus:");
  for (const rel of roleClaim.unknown) {
    console.error(`   unclassified  ${rel} — the corpus contains a file the platform table cannot name`);
  }
  for (const r of roleClaim.overclaimed) {
    console.error(`   over-claimed  role ${r.role}: the table says ${r.missing.join(", ")} enforces it, ` +
      `but no such check walked ${r.files.slice(0, 3).join(", ")}`);
  }
  console.error("\nROLES[role].laws is printed as enforcement, so a claim no check backs is the verifier");
  console.error("asserting something it did not check — the exact defect the role model exists to remove.");
  console.error("Make the two agree, in whichever direction is true:");
  console.error(`  - the law really should cover that role -> add the role to that check's \`roles\` in ${__filename}`);
  console.error(`  - it really does not                    -> drop it from ROLES[role].laws in ${PLATFORM_TABLE}`);
  console.error("                                             and give the role an `unchecked` note saying so.");
  console.error("An unenforced role is allowed (`laws: []` is a declared weakness, and it prints). An");
  console.error("unenforced role that claims to be enforced is not.\n");
  emitJson({
    selfTest: {
      ok: false,
      failures: [
        ...roleClaim.unknown.map((f) => `role-claim: ${f} is unclassified in ${CORPUS}`),
        ...roleClaim.overclaimed.map((r) => `role-claim: role ${r.role} claims ${r.missing.join(", ")} with no check behind it`),
      ],
    },
    status: "red",
  });
  process.exit(1);
} else {
  console.log(`✓ L6 role-claim test: every corpus file has a role, and every law those ${roleClaim.rolesSeen.length} roles claim actually walks them.\n`);
}

// README のチェック表は CHECKS からの生成物。ずれていたら err（＝正本を2つに戻させない）。
const docsDrift = checkChecksTableDrift();
if (docsDrift.violations.length === 0 && !docsDrift.note) {
  console.log("✓ docs: the check table in verify/README.md matches the CHECKS registry.\n");
}

const scan = runMainScan();
const viols = scan.violations;
viols.push(...docsDrift.violations);
printScanReport(scan.report);
printRoleCoverage(scan.coverage);
printTiers(scan.tiers);

// L6 proves the verifier is not broken. This proves the verifier actually looked at something.
// A run that walks zero files finds zero violations, and would otherwise be reported as green —
// which is indistinguishable from the green of a checker that sees nothing. Refuse to name it.
if (scan.scannedTotal === 0) {
  console.error("verify: INCONCLUSIVE — 0 files were scanned.\n");
  console.error(`  Nothing matched under ${projectRoot}`);
  console.error("  Expected a src/ tree (features/, shared/) or an app router beside it.");
  console.error("  Is the target path correct?\n");
  emitJson({
    selfTest: { ok: true, failures: [], wiring: "ok" },
    status: "inconclusive",
    scan: { total: 0, checks: scan.report },
  });
  process.exit(2);
}

const errors = viols.filter((v) => !v.warn && !v.info);
const warns = viols.filter((v) => v.warn);
const infoViols = viols.filter((v) => v.info);
const notes = runInfoChecks();
if (docsDrift.note) notes.push(docsDrift.note);

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
  // Derived from CHECKS, never hardcoded: the list of laws claimed here cannot drift away
  // from the list of laws actually run.
  const enforced = scan.report.filter((r) => r.severity === "err").map((r) => r.law).join(", ");
  console.log(`✓ Laws (${enforced}): No violations`);
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

// 未分類が残っていれば緑は名乗れない。ただし **赤は名乗れる**: 見つけた違反は自信を持って言える
// 主張であり、未知のファイルがあることはそれを取り消さない。緑だけが「全部見た」を含意する。
const unclassified = scan.coverage.unknown;

emitJson({
  selfTest: { ok: true, failures: [], wiring: "ok" },
  status: failed ? "red" : unclassified.length ? "inconclusive" : "green",
  scan: { total: scan.scannedTotal, checks: scan.report },
  tiers: scan.tiers.map((t) => ({ feature: t.name, tier: t.tier, why: t.why })),
  roles: {
    platform: platform.name,
    total: scan.coverage.total,
    unclassified,
    byRole: scan.coverage.roles.map((r) => ({ role: r.role, files: r.count, laws: r.laws, claimedButNotReaching: r.shortfall })),
  },
  errors, warns, infos: infoViols, notes,
});

console.log("");
if (failed) {
  // 赤と未分類が同時に出る道。読者はこの出力を受け取って自分のタスクを続けるエージェントなので、
  // 「まだ緑になれない」とだけ告げて直し方を伏せてはならない —— 伏せると、目の前の違反を潰しても
  // 緑にならない理由を自力で推測することになり、その推測はたいてい「邪魔なファイルを消す」に着地する。
  // 全文は緑側の printUnclassified が持っているので、ここは所在と禁じ手だけを短く言う。
  if (unclassified.length) {
    console.error(`verify: Red — and incomplete: ${unclassified.length} walked file(s) had no role (listed above),`);
    console.error("so even fixing every violation above cannot produce a green until they are named.");
    console.error(`That is a separate repair, and it usually belongs in ${PLATFORM_TABLE} rather`);
    console.error("than in the code; re-run once the violations are fixed to get the full instructions.");
    console.error("Deleting the file is never one of them.\n");
  }
  console.error("verify: Red (merge blocked until violations are resolved)\n");
  process.exit(1);
}
if (unclassified.length) { printUnclassified(unclassified); process.exit(2); }
printTrustBoundary(scan.report, roleClaim.rolesSeen);
console.log("\nverify: Green\n");
