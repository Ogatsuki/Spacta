# v0.9.1 の実装レポート (05) — 「Green を正直にする」を実装した

- 作成日: 2026-07-26 (第1弾)。**同日、第2弾を追記** (§A 以降)
- 書いた人: Claude (Sonnet 5) — proposal-03 の筆者。今回は**実装担当**として書いている
- 対象: 04 (編集計画) の Step 1〜4
- 一次資料: 実際に書き換えた `verify/verify.mjs` / `garden/garden.mjs` / `package.json` / `SPACTA.md` / `HUMAN_GUIDE` / `starter/**`、および全変更後に実行した回帰スイート
- 立場: 04 の計画を実行した。**実行して初めて分かったことが4件あり、うち3件は 04 の計画そのものの修正を要した。** 実装作業中に**この文書群の主題が私自身に2度再発した**ので、それを §3 と §B に記録する
- **最終的な変更規模: 18 ファイル変更 + 5 ファイル新規 / +452 −136 行**

> **この文書の読み方。** §1〜§6 は**第1弾**(思想判断を要しない部分のみ)の記録であり、**§4 と §5 は第1弾終了時点のスナップショットである**。その後、著者から残りの実装許可が出たため §A 以降を追記した。
> **現時点の到達点と残件は §A〜§D が正である。** §4 / §5 と食い違う場合は §D を参照すること。

---

## 0. 総評

**実装したのは「Green の意味を正しくする」ことだけである。掟の思想は1つも変えていない。**

最も重要な成果を1つ挙げるなら、これである。

```
（実装前）
$ node verify/verify.mjs .        # spacta リポジトリ自身
verify: Green                     # exit 0 — 1ファイルも見ていないのに緑

（実装後）
$ node verify/verify.mjs .
  Scanned:
    L1  cross-feature-imports         0 files   — 0
    L2  core-purity                   0 files   — 0
    ...
verify: INCONCLUSIVE — 0 files were scanned.   # exit 2
```

04 §1.3 の発見は正しく、そして**再現・修正・回帰検証まで完了した**。

第1弾で保留したもの (L9 の新設、書き経路パターン、`SPACTA.md` の編集) については §4 に理由を書く。**いずれも「著者が決めるべきこと」であり、実装者が黙って決めてよいことではないと判断した。**

**［第2弾で更新］** このうち **L9 / L10 の新設・`SPACTA.md` / `HUMAN_GUIDE` の編集・`CHANGELOG` は、著者の許可を得て実装済みである** (§A / §C)。**書き経路の戻りパターンは依然として未実装** (§D)。

---

## 1. 実装したもの

### 1.1 `verify/verify.mjs` — 空スキャン Green の封鎖 (04 §3.1)

`walkFiles` は対象ディレクトリが無ければ静かに空配列を返す。全ての掟が「0件の入力に0件の違反」を報告し、緑になっていた。

実装した判定は **総計での発火**である。ここは 04 のモック出力が曖昧だったので、明示的に決めた。

- **全チェックを通じて実際に走査した相異なるファイル数が 0 のときだけ** `INCONCLUSIVE` (exit 2)
- **個別チェックが 0 件でもブロックしない**

後者は意図的である。新規プロジェクトでは `src/features/` がまだ空、`core.ts` がまだ無い、という状態が正当に起こりうる。個別 0 件で落とすと、**書き始める前に verify が赤くなる**。走査件数は常に印字されるので、個別の 0 件は人間が読めば分かる。

exit code は `1` (違反あり) と分離して `2` にした。CI は両方を失敗として扱えるが、人間と機械は「違反があった」と「そもそも検証できていない」を区別できる。

### 1.2 `verify/verify.mjs` — CHECKS レジストリ (04 §3.1(1))

glob とチェッカの対応をコード中に直書きしていたものを、単一のテーブルに集約した。**走査・件数報告・信頼境界の印字の3つが、同じテーブルを読む。**

```js
const CHECKS = [
  { law: "L1", name: "cross-feature-imports", severity: "err",
    root: (r) => join(r, "src", "features"),
    match: (q) => /\.(ts|tsx)$/.test(q),
    run: (f, text) => { ... },
    promise: "No feature imports another feature's internals" },
  ...
];
```

`promise` は「この緑が何を保証するか」の一文である。**info レベルのチェックは `promise: null` を持ち、保証リストに構造的に入れない。** 04 §4.3 が指摘した「info 止まりの検査は受け入れ保証に一切参加していない」を、コードの形で表現した。

これにより **glob がテーブルの外に存在しなくなった**。宣言と走査対象がズレるという、alpha-evaluation が「Loopholes in Law Scope」と名付けた失敗が、構造的に起こりにくくなる。

### 1.3 `verify/verify.mjs` — 走査件数と信頼境界の印字 (04 §3.1(2)(3), reply-02 A2)

実行するたびに、何を何件見たかを印字する。

```
  Scanned:
    L1  cross-feature-imports        39 files   ✓ 0
    L2  core-purity                   6 files   ✓ 0
    L4  effect-runtime               64 files   ✓ 0
    L5  source-purity                16 files   ✓ 0
    L7  shared-features-isolation    25 files   ✓ 0
    L9  presentation-behaviour       39 files   ✓ 0
    L10 component-statelessness      24 files   ✓ 0
    L8  presentation-purity          27 files   ⓘ 0
    —   clone                        27 files   ⓘ 0
    —   export-ownership              6 files   ⓘ 0
```
*(L9 / L10 は第2弾で追加。§A 参照)*

そして緑のときだけ、信頼境界を印字する。

```
  Guaranteed by this green:
    L1  No feature imports another feature's internals  (39 files)
    L2  core.ts holds no IO and no non-determinism  (6 files)
    L4  Every handwritten switch on effect.type terminates exhaustively  (64 files)
    L5  Server boundaries generate no ids, time or randomness  (16 files)
    L7  shared/ does not import feature internals  (25 files)
    L9  Components and shared/ui perform no IO and no non-determinism  (39 files)
    L10 Feature components are pure functions of their props  (24 files)

  NOT guaranteed by this green:
    - Type integrity (props / contracts)                  → run `tsc --noEmit` separately
    - Judgement kept out of shell.tsx                     → not checked (L10 covers components, not shells)
    - Widget-local state in shared/ui staying non-domain  → not checked — by design, see L10's scope
    - Effect results travelling back into Core            → not checked
    - Build order when delegating to parallel agents      → not checked — a procedure, not a property of the tree
    - Presentation consistency                            → info only (L8), never blocks
    - Semantic correctness                                → never checked
```

**「Guaranteed」側は CHECKS レジストリから生成される。** ハードコードした文字列ではないので、走査対象が変われば印字も変わる。04 §3.1 の「印字は宣言からではなく実装から生成しなければならない」を守った。

**「NOT guaranteed」側は意図的にハードコードしている。** ここは「まだ存在しない検査」のリストなので、実装から導出できない。

**［第2弾で更新］** 第1弾ではこのリストの3行目が "IO / non-determinism inside components and shared/ui — not checked" だった。**L9 / L10 を実装したので、この行は `promise` 側 (Guaranteed) に移った。** リストの残りは今も未検査のままである。すなわち**このリストが短くなったことが、保証範囲が広がったことの記録になっている**。

なお **"Build order when delegating to parallel agents" を明記した**。これは proposal-03 §6 で私が 04 に求めた点であり、自分の提案なので自分で入れた。`SPACTA.md` にフェーズゲートを書くかどうかとは独立に、**verify がビルド順序を見ていないことは事実**だからである。

### 1.4 `verify/verify.mjs` — L4 の走査対象を拡張 (04 §3.3)

`shell.tsx` のみ → `src/**/*.{ts,tsx}` 全体。**規則文は1文字も変えていない。**

実測:

| 対象 | 実装前 | 実装後 | 違反 |
|---|---|---|---|
| `livingdoc` | 3 ファイル | **64 ファイル** | 0 |
| `starter` | 1 ファイル | **12 ファイル** | 0 |

偽陽性は原理的に発生しない (`checkEffectRuntime` は effect switch を持たないファイルに対して即座に空配列を返す)。実測でも 0 件だった。

### 1.5 `verify/verify.mjs` — typescript のフォールバック (04 §3.1(4))

対象プロジェクトから `typescript` が解決できない場合、検証器自身の依存にフォールバックする。これにより **`node_modules` を持たない `starter/` を検証できるようになった** (実装前は TypeError で落ちていた)。

### 1.6 `garden/garden.mjs` — 新ステータスへの追従

**04 の計画に書かれていないが、必須だった。** §2.2 に詳述する。

### 1.7 `package.json` — 検証対象を starter に向ける

```jsonc
"verify":         "node verify/verify.mjs starter",
"verify:starter": "node verify/verify.mjs starter",
"garden":         "node garden/garden.mjs starter"
```

**04 の計画のままでは動かなかった。** §2.1 に詳述する。

### 1.8 `starter/**` — 言語の中立化 (report-00 §4.6, 04 A7)

13 ファイルの日本語を英語化した。作業は安価なサブエージェント (Haiku) に委譲し、**私は `git diff` で機械的に検収した**。

- コメント・JSDoc: 38 箇所 (サブエージェント)
- `assertNever` のエラーメッセージ `未処理のケース:` → `Unhandled case:` (サブエージェント)
- `app/layout.tsx` の `description` prop (サブエージェント)
- サンプル UI の表示文字列 2 箇所 (私が追加で実施。§2.3 参照)

最終確認: `grep -rnP '[\x{3040}-\x{30ff}\x{4e00}-\x{9faf}]' starter/` → **0 件**

### 1.9 回帰スイート (全て実装後に実行)

```
verify spacta/starter -> exit 0   (Green。node_modules 無しで通る)
verify livingdoc      -> exit 0   (Green。走査総計 80 ファイル)
verify spacta         -> exit 2   (INCONCLUSIVE。実装前は exit 0 の Green)

garden starter        -> verify: green
garden .              -> verify: inconclusive（庭仕事は保留）
```

**`livingdoc` は無改修で緑のままである。** L4 の走査対象が 3 → 64 ファイルに増えた上での緑なので、これは「保証範囲が広がった上での緑」である。

**［第2弾で更新］** L9 / L10 追加後も上記の結果は変わらない (3つとも同じ exit code)。**`livingdoc` / `starter` とも、掟を2つ増やして無改修で緑のままである。** さらに第2弾では、使い捨てプロジェクトで **L9 / L10 が実際に赤を出せること**も確認した (§B)。

---

## 2. 04 の計画からの逸脱 (3件)

### 2.1 【計画の誤り】04 の `package.json` 案は、自分の変更で自分が壊れる

04 §3.4 はこう提案していた。

```jsonc
"verify":         "node verify/verify.mjs .",           // ← 残している
"verify:starter": "node verify/verify.mjs starter",
"verify:all":     "npm run verify:starter && npm run verify"
```

**空スキャンを exit 2 にすると、`npm run verify` は永久に失敗する。** spacta リポジトリに `src/` も `app/` も無いからである。そして `verify:all` はそれをチェーンしているので、**`verify:all` も必ず失敗する**。

04 は §1.3 で「Spacta 自身の `npm run verify` は何も検査していない」と正しく発見しながら、**その修正案の中で `verify: .` を残してしまっている**。発見と処方が噛み合っていない。

採った形: **検査対象を持たないディレクトリを指す検査コマンドを、そもそも定義しない。** `verify` も `garden` も `starter` を指す。spacta リポジトリにおいて検証可能な実体は starter だけである。

### 2.2 【計画の欠落】新ステータスの導入が `garden` を静かに壊す

04 は `status: "inconclusive"` の追加を提案しているが、**`garden.mjs` への影響に触れていない。**

```js
// garden.mjs:125（実装前）
const verifyRed = result.status === "red" || !result.selfTest?.ok;
```

`"inconclusive"` は `"red"` ではない。したがって **garden は「検証されていない木」を緑と見なして庭仕事を始める**。これは 04 が塞ごうとしている穴と**まったく同じ形の穴**であり、修正を入れなければ穴が verify から garden へ移動しただけになる。

採った形 (fail-safe):

```js
// 肯定的な緑以外はすべてブロックする。将来ステータスが増えても安全側に倒れる。
const verifyRed = result.status !== "green" || !result.selfTest?.ok;
```

**等号を「red と一致」から「green と不一致」に反転させた。** これで将来どんなステータスが増えても、明示的に green と認められない限り庭仕事は始まらない。あわせて報告文言も `inconclusive` を正しく名乗るようにした (実装前は inconclusive を "red" と誤表示していた)。

**一般化して記録しておく。「検証器が新しい種類の結果を返せるようになったら、その結果を消費する全てのツールを追跡しなければならない」。** 今回は消費者が garden 1つだったので済んだ。

### 2.3 【計画の不足】L4 の走査根を `src/features` にすると、正規の Effect ランタイムが依然として未走査

04 §3.1 のレジストリ案では L4 の `roots` が `["src/features"]` になっている。

**これでは `src/shared/runEffect.ts` が走査されない。** そして実測すると、`livingdoc` と `starter` の両方で、**`runEffect.ts` こそが `switch (effect.type)` を持つ本体**である。

```
livingdoc/src/shared/runEffect.ts:26:  switch (effect.type) {
livingdoc/src/shared/runEffect.ts:66:      return assertNever(effect);
```

つまり **「網羅性終端が最も必要な唯一のファイル」が、実装前も、04 の計画でも、検査対象外だった。** L4 の宣言は "Switch blocks on `effect.type` must terminate with an exhaustiveness check" であり、場所を限定していない。

採った形: 走査根を `src` にした。`runEffect.ts` を含む 64 ファイルを走査して緑である。**「宣言に走査を追いつかせる」を、04 の案より一段徹底させた。**

### 2.4 (補足) starter の UI 表示文字列も英語にした

サブエージェントへの私の指示は「コメントのみ。UI 表示文字列は対象外」だった。**これは私の指示ミスである。**

report-00 §4.6 の要求は「参照実装の言語は**出力の言語に対して中立**であってほしい」であり、サンプルアプリの表示文字列が日本語なら、それを写した実装者のアプリに日本語が混ざる。コメントだけ英語にしても目的を達成しない。

サブエージェントは指示を超えて `description` prop と `assertNever` のエラーメッセージを英語化していた。**指示違反だが、結果は正しかった。** 残った 2 箇所 (サンプルコンポーネントの `<p>` テキスト) は私が直した。

---

## 3. 実装中に起きたこと — 「空スキャン Green」が私自身に再発した

**これは記録する価値があると思う。この文書群の主題が、この作業中に私自身の手で再現した。**

私はサブエージェントに starter の英語化を委譲した。受け入れにあたり、「コードは1行も変わっていないこと」を機械的に検証しようとして、こう書いた。

```sh
git diff -U0 -- starter/ | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
  | grep -vPz '^\s*[+-]\s*(//|\*|/\*)' | grep -vP '^[+-]\s*(//|\*|/\*)'
```

結果は **空**だった。私はこれを「非コメント行の変更はゼロ = 合格」と読んだ。

**このコマンドは壊れていた。** 途中の `grep -vPz` が `-z` により入力全体を1レコードとして扱い、出力を握り潰していた。フィルタを正しく書き直すと、実際には**非コメント行が2箇所変わっていた** (`description` prop と `assertNever` のエラーメッセージ)。

つまり:

> **私は「0件だった」と「何も見ていなかった」を区別できないまま、委譲された成果物を受け入れかけた。**

これは 04 §1.3 が verify に見つけた欠陥と、**論理的に同一の形**である。そして report-00 §2.1 が L6 を賞賛した理由そのものでもある。

> もし L6 がなければ「緑が出た」は「チェッカが壊れていて何も見ていない」と区別がつかない (report-00 §2.1)

私を救ったのは規律ではなく偶然である。サブエージェントの報告書に「description属性を変更した」「エラーメッセージを変更した」と書かれており、**自分の検査結果と報告が食い違ったので、直接 diff を見た**。報告が無ければ、あるいは報告を読み飛ばしていれば、私は壊れた検査の空の出力を根拠に受け入れていた。

ここから引き出せることが2つある。

1. **受け入れ検査は、自分が何件見たかを出力しなければならない。** 「違反 0 件」ではなく「N 件を検査して違反 0 件」でなければ、検査が動作したことの証明にならない。これは今回 verify に実装した内容と完全に同じ要求である。**私は同じ日に、同じ誤りを、自分の道具では直し、自分の手順では踏んだ。**
2. **review-01 §5.1 の帰属分析は正しい。** 私が委譲を安全に受け入れられた実際の理由は、私の検査ではなく (a) **サブエージェントが正直に報告したこと**、(b) **委譲した層 (コメント) が持ちうる権限の上限が低かったこと**、の2つだった。検査は壊れていた。

**［質問］04 の筆者へ**: この事例は、`verify` の「Scanned: N files」出力が**人間側の受け入れ手順にも同じ形で必要**であることを示していると思う。すなわち「サブエージェントの成果物を受け入れる手順」自体が、件数を申告する形でなければならない。これは `HUMAN_GUIDE` の並列委譲の節に書く価値があるか、それとも道具の話に留めるべきか。

---

## 4. 【第1弾時点】実装しなかったもの (と、その理由)

> **この節は第1弾終了時点のスナップショットである。この後、著者の許可を得て大半を実装した。**
> **現時点の残件は §D が正である。** 下表の「その後」列を参照。

**当時の判断: すべて「著者が決めるべきこと」であり、実装者が黙って決めてよい範囲を超えている。**

| 項目 | 04 の位置づけ | 第1弾で実装しなかった理由 | **その後** |
|---|---|---|---|
| **L9 (提示層の純度)** | §3.2 / 最優先の1つ | **新しい掟は「Green の意味」を変える。** かつ私は 04 の L9 案 (`shared/ui` にも hooks 禁止) に反対しており、**L9/L10 への分割**を提案している (下記)。設計が確定していない状態で法を追加すべきではない | **✅ 実装済 (§A)。分割案を採用** |
| **書き経路の戻りパターン** | §3.5 / 群 B | 04 自身が「著者の思想判断が要る」に分類。膜語彙に関わる。`starter/` は最強の規範なので、確定していない形を置くと**それが規範になってしまう** | **❌ 未実装。最大の残件 (§D-1)** |
| **`SPACTA.md` の編集** | §3.6 | 幹の予算 (63行) は著者の裁量。04 §6 も「+9 行を許容するか圧縮するか」を著者に委ねている | **✅ 実装済 (§C.1)。63→67行 (+4)** |
| **`starter/` への route.ts 追加** | §3.4 | 参照実装への**新しい実例の追加**は、規範の追加である。コメント言語の中立化 (形式) とは性質が違う | **❌ 未実装 (§D-3)** |
| **`verify/README.md` の表の生成物化** | §3.8 | CHECKS レジストリが入ったので**実装可能になった**が、README の現行構造を変える判断が要る | **❌ 未実装 (§D-4)** |
| **`CHANGELOG.md`** | §3.9 | v0.9.1 の最終スコープが確定してから書くべき | **✅ 実装済 (§C.3)** |
| **`HUMAN_GUIDE` の §6.2 追記** | §3.7 | 文書の思想部分。著者の言葉で書かれるべき | **✅ 実装済 (§C.2)。ただし ja 版の1ファイルのみ (§D-5)** |

### 4.1 L9 について、私の提案を再掲する — **［第2弾でこの案を採用・実装した (§A)］**

04 の L9 は、1つの法に**2つの異なる関心**を融合しているため、**Spacta で唯一「1文・例外なし」で書けない掟**になっている。

| 関心 | 適用範囲 | 由来 |
|---|---|---|
| (a) **純度**: IO・非決定性を書くな | `components` と `shared/ui` に**一様** | 膜の一文 |
| (b) **状態の居場所**: ドメイン状態は Core に | `components` **のみ** (`shared/ui` の Dialog 等は hooks が要る) | report-00 §4.2「思考がどこに居るべきか」 |

分割案:

```
L9  Presentation Purity : 提示層(features/*/components/*, shared/ui/*)で
                          IO・非決定性を書くな。              ← 一様・例外なし
L10 State Locality      : features/*/components/* で状態フックを持つな。
                          ドメイン状態は Core が持つ。          ← 一様・例外なし
```

分割の最大の利点は**成長経路**である。04 が 0.10 送りにした C1 (`setState` は core 由来に限る) は、**L10 の走査範囲拡張**として自然に収まる ——「宣言に走査を追いつかせる」の型にそのまま乗る。融合したままだと、「提示純度」という名前の法を `shell.tsx` に広げることになり、名前が意味を失う。

なお、第1弾の実装で **`NOT guaranteed` に "IO / non-determinism inside components and shared/ui" と "Judgement kept out of shell.tsx" が別々の行として並んでいた**のは、この分割と対応している。2つは別の穴である。

**［第2弾での確定］** この案を採用・実装した。ただし **L10 の名称は "State Locality" から "Component Statelessness" に変えた。** 禁止対象に `useEffect` / `useLayoutEffect` を含めた結果、「状態の居場所」よりも「**components は props の純関数である**」の方が規則を正確に言い表すためである。これは reply-02 §3.2 が実装時に手書きでプロンプトに埋め込んでいた「影の掟」——「These components are pure functions of their props」——の成文化にあたる。

---

## 5. 【第1弾時点】次にやるべきこと — **この節は §D に置き換わった**

> 以下は第1弾終了時点の見立てであり、**1st と 3rd は実施済みである**。記録として残す。
> **現時点の残件は §D を参照すること。**

```
1st  L9 / L10 の設計確定 → 実装        ← 著者の判断待ち。私は分割を推す   … ✅ 実施済 (§A)
     (fixture 4つ + good-shared-ui が hooks を含んで緑になること)          … ✅ 全て達成
2nd  書き経路の戻りパターン → starter   ← 著者の判断待ち。§3.5 の設計は妥当  … ❌ 未実施 (§D-1)
3rd  SPACTA.md / HUMAN_GUIDE / CHANGELOG / README 生成物化                 … ✅ 前3つ実施済、README のみ未実施 (§D-4)
```

**インフラ側 (Step 1) は完了している。** L9 を足すのに必要な CHECKS レジストリ、fixture を回す L6 の手続き、走査件数の申告、信頼境界の印字は全て動いている。**残りは「何を検査すると決めるか」だけであり、それは思想判断である。**

---

## 6. 結び

04 の主張は、実行して確かめた限りすべて正しかった。**そして実行して初めて分かった修正が3件あった** (package.json の自己矛盾、garden への波及、L4 の走査根)。いずれも机上では見えず、走らせると壊れるか、穴が残るものだった。これは reply-02 §3.1 が「机上で『L2 の scope を広げる』は完璧に見えるが、走らせると壊れる」と書いたのと同じ種類の発見である。**この文書群では、計画と実装の往復が3回連続で同じ効き方をしている。**

そして §3 に書いたとおり、私はこの作業の最中に「壊れた検査の空の出力を合格と読む」を実演した。4つの文書が繰り返し名指ししてきた失敗モードは、道具の欠陥である以前に、**検査する側が「見た件数」を確認しない限り誰でも踏むもの**らしい。

v0.9.1 のこの第1弾を1文でまとめる。

> **verify は、自分が何を見たかを申告するようになった。そして何も見ていないときに緑を名乗ることを、やめた。**

L6 の評価は5つの文書で一致している。今回の実装は、その発想を「検証器は自分が赤を出せることを証明する」から「**検証器は自分が何を見たかを申告する**」へ一歩進めたものである。両者は同じ誠実さの2つの側面だと思う。

---

# 追記 (2026-07-26) — 第2弾: 著者の許可を得て、残りを実装した

§4 で「著者が決めるべき」として保留した項目について許可が出たため、実装した。**最終規模: 18 ファイル変更 + 5 ファイル新規 / +452 −136 行。**

## A. L9 / L10 — 掟を2つ新設した

**04 の L9 案 (1つの法に tier 条件分岐を持たせる) は採らず、私が proposal で提案した分割を採用した。**

```
L9  Presentation Purity      : features/*/components/* と shared/ui/* で
                               IO・非決定性を書くな。          ← 一様・例外なし
L10 Component Statelessness  : features/*/components/* は props の純関数。
                               状態フックを持つな。            ← 一様・例外なし
```

### A.1 禁止集合を決めるために実測した

45 ファイル (livingdoc 39 + starter 6) に対して、候補となる全パターンを事前に測った。

| パターン | livingdoc components (24) | livingdoc shared/ui (15) | starter (6) |
|---|---|---|---|
| `useState` / `useReducer` / `useEffect` / `useLayoutEffect` / `useRef` | 0 | 0 | 0 |
| `fetch(` / `new Date` / `Date.now` / `Math.random` / `crypto.` | 0 | 0 | 0 |
| `localStorage` / `sessionStorage` / `window.` / `document.` | 0 | 0 | 0 |
| `async` / `await` / `next/navigation` | 0 | 0 | 0 |
| (許容) `next/link` | 10 ファイル | 3 ファイル | 0 |

**全パターン 0 件。** したがって L9/L10 とも、既存コードを1行も直さずに導入できる。

### A.2 `window` / `document` を L9 に含めなかった

04 の案は feature components で `window`/`document` を err、`shared/ui` で info としていた。**私はどちらの tier でも禁止しなかった。**

理由は2つある。

1. **一様性を保つため。** これを禁止すると `shared/ui` に Dialog / Tabs / Combobox が書けなくなる (Escape キー処理・フォーカストラップに `document.addEventListener` が要る)。tier で分ければ書けるが、それは 04 案と同じ「例外条項つきの法」に戻る
2. **膜の関心事ではないため。** DOM イベントの配線はデータを膜の向こうへ渡さない。L9 が守るべきなのはネットワーク・永続化・非決定性であって、DOM 配線ではない

**代わりに、この判断を fixture として固定した。** `verify/fixtures/good-shared-ui.ui.tsx` は `useState` + `useEffect` + `document.addEventListener` を持つ Disclosure 相当で、**L9 が沈黙することが受け入れ条件**である。将来誰かが「L9 を hooks や DOM globals まで一様にしよう」と考えたら、この fixture が赤くなって理由を説明する。

なお `next/link` は許容し `next/navigation` は禁止した。**`<Link>` はマークアップ (宣言)、`router.push()` は命令的遷移 (IO) である。** 後者は `Effect: { type: "NAVIGATE" }` として `runEffect` を通るべきもので、livingdoc は既にそうしている。

### A.3 実測

| 対象 | L9 走査 | L10 走査 | 違反 |
|---|---|---|---|
| `livingdoc` | 39 ファイル | 24 ファイル | **0** |
| `starter` | 6 ファイル | 2 ファイル | **0** |

`✓ Laws (L1, L2, L4, L5, L7, L9, L10): No violations` — **この法一覧の文字列も CHECKS レジストリから生成に変えた** (以前はハードコードされており、L9/L10 を足しても "L1, L2, L4, L5, L7" と表示され続けるところだった)。

## B. 【新発見】L6 は「チェッカ」を検証するが、「配線」を検証しない

**これは今回の実装で最も重要な発見だと思う。**

L9/L10 の fixture 4件を足し、L6 自己テストが緑になった。しかし私はここで手を止めず、**使い捨てプロジェクトを作って実スキャンを走らせた**。

```tsx
// smoke/src/features/demo/components/Bad.tsx
const [n, setN] = useState(0);          // L10 が弾くべき
const t = new Date().toISOString();     // L9 が弾くべき

// smoke/src/shared/ui/Ok.tsx
const [open, setOpen] = useState(false); // 弾かれてはならない (tier 分離)
```

結果:

```
L9  presentation-behaviour   2 files   ✗ 1
L10 component-statelessness  1 files   ✗ 1
verify: Red   (exit 1)
```

**期待通りだった。だが、これを確かめなければ確認できなかったことがある。**

L6 が検証するのは `checkPresentationBehaviour(file, text)` という**関数**である。L6 は fixture のテキストを直接関数に渡すので、**CHECKS レジストリの `root` と `match` (=どのファイルを渡すか) を一切通らない。**

つまり:

> **glob を書き間違えて 0 ファイルしか走査しなくても、L6 自己テストは緑のままである。そして違反 0 件なので、本スキャンも緑になる。**

これは 04 が発見した「空スキャン Green」の、**チェック単位版**である。全体では 80 ファイル走査していても、L9 だけが 0 ファイルなら、L9 は存在しないのと同じで、しかも誰にも分からない。

**この穴を実際に塞いでいるのは、今回入れた `Scanned: N files` の出力である。** 私が L9=39 / L10=24 という数字を見たから、配線が効いていることを確認できた。数字が出ていなければ「緑だから大丈夫」と読んでいた。

**［提案・未実装］** L6 に「starter に対して全チェックが 1 件以上走査すること」を assert する項目を足せば、配線の回帰も自動化できる。これは数値の閾値ではなく `> 0` なので、著者の「C 的な値を決めない」方針に反しない。**次にやるべきことの筆頭だと考える。**

## C. ドキュメント

### C.1 `SPACTA.md` — **63 行 → 67 行 (+4 行 / +6.3%)**

04 §6 の懸念 (+9 行 / +14%) より小さく収まった。**掟を2つ増やしながら、幹は 4 行しか太っていない。**

| 変更 | 内容 |
|---|---|
| §1 表 | **L9 / L10 を追加** (+2行) |
| §1 表 L3 | 「**IO から戻ってくる値も含む**」を明記し、施行欄を **"Outbound (effect results): not scanned — pattern only."** に修正。**施行していないものを施行しているように書くのをやめた** |
| §1 表 L4 | 施行欄に走査範囲 (`src/**` 全体・`shared/runEffect.ts` を含む) を明記 |
| §1 表 L8 | 「**これは最低基準であり、プロジェクトはより厳しい提示語彙を課してよい**」を追記 (review-01 §4.3 / 04 A6) |
| §2 | `shell.tsx` は**任意**。starter にあるからといって空の shell を作るな (proposal-03 §3.1 の発見を掟に接続) |
| §2 | **clone info は指示ではない** — feature 間 import の理由にも `shared/ui` 昇格の理由にもならない (04 A5) |
| §4 | **指示 6: 並列委譲では上流を先に実ファイル化せよ。** 「散文の API 仕様は契約ではない。コードだけが契約である」。**verify はこれを検査しないと明記** |

### C.2 `HUMAN_GUIDE_tactical_20260725-modify.md`

| 節 | 変更 |
|---|---|
| §0-1 | 並列実装の成功の**帰属を訂正**。「衝突を防いだのは Law ではない。人間が契約を凍結したからである」(review-01 §5.2 / reply-02 §2.2 の合意) |
| §0-5 直後 | UI 統一の一文が「**調整フェーズの推奨**であって作業分割の規約ではない」ことを明記し、手順は `SPACTA.md` §4-6 にあると案内 |
| §4 | **「verify がグリーンになれば境界は保たれています」を書き換えた。** これがこの文書で最も強い過大主張だった。信頼境界の印字例を載せ、「型整合・shell の判断・Effect の戻り」は緑に含まれないと明示。L9/L10 の説明も追加 |
| §6.2 | 「潰せていないもの」に **4項目追加**: 共有上流の変更 / Law 同士の緊張 (Effect 語彙の大域化) / 書き経路の戻り / データ経由結合の**実測値** (`queries.ts` 508行・3 feature 共有・L1 は緑) |
| §6.4 | フライトレコーダーに**前提条件**を明記。「IO の結果も Action として膜を通る」が成立しなければリプレイできない。**この構想は §6.2 の穴の上に立っている** |

### C.3 `CHANGELOG.md` (新規)

Breaking (Green の意味の変更) / Added / Changed / **Known gaps (stated, not fixed)** の4節。最後の節に、書き経路の戻り・フライトレコーダーの依存・shell の判断が未検査であることを明記した。

## D. 残件 (この節が残作業の正本である)

**残件は2件ではなく 6 件ある。** うち著者の思想判断を要するのは **D-1 だけ**で、残りは機械的に実行できる。

### D-1. 書き経路の戻りパターンを `starter/` に置く 【最大・要判断】

- **これが v0.9 で唯一残っている思想上の穴である。** report-00 §4.1 が「最大の不満」とし、review-01 が実コードで実害 (失敗時に楽観的更新が取り消されない / `temp_` id がサーバへ飛ぶ) を実証し、reply-02 が「見落としだった」と認め、04 §3.5 が完全な設計 (correlationId + `EFFECT_SUCCEEDED` / `EFFECT_FAILED` + キュー式 `drain`) を出している
- **4文書すべてが同じ結論に収束している**が、膜語彙の形を決める判断なので著者の裁断がまだない。reply-02 は「第5の語彙を増やすことに賛成」と表明済み
- `HUMAN_GUIDE` §6.4 (フライトレコーダー) は**この往復が前提条件**であることを、今回 §C.2 で明記した。埋めない限り §6.4 は実装不可能な構想のままである

### D-2. L6 に「全チェックが 1 件以上走査する」assert を足す 【機械的・優先】

- §B で発見した穴。**L6 はチェッカ関数を検証するが、CHECKS レジストリの配線 (glob) を検証しない。** glob を書き間違えて 0 ファイル走査になっても L6 は緑のまま
- `starter` を回帰コーパスとして「各チェックの `scanned > 0`」を assert すれば閉じる。**閾値ではなく `> 0` なので、著者の「C 的な値を決めない」方針に反しない**
- 実装は容易。**私はこれを D-1 の次に置く**

### D-3. `starter/app/api/*/route.ts` の実例を追加

- L5 は `page.tsx` と `route.ts` の両方を走査するのに、`starter` に `route.ts` が無い (04 §1.4)。**宣言に走査が追いついた後、実例が追いついていない**
- 参照実装への実例追加は規範の追加にあたるため、第2弾でも見送った

### D-4. `verify/README.md` の検査対象表を生成物にする

- CHECKS レジストリが入ったので**実装可能になった**。`npm run docs:checks` で README の表を再生成する形
- 手書きの表は、それ自体が hope である (alpha-evaluation の指摘)

### D-5. 他の `HUMAN_GUIDE` 変種への反映 【今回発見】

第2弾で `docs_HUMAN-ONLY/ja/HUMAN_GUIDE_tactical_20260725-modify.md` を編集したが、**同一内容の変種が複数存在する**ことが判明した。

| ファイル | 状態 |
|---|---|
| `ja/HUMAN_GUIDE_tactical_20260725-modify.md` | **✅ 編集済 (今回の作業対象)** |
| `ja/HUMAN_GUIDE_tactical.md` | **✅ 同期済。** git HEAD 時点で `-modify` と**バイト単位で同一**だったため、同内容をコピーした |
| `ja/HUMAN_GUIDE.md` (17KB) | ❌ 未反映。旧主張 (「グリーンになれば境界は保たれています」「衝突ゼロで統合できました」) が残存 |
| `ja/HUMAN_GUIDE_revised.md` (20KB) | ❌ 未反映。同上 |
| `HUMAN_GUIDE.md` (英語 13KB) | ❌ 未反映。L8/L9/L10 への言及が **0 件** |
| `ja/HUMAN_GUIDE_tactical.backup-20260722.md` | **意図的に手を付けていない** (アーカイブのため) |

**どれが正本かを実装者が判断できないため、backup 以外の未反映3ファイルは著者の指示待ちとした。** 特に「`verify` が緑なら境界は保たれています」という過大主張は、今回 tactical 版で信頼境界の説明に置き換えた最重要の修正なので、正本を1つに決めた上で他を追随させるべきだと考える。

### D-6. `SPACTA.md` の英語表記ゆれの最終確認

`SPACTA.md` は元から英語なので第2弾の追記も英語で統一したが、`verify.mjs` / `garden.mjs` のコメントは**日本語と英語が混在したままである** (既存部分が日本語、今回の追記が英語)。report-00 §4.6 が問題にしたのは `starter/` の言語であり、そちらは解消済み。検証器自身のコメント言語は AI が読む規範ではないため優先度は低いが、公開時には揃えるかを決める必要がある。

## E. この2弾を通した所感

第1弾 (§1〜§3) と第2弾 (§A〜§C) で、同じ失敗モードが**3回**現れた。

1. `verify` が 0 ファイル走査で緑を返す (04 の発見)
2. 私の受け入れ検査 grep が壊れて空を返し、私がそれを合格と読んだ (§3)
3. L6 は関数を検証するが配線を検証しないので、glob を間違えても緑になる (§B)

**3つとも「検査したつもりで、検査対象が空だった」である。** そして3つとも、**件数を出力していれば即座に分かる**ものだった。

alpha-evaluation の一般則は「Law の名前がいくら広くても、走査対象が狭ければ、その差は hope のままである」だが、今回の経験から一段強められると思う。

> **走査対象が狭いことと、走査対象が空であることは、出力上で区別できない。件数を申告しない検査は、自分が機能していることを主張できない。**

これは verify にも、人間の受け入れ手順にも、L6 自身にも同じように当てはまる。
