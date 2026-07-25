# Spacta v0.9 → v0.9.1 編集計画 (04)

- 作成日: 2026-07-26
- 書いた人: Claude (Opus 5) — review-01 の筆者
- 対象: 00 (実装レポート) / 01 (査読) / 02 (実装者の返信) / 03 (第三者の提案) の4文書すべて
- 一次資料: `verify/verify.mjs` を**実際に実行した実測**、`starter/` 全ファイル、`livingdoc/` 実コード、`garden/GARDENER.md`、`spacta-alpha-evaluation.md`
- 目的: 4文書の主張を検証し、**v0.9 → v0.9.1 の具体的な編集計画**を出す。どのファイルに何を足し、どの問題にどう対処するか
- 立場: 前3者の合意は出発点として受け取るが、**実行できる主張はすべて実行して確かめた**。実測で覆ったものは覆したと書く

---

## 0. 結論 — v0.9.1 は「Green を正直にする」リリースである

先に結論を4点。

1. **reply-02 §3.1 の実測は正しい。** 私が review-01 で最優先に置いた「L2 のスキャン対象を components に拡張せよ」は、実際に走らせると **偽陽性 21 件・真陽性 0 件**になる。私自身の手で再現した (§1.2)。私の提案1 は撤回し、reply-02 の L9 新設案を採る。**ただし L9 の禁止集合は提案されたままでは広すぎる**。`shared/ui` に対する hooks 禁止は、UI プリミティブ層を実質的に使用不能にする (§3.2)。

2. **4文書のいずれも見つけていない、より深刻な欠陥がある。`verify` は 1 ファイルもスキャンしなくても Green と出力する。** そして **Spacta リポジトリ自身の `npm run verify` が、まさにその空スキャン Green を出している** (§1.3)。「Green なら精読せずに受け入れてよい」を売りにするツールにとって、空虚な Green は最も危険な出力である。これを v0.9.1 の最優先項目に置く。

3. **書き経路の戻り (00 §4.1 / 02 B1) は、新しい掟の追加ではなく L3 の未施行である。** L3 は「非決定性 (時刻・乱数・**ID**) を値として `InitData` / `Action` で注入せよ」と既に書いている。サーバ採番 ID は非決定性そのものであり、L3 の射程内にある。それが守られていないのは、**L3 が自前のスキャンを持たず L2 に寄生しており、L2 は `core.ts` しか見ないから**である。これは alpha-evaluation が「Loopholes in Law Scope」と名付けた現象の**3例目**にあたる (L2 の grep、L4 のコメント、L5 の page 限定に続く)。新しい思想は要らない。**L3 を完成させるだけである。**

4. **proposal-03 のフェーズゲートは採用する。ただし「危険な辺は1本」は livingdoc 固有の観測であり、一般化には条件が要る** (§1.4)。そして著者の案2 (1ファイルへの統合) は、設計論以前に **`verify.mjs` と構造的に非互換**である。すべての掟がファイル名 glob で層を識別しているため、統合すると掟が走る対象が消滅する (§4.2)。

**v0.9.1 のスコープ方針**: GitHub 公開・ベータ公開の直前である今は、**Green の意味を変える変更を入れる最後の安価な機会**である。公開後に L9 を足せば既存利用者のビルドが赤くなる。逆に、新しい膜語彙の追加や rationale 文書の再編は、公開後でも安全に足せる。したがって v0.9.1 には **「Green が何を約束しているかを正しくする変更」だけを入れ、「思想を増やす変更」は 0.10 以降に送る**。

---

## 1. 検証結果 — 何が実証され、何が覆ったか

### 1.1 実測で裏が取れた主張

すべて私が実際に実行・計測して確認した。

| 主張 | 出典 | 検証方法 | 結果 |
|---|---|---|---|
| L2 を委譲層に適用すると偽陽性 21 件・真陽性 0 件 | reply-02 §3.1 | `checkCorePurity` を 39 ファイルに実行 | **一致**。`shared/ui` 11 件 / `components` 10 件。内訳は `next/link` 13 + `react` 型 8 = 21。真の不純 0 件 |
| `components/` は `shell.tsx` を一度も import していない | proposal-03 §2.1 | grep | **一致** (0 件) |
| `@/shared/ui` を import するファイルは 30 | proposal-03 §2.2 | grep | **一致** (30) |
| 層ごとの規模 (shell 3本252行 / components 24本1188行 / shared/ui 15本373行) | proposal-03 §3 | `wc -l` | **一致** |
| 委譲層に hooks が 0 件 | reply-02 §3.1 | grep (`useState`/`useEffect`/`useReducer`/`useMemo`/`useRef`) | **一致** (0) |
| 6 feature 中 3 つに `shell.tsx` がない | proposal-03 §3.1 | ls | **一致** (catalog / search / profile) |
| `GARDENER.md` の `dedupe-clone` はページ跨ぎ重複を明示的に管轄外としている | proposal-03 §5.2(b) | 原文確認 | **一致** |
| `livingdoc` は `verify` が Green | report-00 §1 | 実行 | **一致** (L6 自己テスト通過 + Laws 違反 0) |
| `case "FAILED"` に補償がなく、`temp_` id がサーバへ飛ぶ | review-01 §2.2 / reply-02 §2.1 | コード確認 | **一致** |

### 1.2 覆った主張 — 私の review-01 提案1 は撤回する

review-01 §3 と提案1 で、私はこう書いた。

> **L2 のスキャン対象を `features/**/components/*.tsx` に拡張する。** 数値の閾値も、プロジェクト固有の判断も要りません。純粋に「宣言に走査を追いつかせる」だけです。

**これは誤りだった。** 実測 (再現コード: `checkCorePurity` を委譲層 39 ファイルに適用):

```
shared/ui:              15 files -> 11 violations in 10 files
   11x  Import of '…' is prohibited in Core (framework/IO leakage)
features/*/components:  24 files -> 10 violations in 10 files
   10x  Import of '…' is prohibited in Core (framework/IO leakage)
```

原因は `verify.mjs:191` の `FORBIDDEN_IMPORT` が `^next(\/|$)|^react(-dom)?$` を含むことである。これは計算層にとっては正しい禁止だが、**提示層にとって `react` の型と `next/link` は正当な語彙**である。

reply-02 の指摘 —「机上で『L2 の scope を広げる』は完璧に見えるが、走らせると壊れる」— はそのとおりで、**これは実装した者にしか出せない指摘**という自己評価にも同意する。私は「宣言に走査を追いつかせるだけ」と書いたが、L2 の宣言は「Core の純粋性」であって「提示層の純粋性」ではなかった。宣言そのものが違うものに、走査だけを合わせようとした。

**L9 の新設という方向を採る。ただし禁止集合には修正を要する (§3.2)。**

### 1.3 【新発見】`verify` は 0 ファイルをスキャンしても Green と出力する

4文書のいずれも指摘していない。そして v0.9.1 の最優先項目である。

`verify.mjs:57` の `walkFiles` は、対象ディレクトリが存在しなければ静かに空配列を返す。

```js
function walkFiles(dir, pred, out = []) {
  if (!existsSync(dir)) return out;   // ← src/ が無ければ 0 件で正常終了
```

したがって `src/` も `app/` も持たないディレクトリを対象にすると、**すべての掟が 0 件の入力に対して 0 件の違反を報告し、Green になる**。

**そして、Spacta リポジトリ自身の `npm run verify` がこれである。**

```jsonc
// package.json
"verify": "node verify/verify.mjs ."     // ← "." = spacta リポジトリ自身
```

`/workspace/spacta` には `src/` も `app/` も存在しない。実行結果:

```
[Spacta verify] target = /workspace/spacta

✓ L6 self-test: Verifier correctly rejects planted violations and avoids false positives.

✓ Laws (L1, L2, L4, L5, L7): No violations

verify: Green
```

**「No violations」と「何も見ていない」が、出力上まったく区別できない。**

これが致命的な理由は、L6 の存在理由とまったく同じ論理から出る。report-00 §2.1 はこう書いた。

> もし L6 がなければ「緑が出た」は「チェッカが壊れていて何も見ていない」と区別がつかず、私は 22 ファイルを読む羽目になっていた。

**L6 は「チェッカが壊れていないこと」を証明する。しかし「チェッカが実際に何かを見たこと」は誰も証明していない。** 空の入力に対する Green は、壊れたチェッカの Green と実務上まったく同じ意味を持つ。L6 が塞いだ穴の、隣の穴が空いている。

この欠陥は現実的に踏まれる。踏み方は3通りある。

1. **ディレクトリ構成が違うプロジェクト** — `src/` を使わず `app/` 直下に置く構成、モノレポで `packages/web/src` にある構成では、`verify` は何も見ずに Green を返す。利用者は「Spacta 準拠だ」と信じる
2. **実行位置の間違い** — リポジトリルートで叩くつもりが一段上で叩いた場合、エラーではなく Green が返る
3. **Spacta 自身の CI** — 現在の `npm run verify` は、Spacta の開発中に何も検査していない

**対処は L6 と同じ系譜で安価である: スキャンしたファイル数を出力し、0 件のときは Green を名乗らない。** §3.1 に具体案を書く。

### 1.4 【新発見】`starter/` は、どの検証にも掛かっていない

reply-02 §4.1 と proposal-03 §1 が到達した最重要の発見は「**`starter/` は `SPACTA.md` より強い規範力を持つ**」である。実装者は Effect の配置を導出せずに starter から写した。

**ところが、その最強の規範が、機械的検証を一度も受けていない。**

- `npm run verify` は `.` (spacta リポジトリ) を対象にしており、`starter/` を見ていない (§1.3)
- `verify/verify.mjs starter` を直接叩くと、**TypeError で落ちる**。`verify.mjs:45` の `createRequire(join(projectRoot, "package.json"))` が対象プロジェクト側の `typescript` を解決しようとするが、`starter/` に `node_modules` がないため

```
TypeError: undefined is not an object (evaluating 'ts.ScriptTarget.Latest')
    at parse (verify/verify.mjs:69:45)
```

`typescript` を解決可能にした状態で実行すると **starter は Green である** (私が `node_modules` を仮リンクして確認済み)。つまり内容に問題はない。**問題は、それを誰も確かめていないことである。**

これは L6 の思想 —「自分が赤を出せることを証明できない限り緑を名乗らない」— の自然な拡張として扱うべきである。**採用させたい規範が starter のコードであるなら、starter は verify の回帰コーパスでなければならない。**

さらに starter には、規範として2つの欠落がある。

- **`route.ts` の実例がない。** L5 は `page.tsx` と `route.ts` の両方を対象にするが、starter は `route.ts` を持たない。「宣言に走査が追いついた」あと、**実例が追いついていない**
- **失敗経路がない。** `starter/src/features/sample/shell.tsx:22` は `for (const e of effects) await runEffect(e);` であり、**try/catch がない**。Effect が throw すれば unhandled rejection になる。実装者はこれを自力で改善して try/catch → `FAILED` に到達した (それでも不完全だった)。**つまり starter は、実装者が到達した水準より低い**

### 1.5 proposal-03 の「危険な辺は1本」— 正しいが、一般化には条件が要る

proposal-03 §2 の観測 (`import` は下向き一方通行、危険な縦の辺は `shared/ui ← components/shell` の1本) は実測で確認した。フェーズゲートの提案も妥当である。

**ただし「1本」は livingdoc の委譲の切り方に依存している。** livingdoc では core / types / shell / source を人間が書き、components だけを並列委譲した。この切り方では確かに縦の辺は1本になる。

しかし alpha-evaluation が記録している別の並列化 (dashboard feature で core / source / shell を複数エージェントに分配) では、**もう1本の縦の辺が現れる**。

> `shared/types.ts` の `Effect` union と `shared/runEffect.ts` の case テーブル

review-01 §4.2 で導出したとおり、L7 (逆依存禁止) により Effect は shared に集約せざるを得ない。したがって **2体のエージェントが別々の feature に Effect を足すと、同一ファイルの同一 union を同時に編集する**。これは L1 でも L7 でも守られない、2本目の危険な縦の辺である。

したがって一般形はこうなる。

> **危険なのは「縦の辺」ではなく、「上流がまだ実ファイルとして存在しない状態で下流を並列にすること」である。並列の断面は、上流が確定済みの層に限る。**

proposal-03 の Phase 1 → 2 → 3 は、この一般則を UI 層に当てはめた特殊解である。計画では一般則の方を書き、UI の3フェーズはその適用例として置く (§3.6)。

### 1.6 私からの追加観測 — livingdoc の `drain` は戻りの Effect も捨てている

review-01 §2.2 で `FAILED` に補償がないことを指摘したが、同じ箇所にもう1つある。

```ts
// livingdoc shell.tsx:32
setState((current) => update(current, { type: "FAILED", message })[0]);
//                                                                 ^^^ [1] (Effect[]) を捨てている
```

`update` は `[State, Effect[]]` を返すが、`[0]` だけ取って `[1]` を捨てている。つまり**失敗処理が新たな Effect (例: 通知、ログ、リトライ) を宣言しても、それは実行されない**。3つの feature の shell すべてが同じ形である。

これは書き経路の戻りが未定義であることの**3つ目の症状**であり (1: 補償なし、2: 採番ID戻らず、3: 戻りの Effect が捨てられる)、§3.5 の starter パターンはこの3つすべてを塞ぐ設計にする。

---

## 2. v0.9.1 のスコープ判定基準

15 件以上の提案が4文書に散っている。v0.9.1 に入れるかどうかを、次の3条件で判定する。

| 条件 | 説明 |
|---|---|
| **(a) Green の意味に関わるか** | 「Green なら受け入れてよい」という約束の範囲を、正しくするか。公開後に変えると利用者のビルドが壊れるので、**公開直前の今が最も安い** |
| **(b) livingdoc / starter で回帰検証できるか** | 実在するコードで受け入れ条件を書けるか。書けないものは「机上」であり、実験 (0.10) に送る |
| **(c) 数値の閾値を持ち込まないか** | 著者の方針 (「30 という値を決めても C 的なものになる。プロジェクトごとに適切な形は異なる」) に反しないか |

**(a) を満たすものが v0.9.1。(b) だけのものは v0.9.2〜0.10。(c) に触れるものは原則不採用。**

この基準で分けると:

- **v0.9.1 に入る**: 空スキャン Green (§3.1)、CHECKS レジストリと信頼境界の印字 (§3.1)、L9 (§3.2)、L4 の glob 拡張 (§3.3)、starter の自己検証 (§3.4)、書き経路パターンの starter 実装 (§3.5)、SPACTA.md / HUMAN_GUIDE の正直さの修正 (§3.6〜3.8)
- **0.10 以降に送る**: `setState` 規則 (実験が要る)、rationale 文書の切り出し (行動を変えないと実測済み)、`shared/types.ts` の分割 (判断材料が足りない)、第5の膜語彙の Law 化 (検査器とセットでなければ hope が増えるだけ)
- **不採用**: shell の行数・分岐数の計測 (実装者自身が撤回済み)、著者の案2 (§4.2)

---

## 3. 編集計画 — ファイル別

### 3.1 【最優先】`verify/verify.mjs` — 空スキャン Green の封鎖と、信頼境界の印字

**対処する問題**: §1.3 (空スキャン Green)、§1.4 (starter が検証外)、reply-02 §4.2 (緑の意味が印刷されていない)、review-01 §5.3 (被害の上限がどこにも書かれていない)

reply-02 A2 は「保証した / 保証していない」を印字する案を出した。**方向は正しいが、文字列をハードコードすると、それ自体が hope になる。** 走査対象が変わったのに文言が古いまま、という事故は alpha-evaluation が「Loopholes in Law Scope」として3回記録している失敗そのものである。

**したがって、印字は宣言からではなく実装から生成しなければならない。**

#### (1) 単一の CHECKS レジストリを導入する

現在 `runMainScan()` は、glob とチェッカの対応をコード中に直書きしている。これを1つのテーブルに集約し、**スキャンと印字と自己テストの3つが同じテーブルを読む**ようにする。

```js
// verify.mjs — 新設
const CHECKS = [
  { law: "L1", name: "cross-feature-imports", roots: ["src/features"],
    glob: /\.(ts|tsx)$/,                       severity: "err",
    fn: checkCrossFeatureImport, fixtures: ["bad-cross-feature", "good-feature"],
    promise: "feature 間の内部 import がないこと" },

  { law: "L2", name: "core-purity", roots: ["src"],
    glob: /(^|\/)core\.ts$/,                   severity: "err",
    fn: checkCorePurity, fixtures: ["bad-core", "good-core"],
    promise: "core.ts に IO・非決定性が無いこと" },

  { law: "L4", name: "effect-runtime", roots: ["src/features"],
    glob: /\.(ts|tsx)$/,                       severity: "err",     // ← §3.3 で拡張
    fn: checkEffectRuntime, fixtures: ["bad-shell", "good-shell"],
    promise: "手書きの effect.type switch が網羅性で閉じていること" },

  { law: "L5", name: "source-purity", roots: ["app"],
    glob: /(^|\/)(page|route)\.tsx?$/,         severity: "err",
    fn: checkSourcePurity, fixtures: ["bad-page", "good-page", "bad-route", "good-route"],
    promise: "server 境界で ID・時刻を生成していないこと" },

  { law: "L7", name: "shared-features-isolation", roots: ["src/shared"],
    glob: /\.(ts|tsx)$/,                       severity: "err",
    fn: checkSharedReverseDependency, fixtures: ["bad-shared-import", "good-shared"],
    promise: "shared が features の内部を import していないこと" },

  { law: "L8", name: "presentation-purity", roots: ["src/features"],
    glob: /((^|\/)shell\.tsx|\/components\/.*\.tsx)$/, severity: "info",
    fn: checkPresentationPurity, fixtures: ["bad-presentation", "good-presentation"],
    promise: null,                             // info は「約束」に含めない
    note: "無彩色パレット・色+透過度の検出 (ステータス色は意図的に許容)" },

  { law: "L9", name: "presentation-behaviour", roots: [...],        // ← §3.2 で新設
    ... },
];
```

`runMainScan()` はこのテーブルを回すだけになる。**glob がテーブルの外に存在しなくなるので、「宣言と走査対象がズレる」ことが構造的に起きなくなる。**

#### (2) スキャン件数を出力し、0 件なら Green を名乗らない

```
[Spacta verify] target = /workspace/livingdoc

✓ L6 self-test: 12/12 planted violations rejected, 0 false positives

  scanned:
    L1 cross-feature-imports     34 files    ✓ 0
    L2 core-purity                6 files    ✓ 0
    L4 effect-runtime            34 files    ✓ 0
    L5 source-purity             17 files    ✓ 0
    L7 shared-features-isolation 26 files    ✓ 0
    L9 presentation-behaviour    39 files    ✓ 0
    L8 presentation-purity       27 files    ⓘ 0   (info)

verify: Green
```

そして **0 件スキャンの扱い**:

```
  scanned:
    L1 cross-feature-imports      0 files    ⚠ nothing scanned
    L2 core-purity                0 files    ⚠ nothing scanned
    ...

verify: INCONCLUSIVE — 0 files scanned. Is the target path correct?
   expected src/features, src/shared, app/ under /workspace/spacta
   exit code 2
```

**受け入れ条件**: `bun verify/verify.mjs /workspace/spacta` (= `src/` を持たないディレクトリ) が Green を返さないこと。現在は Green を返す。

#### (3) 信頼境界を印字する (reply-02 A2 の実装形)

`promise` フィールドと、明示的な非保証リストから生成する。

```
  guaranteed by this green:
    - feature 間の内部 import がないこと                    (L1, 34 files)
    - core.ts に IO・非決定性が無いこと                      (L2,  6 files)
    - 手書きの effect.type switch が網羅性で閉じていること   (L4, 34 files)
    - server 境界で ID・時刻を生成していないこと             (L5, 17 files)
    - shared が features の内部を import していないこと      (L7, 26 files)
    - components/shared-ui に IO・非決定性が無いこと         (L9, 39 files)

  NOT guaranteed by this green:
    - 型整合                    → run `tsc --noEmit` separately
    - shell に判断が無いこと     → not checked (see SPACTA.md §2)
    - Effect の戻りの往復        → not checked (pattern only, see starter/)
    - 提示の一貫性              → info only (L8)
    - 意味的な正しさ            → never checked
```

**この「NOT guaranteed」リストが、review-01 §5.3 で私が定式化した「読まなくても被害の上限が分かる」を、初めてツールの出力にする。** そして reply-02 §4.2 の指摘 —「実装者は verify のソース 1043 行を読んで自分で表を作った」— が不要になる。

#### (4) `typescript` の解決にフォールバックを入れる

```js
// verify.mjs:45 付近
let ts;
try { ts = createRequire(join(projectRoot, "package.json"))("typescript"); }
catch { ts = createRequire(join(__dirname, "..", "package.json"))("typescript"); }  // 自前を使う
```

これで `starter/` を含む任意のディレクトリを、対象側に `node_modules` が無くても検証できる (§3.4 の前提)。

---

### 3.2 `verify/verify.mjs` + `verify/fixtures/` — L9 (Presentation Behaviour Purity) の新設

**対処する問題**: review-01 §3 (components が純度検査の対象外)、reply-02 §3.2 (「影の掟」の成文化)

reply-02 A1 の方向を採る。**ただし禁止集合には反対する。**

#### 反対する点: `shared/ui` に hooks を禁止してはいけない

reply-02 の L9 案は、`features/**/components/*.tsx` と `shared/ui/*.tsx` の**両方**に対して `useState` / `useEffect` / `useReducer` を禁止する。

**これは `shared/ui` を使用不能にする。** UI プリミティブ層に置かれるべきものを列挙すれば分かる。

| プリミティブ | 必要とするもの |
|---|---|
| `Dialog` / `Modal` | Escape キー処理 (`document.addEventListener`)、フォーカストラップ (`useRef` + `useEffect`)、スクロールロック |
| `Tabs` / `Accordion` / `Disclosure` | 開閉状態 (`useState`) |
| `Combobox` / `Menu` | キーボードナビゲーション、外側クリック検出 |
| `Tooltip` / `Popover` | 位置計算 (`useLayoutEffect`)、`window` のリサイズ購読 |

これらを禁止すると、行き先は2つしかない。**(a) プリミティブを feature 側に置く** (`shared/ui` が空洞化し、UI 統一性が崩れる — 著者が最も気にしている問題そのもの)、**(b) `shared/ui` を使わない**。どちらも Spacta の設計意図に反する。

**livingdoc の実測 (hooks 0 件) はこの禁止を正当化しない。** livingdoc の `shared/ui` 15 ファイルは合計 373 行、平均 25 行で、Button / Card / Badge / Avatar / Quote といった**静的な装飾のみ**である。「今日 hooks が 0 件」は層の性質ではなく、**このサンプルが小さいことの帰結**である。1つでも対話的なプリミティブを作った瞬間に破綻する。

#### 採る形: 対象ディレクトリで禁止集合を変える

区別の根拠は Spacta 自身の語彙から出る。`SPACTA.md` §2 は `shared/ui` をこう定義している。

> `shared/ui` must only contain presentation primitives that are **decoupled from feature-specific concepts**

つまり **`shared/ui` が持つ state は「ウィジェット自身の状態」であって「アプリのドメイン状態」ではない。** 一方 `features/*/components/` は、既に `core.ts` にステートマシンを持つ feature の内部にある。**そこに現れた state は、膜から漏れ出たドメイン状態である。** この非対称性が禁止集合の違いを正当化する。

| 検出対象 | `features/**/components/*.tsx` | `shared/ui/**/*.tsx` |
|---|---|---|
| `fetch` / `XMLHttpRequest` | **err** | **err** |
| `new Date()` / `Date.now()` | **err** | **err** |
| `Math.random()` / `crypto.randomUUID()` / `crypto.getRandomValues()` | **err** | **err** |
| `localStorage` / `sessionStorage` | **err** | **err** |
| `prisma` / DB クライアントの import | **err** | **err** |
| `async` 関数宣言 / トップレベル `await` | **err** | **err** |
| `useState` / `useReducer` / `useEffect` / `useLayoutEffect` | **err** | **許容** |
| `window` / `document` | **err** | **info** |
| `next/navigation` の import (`useRouter().push` 等) | **err** | **info** |
| `react` / `react-dom` の import | **許容** | **許容** |
| `next/link` / `next/image` の import | **許容** | **許容** |

`next/link` を許容し `next/navigation` を禁止するのは恣意ではない。**`<Link>` はマークアップ (宣言) であり、`router.push()` は命令的な遷移 (IO) である。** 後者は `Effect: { type: "NAVIGATE" }` として `runEffect` を通るべきもので、実際 livingdoc はそうしている (`runEffect.ts:56`)。L9 はこの既存の設計判断を成文化するだけである。

#### 実装と受け入れ条件

- `verify.mjs` に `checkPresentationBehaviour(file, text, tier)` を新設。`tier` は `"feature"` / `"shared-ui"`
- `CHECKS` レジストリに2エントリ (tier ごと) として登録
- fixtures を4つ追加:
  - `bad-component.component.tsx` — `useState` と `fetch` を含む → 弾かれること
  - `good-component.component.tsx` — `next/link` と `react` 型 import を含む → **弾かれないこと** (偽陽性の回帰防止)
  - `bad-shared-ui.ui.tsx` — `new Date()` を含む → 弾かれること
  - `good-shared-ui.ui.tsx` — **`useState` + `useEffect` + `document.addEventListener` を含む Dialog 相当** → **弾かれないこと**

**4つ目の fixture が最も重要である。** これは「`shared/ui` では hooks を許す」という設計判断を、コメントではなく回帰テストとして固定する。将来誰かが「L9 を一律にしよう」と考えたとき、この fixture が赤くなって理由を思い出させる。

- **受け入れ条件**: `livingdoc` の委譲層 39 ファイルが**無改修で Green** になること (実測により、禁止集合に触れるものが 0 件であることを確認済み)

---

### 3.3 `verify/verify.mjs` — L4 の走査対象を feature 全体へ拡張

**対処する問題**: proposal-03 §3.1 が発見した「6 feature 中 3 つに shell.tsx がない」の帰結。4文書のいずれも、この発見を掟に接続していない。

現在 L4 (`checkEffectRuntime`) は `shell.tsx` だけを走査する。したがって **`shell.tsx` を持たない feature には網羅性検査が一切かかっていない。** livingdoc では catalog / search / profile の3 feature がこれに該当する。

この3 feature の components のどこかに手書きの `switch (effect.type)` を書けば、網羅性終端がなくても Green である。

**そして修正コストはゼロである。** `checkEffectRuntime` は構造上、effect switch が無ければ即座に空配列を返す。

```js
// verify.mjs:293
if (!hasEffectSwitch) return out; // OK if routing through shared runEffect
```

つまり **glob を `features/**/*.{ts,tsx}` に広げても、偽陽性が原理的に発生しない。** effect switch を書いていないファイルは、何件走査しても 0 件を返す。

- `CHECKS` の L4 エントリの glob を `/(^|\/)shell\.tsx$/` から `/\.(ts|tsx)$/` (roots: `src/features`) に変更
- fixture 追加: `bad-component-switch.component.tsx` (components 内の網羅性なし switch)
- **受け入れ条件**: livingdoc の走査対象が 3 ファイル → 34 ファイルに増え、違反 0 件のまま

**これは「宣言に走査を追いつかせる」の最も純粋な例である。** `SPACTA.md` の L4 は「Switch blocks on `effect.type` must terminate with an exhaustiveness check」と書いており、場所を限定していない。走査だけが `shell.tsx` に限定されていた。

---

### 3.4 `package.json` + CI — starter を回帰コーパスにする

**対処する問題**: §1.4 (最強の規範が検証されていない)

reply-02 §4.1 と proposal-03 §1 が合意したとおり、`starter/` が実装者の行動を決める。であれば starter は「参考実装」ではなく「**仕様の実行可能な部分**」であり、L6 と同格の扱いを受けるべきである。

```jsonc
// spacta/package.json
"scripts": {
  "verify":         "node verify/verify.mjs .",
  "verify:starter": "node verify/verify.mjs starter",          // 新設
  "verify:all":     "npm run verify:starter && npm run verify" // CI はこれ
}
```

前提として §3.1(4) の typescript フォールバックが要る (現在 starter 単体では TypeError で落ちる)。

さらに **starter に欠けている実例を足す** (§1.4):

| 追加するファイル | 目的 | 検査される掟 |
|---|---|---|
| `starter/app/api/sample/route.ts` | L5 の route 側の実例。**現在 L5 は route.ts を走査するのに、starter に実例がない** | L5 |
| `starter/src/features/sample/components/` に「hooks を使わない」実例 (既存2ファイルで足りる) | L9 の good ケース | L9 |
| `starter/src/shared/ui/` に対話的プリミティブを1つ (`Disclosure` 等) | **`shared/ui` では hooks が許されることを、コードで示す** | L9 (shared-ui tier) |

最後の1つは重要である。§3.2 で禁止集合を分けても、starter に静的なプリミティブしか無ければ、実装者は「`shared/ui` でも hooks は禁止らしい」と読む。**reply-02 §4.1 が実証したとおり、コードは散文より強い。許可もコードで示す必要がある。**

**受け入れ条件**: `npm run verify:all` が Green。そして starter の走査件数が 0 でないこと (§3.1(2) により自動的に検査される)。

---

### 3.5 `starter/` — 書き経路の戻りパターンを実装として置く

**対処する問題**: report-00 §4.1、review-01 §2、reply-02 B1/B2、§1.6 (Effect の取りこぼし)

#### 位置づけの変更: これは新しい掟ではなく L3 の完成である

`SPACTA.md` の L3 は既にこう書いている。

> **L3 Injection**: Pass non-determinism (time, random, **IDs**) as values in `InitData` or `Action`. Do not generate them inside the Core.

**サーバが採番した ID は非決定性であり、L3 が名指ししている対象そのものである。** それが `Action` を通らずに state に入る (あるいは入らないまま temp id が残る) のは、L3 違反である。

なぜ検出されないか。**L3 は自前のスキャンを持たない。** `SPACTA.md` の Enforcing Tool 欄は「Enforced by type definitions in Core and L2 purity check」であり、L2 は `core.ts` しか見ない。つまり **L3 の施行は「Core が生成しないこと」の半分だけで、「外から入るものが Action を通ること」の半分が空いている。**

これは alpha-evaluation の「Loopholes in Law Scope」の**3例目**である。L2 (grep が `new Date()` を取りこぼす)、L4 (コメントに騙される)、L5 (page だけ見ていた) に続く。**同じ処方が使える: 宣言に実装を追いつかせる。**

ただし今回は走査 glob を広げるだけでは足りない。**「戻りが Action を通っているか」を AST で判定する安価な方法が無い**からである。したがって v0.9.1 では:

- **パターンを starter のコードとして置く** (施行は tsc が担う。下記)
- **`verify` の「NOT guaranteed」に「Effect の戻りの往復」を明記する** (§3.1(3))

つまり **hope に留まることを、隠さずに宣言する。** これは alpha-evaluation の階層 (`hope < detect < prevent-weak < prevent-strong`) の中で自分の位置を正しく申告する態度であり、L6 の系譜と一致する。

#### 設計 — tsc に施行させる

膜語彙を増やさずに、**tsc が全 feature に実装を強制する**形が作れる。

**(1) `starter/src/shared/types.ts`** — 戻りの「データ」だけを共有層に置く

```ts
/** 書き経路の戻り。膜を越えるのはデータだけ（関数・Promise・コールバックを入れない）。 */
export type EffectResult = { id?: string };

export type Effect =
  // 戻りを持つ Effect は correlationId を必ず持つ（L3: ID の対応付けも非決定性）
  | { type: "SAVE"; correlationId: string; key: string; value: string }
  | { type: "LOG"; message: string };
```

**(2) `starter/src/shared/runEffect.ts`** — 成功時はデータを返し、失敗時は throw する

```ts
export async function runEffect(effect: Effect): Promise<EffectResult | null> {
  switch (effect.type) {
    case "SAVE": {
      // const res = await fetch(...); if (!res.ok) throw new Error(await res.text());
      // const { id } = await res.json();
      return { id: "srv_generated_id" };   // ← サーバ採番 ID を「データ」として返す
    }
    case "LOG":
      console.log(effect.message);
      return null;                          // 戻りを持たない Effect は null
    default:
      return assertNever(effect);
  }
}
```

**(3) `starter/src/features/sample/types.ts`** — 戻りを受ける Action を union に足す

```ts
export type Action =
  | { type: "INCREMENT"; now: string; correlationId: string }
  | { type: "RESET"; now: string }
  // 書き経路の戻り。Core はこの2つを必ず処理する（default の never が強制する）
  | { type: "EFFECT_SUCCEEDED"; correlationId: string; id?: string }
  | { type: "EFFECT_FAILED"; correlationId: string; message: string };
```

**ここが設計の要点である。** `core.ts` の `update` は既に `default` 節に `const _exhaustive: never = action;` を持つ。したがって **この2メンバーを Action union に足した時点で、tsc が「両方を処理しろ」と強制する。** verify に検査を足す必要がない。**prevent-strong を、新しい掟ゼロで得られる。**

**(4) `starter/src/features/sample/core.ts`** — 補償と ID 差し替えを実装する

```ts
case "EFFECT_SUCCEEDED": {
  // 楽観的に置いた仮の値を、サーバ採番の本物に差し替える（L3: ID は生成せず注入される）
  const next: State = { ...state, pending: state.pending.filter(p => p !== action.correlationId) };
  return [next, []];
}
case "EFFECT_FAILED": {
  // 補償: 楽観的更新を取り消し、理由を state に残す
  //       → エラー状態が純粋層にあるので、(state, action) だけから再現できる
  const next: State = {
    ...state,
    count: state.count - 1,                 // 例: INCREMENT の取り消し
    pending: state.pending.filter(p => p !== action.correlationId),
    notice: action.message,
  };
  return [next, []];
}
```

**(5) `starter/src/features/sample/shell.tsx`** — 戻りを Action に変換し、**戻りが生んだ Effect も取りこぼさない**

```tsx
// 非決定性（now / correlationId）は Shell(縁)で生成し、値として Core へ渡す（L3）。
function dispatch(make: (now: string, cid: string) => Action) {
  const action = make(new Date().toISOString(), crypto.randomUUID());
  const [next, effects] = update(state, action);
  setState(next);
  void drain(next, effects);
}

// Effect を実行し、その結果を Action として膜の内側へ戻す。
// 戻りの Action が新たな Effect を生んだ場合も、キューに積んで取りこぼさない（§1.6）。
async function drain(from: State, queue: Effect[]) {
  let current = from;
  const pending = [...queue];
  while (pending.length > 0) {
    const effect = pending.shift()!;
    let outcome: Action | null = null;
    try {
      const result = await runEffect(effect);
      if ("correlationId" in effect)
        outcome = { type: "EFFECT_SUCCEEDED", correlationId: effect.correlationId, id: result?.id };
    } catch (error) {
      if ("correlationId" in effect)
        outcome = {
          type: "EFFECT_FAILED",
          correlationId: effect.correlationId,
          message: error instanceof Error ? error.message : "unknown error",
        };
    }
    if (!outcome) continue;
    const [next, more] = update(current, outcome);   // ← [1] を捨てない
    current = next;
    pending.push(...more);
    setState(current);
  }
}
```

#### この設計が塞ぐもの / 塞がないもの

| livingdoc で起きた問題 | 塞がるか |
|---|---|
| `FAILED` に補償がなく、失敗した投稿が画面に残る | **塞がる** (`EFFECT_FAILED` で補償が必須になる。書かなければ state が壊れるのが目に見える) |
| `temp_` id がサーバに送られ、投稿直後の投票が失敗する | **塞がる** (`EFFECT_SUCCEEDED` で本物の ID に差し替える経路ができる) |
| 戻り処理が生んだ Effect が捨てられる (§1.6) | **塞がる** (キュー方式) |
| 実装者ごとに解き方が割れる | **塞がる** (starter に実例があるので写される。reply-02 §4.1 の実証による) |

**塞がらないもの (正直に書く)**: `await` 中にユーザーが別の操作をしたときの `current` の陳腐化。上のコードは `drain` 開始時の state を起点にしており、並行 dispatch との競合を扱っていない。**starter に競合制御まで載せるべきかは判断が要る (§6 の未解決点1)。** 少なくとも v0.9.1 では、この制約をコメントで明示する。

#### §6.4 (フライトレコーダー) との関係 — これは前提条件である

`HUMAN_GUIDE` §6.4 は、Spacta の成長経路の中心にこう書いている。

> `update` が純粋で入力が全部明示なら、**Action ログを取るだけでフライトレコーダーになります** — 障害時の状態遷移を決定的にリプレイでき

**この主張は、書き経路の戻りが Action を通っていなければ成立しない。** IO の結果が Action を経由せずに state に影響するなら、それは `update` の隠れた入力であり、Action ログだけではリプレイできない。

つまり §3.5 は「UX バグの修正」ではなく、**`HUMAN_GUIDE` §6.4 が掲げる成長経路の前提条件**である。これを埋めないまま §6.4 を公開すると、実装不可能な構想を売り物にすることになる。優先度を上げる根拠として、これが最も強い。

---

### 3.6 `SPACTA.md` — 差分 (幹の予算に配慮する)

現在 63 行。**AI が毎タスク読む唯一の幹**なので、追加は最小にし、削れるところは削って純増を抑える。

#### 追加 (+9 行)

**(a) §1 の表に L9 を追加** (+1行)

```markdown
| L9 | **Presentation Behaviour Purity**: Do not write IO or non-determinism in `features/*/components/*` or `shared/ui/*`. Local state hooks are forbidden in feature components, allowed in `shared/ui` primitives. | `verify` presentation-behaviour (AST) |
```

**(b) L3 の行を書き換える** (純増 0)

現行の Enforcing Tool 欄「Enforced by type definitions in Core and L2 purity check」は、**戻り経路について何も施行していないのに施行しているように読める**。正直に書き換える。

```markdown
| L3 | **Injection**: Pass non-determinism (time, random, IDs) as values in `InitData` or `Action` — including values that come back from IO (server-assigned IDs, failures). Do not generate them inside the Core. | Inbound: L2 purity check. Outbound (effect results): **pattern only — see `starter/`**, enforced by `assertNever` in your `update`. Not scanned by `verify`. |
```

**(c) L4 の Enforcing Tool を更新** (純増 0) — 走査対象が feature 全体になったことを反映

**(d) §2 に「Effect の戻り」を追加** (+4行) — 散文で説明せず、starter を指す

```markdown
### Effect Results Come Back as Actions
*   An Effect that has a result carries a `correlationId`. The shell converts success/failure into an `Action` (`EFFECT_SUCCEEDED` / `EFFECT_FAILED`) and feeds it back to Core — never a callback, never a Promise across the membrane.
*   Core owns the compensation: undo the optimistic update on failure, swap the temp id for the server id on success.
*   **Copy the shape from `starter/src/features/sample/{types,core,shell}`.** Do not invent your own.
```

**(e) §2 に2行追加** (+2行)

```markdown
*   A `shell.tsx` is optional. Features with no interaction (`page.tsx` → `components/` only) do not need one.
*   A `clone` info is never a reason to add a cross-feature import, nor to promote a feature-specific component into `shared/ui`. Promote only after the same shape has actually repeated in two or more features.
```

**(f) §4 に指示 6 を追加** (+2行) — proposal-03 のフェーズゲート。**AI が読む場所に置くことが要点**

```markdown
6.  **When delegating in parallel, materialize upstream layers first.** Write `shared/ui` and freeze `types.ts` as real files before parallelizing `components/`; write shells and `app/` last. Agents may run in parallel only within a layer whose upstream already exists on disk — a prose description of an API is not a contract, only code is.
```

#### 削減の提案 (−4行)

純増を +5 行に抑えるため、§2 の "Type Placement" 4 項目を 2 項目に圧縮することを提案する (Single Owner / Local Shared / True Shared Contract / Discriminated Unions → 前3つを1行に統合)。**ただしこれは著者の判断であり、圧縮せず +9 行を許容するのも妥当**である (§6 の未解決点2)。

---

### 3.7 `docs_HUMAN-ONLY/ja/HUMAN_GUIDE_tactical_*.md` — 差分

**§6.2「潰せていないもの」に3項目追加**:

```markdown
- **Law セット内部の緊張 — Effect 語彙の大域化。** L7 (逆依存禁止) により `shared/runEffect.ts` は feature の型を import できません。したがって単一ディスパッチ地点を保つ限り、`Effect` union は全 feature 共有の1ファイルに集まります。「feature A に Effect を1つ足す」操作が、feature B の依存先の編集になります。これは L1 の隔離が及ばない、Law 同士の相互作用による結合です。

- **共有上流の変更は Law が守っていない。** L1 は横方向 (feature ↔ feature)、L7 は逆方向 (shared → features) を止めますが、**正しい向きの縦の依存** (`components` / `shell` → `shared/ui`) は誰も守っていません。実測では `livingdoc` の 30 ファイルがこの辺を渡っています。`shared/ui` の API 変更は下流を一斉に壊しますが、これを検出するのは `verify` ではなく `tsc` です。**したがって並列委譲では、上流を実ファイルとして確定させてから下流に着手してください** (SPACTA.md §4-6)。

- **データを経由した結合 (実測)。** `livingdoc` では `shared/source/queries.ts` が 508 行に育ちました。`shared/types.ts` (175行) の約3倍で、`TRACE_SELECT` を 3 feature (pageview / search / profile) が共有しています。`traces` テーブルに列を1つ足す判断は 3 feature の読み経路に同時に波及しますが、**L1 は緑のままです。** 実装者の証言によれば、この結合を生んだのは「読みモデルの組み立てを source 側でやる」という設計判断であり、**8 つの掟のどれも賛成も反対もしませんでした。**
```

**§6.4 (フライトレコーダー) に前提条件を明記**:

```markdown
（この性質が成立するのは、**IO の結果も Action として膜を通る**場合に限ります。Effect の戻りが Action を経由せずに state へ入るなら、それは `update` の隠れた入力であり、Action ログだけではリプレイできません。v0.9.1 でこの往復パターンを `starter/` に用意したのは、この前提を満たすためです。）
```

**§0-5 (Gardener) の直後、および §6.3 の周辺に「Green の意味」を追加**:

```markdown
なお `npm run verify` は、**何を保証し、何を保証していないか**を実行のたびに出力します。緑を受け入れの根拠にする前に、この2つのリストを読んでください。特に「型整合 (tsc)」「shell に判断が無いこと」「Effect の戻りの往復」は緑に含まれません。
```

**§0-1 の並列実装の記述を修正** (review-01 §5.2 / reply-02 §2.2 の合意):

現行「複数の独立したAIエージェントが凍結された契約に対して別々の機能を並行実装し、衝突ゼロで統合できました」は事実だが、**なぜ衝突しなかったかの帰属**を足す。

```markdown
（この成功は「Law が衝突を防いだ」ことによるものではありません。Law が防ぐのは横方向と逆方向の結合で、**並列エージェントが実際にぶつかるのは共有上流です**。衝突しなかったのは、契約を**人間が事前に凍結した**からです。Law の役割は、合流点を少数の名前のついた場所に限定することであり、凍結そのものではありません。手順は SPACTA.md §4-6 を参照してください。）
```

**§67 行目の「UI 統一」の記述を明確化** (proposal-03 §1):

現行の一文は「デザイン調整時に横断して見よ」という**推奨**であり、「1体の AI が実装せよ」という**作業分割の規約ではない**。著者の意図が後者なら、書き足す場所は `HUMAN_GUIDE` ではなく `SPACTA.md` §4-6 である (実装 AI が読むのはそちらのため)。§3.6(f) がそれを担っている。この一文自体は「調整フェーズの話である」と明示して残す。

---

### 3.8 `verify/README.md` — 検査対象表を生成物にする

現在の README は検査項目を散文で書いている。**§3.1 の `CHECKS` レジストリから表を生成する** スクリプトを足し、README の該当セクションを生成物にする。

```
npm run docs:checks    # CHECKS レジストリ → verify/README.md の表を再生成
```

alpha-evaluation は「どのファイル集合をその法が実際に検査するかを README のチェック表に明示的に列挙することが、この抜け穴の恒久的な予防機構になる」と書いている。**手書きの表は、その予防機構自体が hope である。** 生成物にすれば構造的に守られる。

---

### 3.9 `CHANGELOG.md` (新規) — Green の意味の変更を記録する

GitHub 公開に必要であり、かつこのリリースの主題と直結する。

```markdown
# Changelog

## 0.9.1 — Making green honest

### Breaking (what a green verify means has changed)
- **New L9** (presentation behaviour purity) — feature components and shared/ui are now scanned for IO and non-determinism. Projects with `fetch`/`new Date()` in components will turn red.
- **L4 widened** — exhaustiveness is now checked across the whole feature tree, not only `shell.tsx`.
- **Empty scans no longer report green.** `verify` now exits 2 with `INCONCLUSIVE` when it scanned 0 files.

### Added
- verify prints its trust boundary (what this green guarantees / what it does not).
- verify prints per-check scanned file counts.
- `starter/` now demonstrates the effect-result round trip (`EFFECT_SUCCEEDED` / `EFFECT_FAILED`).
- `npm run verify:starter` — the reference implementation is now part of the regression corpus.

### Fixed
- `verify` falls back to its own TypeScript when the target project has none.
```

---

## 4. 却下・保留した提案

### 4.1 却下: shell の非 JSX 文数・分岐数を数える (report-00 提案2)

実装者自身が reply-02 §1.3 で撤回済み。判定基準 (c) に抵触する。私の代案 (`setState` は core 由来に限る) も、reply-02 §1.3 の2つの技術的指摘 — (a) `setState(c => update(c,…)[0])` という updater 関数形が必ず現れる、(b) Action の中身をどこで決めたかは縛れない — により、**そのままでは実装できない**。0.10 で info として実験する (§5)。

### 4.2 却下: 著者の案2 (layout/page/shell/components を1ファイルに統合し、clone 検知器で担保する)

proposal-03 §5.2 が3つの理由 (clone 検知は similarity であって conformance ではない / GARDENER の管轄と矛盾 / `hope<detect<prevent` で2段の格下げ) で反対しており、すべて妥当である。

**私はさらに決定的な4つ目を足す。この案は `verify.mjs` と構造的に非互換である。**

`verify.mjs` は**すべての層をファイル名の glob で識別している**。

| 掟 | 識別に使っている glob |
|---|---|
| L2 | `/(^|\/)core\.ts$/` |
| L4 | `/(^|\/)shell\.tsx$/` |
| L5 | `/(^|\/)(page\|route)\.tsx?$/` |
| L8 / clone | `/(^|\/)shell\.tsx$\|\/components\/.*\.tsx$/` |

**layout / page / shell / components を1ファイルに統合すると、`core.ts` と `shell.tsx` と `components/` が消える。** 残るのは `app/**/page.tsx` だけなので、走査されるのは L5 のみになる。そして L5 は「server 境界で ID・時刻を生成するな」「集約するな」と要求するので、統合ファイルは**即座に赤になるか、あるいは中身を空にするしかない**。

つまり案2 は「設計として好ましくない」以前に、**Spacta の検証器が動作しなくなる**。そして §1.3 で見たとおり、走査対象が消えても現在の verify は Green を返すので、**利用者は検証が止まったことに気づけない**。案2 を採るなら verify を全面的に書き直す必要がある。

**ただし案2 に含まれる洞察 —「指示は散文より構造で伝える方が強い」— は正しく、採用すべきである。** その採用形が §3.5 (パターンを starter のコードで示す)、§3.6(f) (順序を AI が読む場所に書く)、§3.2 の good fixture (許可をコードで示す) である。

### 4.3 却下: 著者の案1 (UI 層は全て1体の AI で書く)

proposal-03 §5.1 の評価に同意する。問題は確実に消えるが、**安全だった横方向の並列 (24 ファイル) まで捨てる**ので払いすぎである。§3.6(f) のフェーズゲートが上位互換。

ただし proposal-03 が公平に書いたとおり、UI 層合計 2,113 行という規模なら案1 でも実務コストは小さい。**フェーズゲートは「案1 を選んでもよいが、選ばなくても安全にする」ための規則**であり、案1 を禁じるものではない。

### 4.4 保留 (0.10 以降): rationale 文書の切り出し (review-01 提案4)

reply-02 §1.6 の実測により、**私の提案は費用対効果で格下げになる**。実装者の回答は明確だった。

> 「掟がなぜ緩いか」の rationale は、実装者の行動を変えない。文句を減らすだけである。

私の提案4 が対象にしていた4件のうち3件 (L8・shell 厚み・types.ts) が「意図の説明」に該当し、行動を変えない。残る「空白を埋める rationale」(書き経路・`shared/ui` 昇格基準) は、**reply-02 §4.1 の発見により、rationale 文書ではなく starter のコードと SPACTA.md の1行にすべき**である。それが §3.5 と §3.6(e) である。

**したがって rationale ディレクトリの新設は v0.9.1 では不要。** 私の提案4 は、実装者の実測によって大部分が不要と示された。

### 4.5 保留 (0.10 以降): `shared/types.ts` の分割、第5の膜語彙の Law 化

- **`shared/types.ts` の分割**: reply-02 §1.5 のとおり、実際に重いのは `queries.ts` (508行) であって `types.ts` (175行) ではない。分割の前に、`source` 層の設計指針を決める方が価値が高い。判断材料が足りないので 0.10 送り。v0.9.1 では §3.7 の実測記載のみ
- **第5の膜語彙 (`Outcome` 等) の正式化**: reply-02 §4.3 の「語彙は検査可能性を生む」に同意するが、**検査器なしで語彙だけ増やすと hope が1つ増える**。§3.5 の設計は tsc に施行させることで、語彙を増やさずに prevent-strong を得ている。正式な膜語彙への昇格は、検査器の目処が立ってから

---

## 5. 実行順序と受け入れ条件

```
Step 1 ─ verify の誠実さ ────────────────────────────────
  3.1  CHECKS レジストリ / スキャン件数の出力 / 空スキャンの INCONCLUSIVE 化 /
       信頼境界の印字 / typescript フォールバック
  受け入れ: `verify /workspace/spacta` (src/ 無し) が Green を返さないこと
           `verify /workspace/livingdoc` が Green で、各掟の走査件数が出ること

Step 2 ─ 走査対象を宣言に追いつかせる ────────────────────
  3.3  L4 の glob 拡張 (偽陽性リスク 0。構造的に保証)
  3.2  L9 の新設 (feature tier / shared-ui tier で禁止集合を分ける)
  受け入れ: livingdoc の 39 ファイルが無改修で Green
           good-shared-ui fixture (hooks + document を含む) が弾かれないこと

Step 3 ─ starter を規範として成立させる ──────────────────
  3.4  verify:starter / route.ts の実例 / 対話的プリミティブの実例
  3.5  書き経路の戻りパターン (types / runEffect / core / shell の4ファイル)
  受け入れ: `npm run verify:all` が Green
           starter の Action union に EFFECT_SUCCEEDED/FAILED があり、
           それを消すと tsc が赤になること (施行が効いていることの確認)

Step 4 ─ 文書の正直さ ──────────────────────────────────
  3.6  SPACTA.md (+5〜9行)
  3.7  HUMAN_GUIDE §6.2 / §6.4 / §0-1 / §67
  3.8  verify/README の表を生成物化
  3.9  CHANGELOG.md 新設

Step 5 ─ 英語版へ反映 ──────────────────────────────────
  ja 版が固まってから docs_HUMAN-ONLY/HUMAN_GUIDE.md へ
  (SPACTA.md は元から英語なので Step 4 で完了している)
```

**Step 1 と 2 は独立に実行でき、livingdoc が回帰コーパスとして機能する。Step 3 は starter の書き換えなので、Step 1 の typescript フォールバックに依存する。**

---

## 6. 未解決の判断 (著者に委ねる)

1. **`starter/` の `drain` に並行制御を載せるか。** §3.5 のコードは `await` 中の並行 dispatch を扱っていない。載せれば正確だが starter が重くなり、写す側の理解コストが上がる。**私の推奨: 載せない。コメントで制約を明示し、`HUMAN_GUIDE` の「潰せていないもの」に1行足す。** starter は正しさの見本であって完成品ではない、という位置づけを保つため

2. **`SPACTA.md` の純増を +9 行のまま許容するか、§2 を圧縮して +5 行に抑えるか。** 63 → 72 行は +14%。alpha-evaluation の幹予算の思想からは圧縮が筋だが、圧縮対象 (Type Placement) は実際に使われている指針である。**私の推奨: 圧縮せず +9 行を許容する。** 今回の追加はすべて「実装者が実際に間違えた箇所」であり、Type Placement より優先度が高いとは言えないが、削る根拠も薄い

3. **L9 を v0.9.1 で `err` にするか、1バージョン info で寝かせるか。** alpha-evaluation は L8 を「burn-in のため info で導入」した前例を持つ。**私の推奨: `err` で入れる。** 理由は判定基準 (a) — 公開後に err 化すると利用者のビルドが壊れる。今なら利用者は事実上いない。かつ livingdoc という実プロジェクトで偽陽性 0 を実測済みで、L8 導入時 (実測なしで burn-in が必要だった) とは状況が違う

4. **バージョン番号を 0.9.1 とするか 0.10 とするか。** §3.9 のとおり、この変更は「Green の意味」を変えるので厳密にはパッチではない。**私の推奨: 0.9.1 のまま進め、CHANGELOG の Breaking 節で明示する。** ベータ前の番号に厳密な semver を適用する実益は薄く、それより「何が変わったか」が書かれていることの方が重要

---

## 7. 前3者への返球

- **［実装者 (02) へ］** §3.2 で、あなたの L9 案から `shared/ui` の hooks 禁止を外した。理由は「livingdoc の `shared/ui` 15 ファイルが全て静的だったのは層の性質ではなくサンプルの小ささの帰結であり、対話的プリミティブ (Dialog / Tabs / Combobox) を1つ作った瞬間に破綻する」である。**あなたが `livingdoc` で Dialog 相当を作るとしたら、どこに置いたか。** `shared/ui` に置いて hooks を使ったか、feature 側に置いたか。実装者の直感を聞きたい (livingdoc の `ReportDialog` は `pageview/components/` にあり、state は Core が持っている。これが `shared/ui` に上がる未来はあったか)

- **［実装者 (02) へ］** §1.6 で見つけた `update(...)[1]` の取りこぼしは、`FAILED` が Effect を返さない現状では実害が出ていない。**これも「割り切り」だったか、見落としだったか。** あなたの ［質問2］ の回答 (「妥協の宣言が見落としを能動的に生産する」) の追加事例になると思う

- **［第三者 (03) へ］** あなたの ［質問1］ (手順を何として表現するか) への私の答えは §3.6(f) である。**`SPACTA.md` §4 に書くことは「届かない場所に書く」の4度目にはならない。** `HUMAN_GUIDE` が届かないのは AI が読まないからであって、散文だからではない。`SPACTA.md` は毎タスク読まれるので、そこに置いた3行は届く。ただし幹の予算を2行使う。この交換を支持するか

- **［第三者 (03) へ］** あなたの ［質問3］ (「精読せずに受け入れてよい層」に時間軸の条件が抜けている) には同意する。**「層 × フェーズ」の2次元に拡張するのではなく、「上流が実ファイルとして確定していること」を層の受け入れ条件に含める**のが正しいと考える。理由は、フェーズは時間の話ではなく依存グラフの話だからである。§1.5 の一般形がそれにあたる

- **［全員へ］** §1.3 の空スキャン Green は、4文書のいずれも見つけていない。**私はこれが L6 の隣の穴だと考えている** — L6 は「チェッカが壊れていないこと」を証明するが、「チェッカが実際に何かを見たこと」は誰も証明していない。この見立てに反論があるか

---

## 8. 結び

v0.9.1 でやることを1文にまとめる。

> **Green が何を約束しているのかを、ツール自身に言わせる。そして約束していることが実際に走査されていることを、空スキャンの封鎖と starter の回帰検証で保証する。**

4文書を通じて繰り返し現れた失敗モードは、ひとつしかない。**宣言と実装のズレ**である。L2 の grep、L4 のコメント、L5 の page 限定、L3 の戻り経路、components の未走査、`starter` の未検証、そして空スキャンの Green。すべて「言っていることより、見ている範囲が狭い」という同じ形をしている。

alpha-evaluation は既にこの一般則を持っている。

> **No matter how broad a Law's name is, if the scanned target is narrow, the gap is still "hope".**

v0.9.1 は、この一般則を Spacta 自身に対して徹底的に適用するリリースである。新しい思想は1つも足さない。**足すのは、既に宣言していることの走査範囲と、走査範囲そのものの可視化だけである。**

そして L6 についての評価は、4文書すべてで一致している。ここは動かない — むしろ §3.1 と §3.4 は、L6 の発想を「検証器は自分が赤を出せることを証明する」から「**検証器は自分が何を見たかを申告する**」へ一歩進めるものである。
