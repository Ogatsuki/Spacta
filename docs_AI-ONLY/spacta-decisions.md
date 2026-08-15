# Spacta 決定ログ

**この文書の目的は1つ。決定を記録し、その決定を守っている検査を名指しすること。**
そして守る検査が無いときは、**「無防備」と書くこと。**

これは `SPACTA.md` の「穴があること自体は許される。穴を隠すことは許されない」を、
コードではなく**決定**に適用したものである。

---

## なぜこの文書が要るのか

v0.11 の作業を引き継いだ AI が、いちばん助かったのは `SPACTA.md`（79行）ではなく引継書だった。
掟は79行で学べる。しかし「**このプロジェクトが今どこにいて、何が決着済みか**」を機械から引く手段が無く、
前任者が手で書いた散文に依存していた。それが無ければ §3.3 や §3.5 を平気で蒸し返していた。

同時に、引継書には**危険な性質**があった。決定と不変条件が**全部同じ強さで書かれていた**ため、
読む側は「守られている」と誤読する。実際に測ったら**半分は無防備**だった。

### 書き方

```markdown
## D-000: 一文で言える決定
決定日 / 根拠（実測値があれば数字で）
理由: なぜそう決めたか。**再検討を止めるためではなく、再検討の条件を示すために書く**
守る検査: 検査名 —— または「なし（無防備）」
確かめ方: その検査が本当に落ちることをどう確認したか
```

**「守る検査」は推測で書かない。** 穴を植えて確かめてから書く。
この文書の初版は全項目をそうやって埋めた（2026-08-03）。

---

## 検査の地図

| 検査 | 何を見るか | 見ないもの |
|---|---|---|
| `verify` | AST の構造。掟 L1〜L10 | **振る舞い。原理的に見えない** |
| `tsc --noEmit` | 型の整合 | 実行時の一切 |
| `crosscheck` | **再現性のみ**（run とその replay の一致） | 振る舞いの正しさ。**間違っていても決定論的なら通す** |
| `runtime.serialization` | 状態の assertion | 書かれていない振る舞い |
| `harness.selftest` | crosscheck が仕込んだ乖離を検出できるか | |
| `smoke-package` | pack → install → 実走。`files`/`exports`/`bin` の間違い | 中身の正しさ（動くかだけを見る） |
| `measure` | 数を出す。推測を拒んで停止する | 良し悪しの判定（意図的にしない） |
| `mutate` | **T3 機能の往復が本当に検査されているか** | 往復の2ケース以外すべて |
| `eslint` | **1ファイルの中身**（未使用束縛・危険な正規表現・不可視文字） | ファイル間の関係。**掟ではない —— Advice 層（D-009）** |

**実測（2026-08-03、`bun tools/mutate.mjs ../livingdoc`）:**
10変異中 **5つ生き残り**。そして **`crosscheck` は10変異中1つも殺さなかった。**
殺したのは全部 `runtime.serialization`。振る舞いを守れるのは状態 assertion だけである。

---

## 決定

### D-001: Effect は機能が持つ。共有 `Effect` union は復活させない
決定日 2026-08-02（v0.11）/ 実測 `effectUnion.shared = 0`

各機能が `features/<name>/types.ts` で自分の `Effect` を宣言し、`features/<name>/perform.ts` で実行する。
2機能が同じ Effect を使うなら**両方に書き出す**（現在 `NAVIGATE` / `SAVE_TRACE` / `SET_BOOKMARK` /
`SET_PAGE_WATCH` の4つが重複）。

**理由:** 2つの画面を縛っているのは**エンドポイント**であって宣言ではない。`/api/bookmarks` を変えれば
共有宣言があろうと両方壊れる。共有宣言はその結合を守っていたのではなく、管理しているように見せていた。

**守る検査:** `measure` が `effectUnion.shared` を数える。**ただし報告するだけで exit code に触れない。**
共有に Effect を1つ戻しても、数字が 0 → 1 になるだけで**何も落ちない。**

**確かめ方:** 未実施。数字を読む人間が要る。

---

### D-002: L4 は2つの終端形を持つ
決定日 2026-08-02（v0.11）

`assertNever` は2メンバ以上の union でないと書けない（TypeScript が1要素 union を潰す）。
機能ローカル perform では1メンバが普通になるので、第2形を認める:
**`default` を持たない switch を、`undefined` を返せない関数の最後の文として置く**（TS2366）。

3条件すべてが効いている。1つでも欠けると保証が消える。

**守る検査:** `verify` L6 自己テスト + 検体3つ
（`verify/fixtures/good-perform-single.ts` / `bad-perform-fallthrough.ts` / `bad-perform-untyped.ts`）。
**この3つを壊さないこと。**

**確かめ方:** L6 は既知違反を必ず reject する設計。検体が3つとも生きていることを毎回 verify が確認する。

---

### D-003: 機能はデータ層を import しない
決定日 2026-08-02（v0.11）/ 実測 `features/** → shared/source` = **0件**

読みは `app/**`（サーバ境界）経由で `InitData` として一発だけ入る。

**理由:** 型だけの import なら実行時依存は増えない（実際 49箇所中47が `import type`）。
守っているのは実行時依存ではなく、**「機能を読む人がデータ層を見に行かずに済むこと」**である。
型の import は実行時には消えても、読む人の頭からは消えない。

**守る検査: `verify` の `data-layer-import`**（2026-08-03 に追加。掟ではない遮断検査、`spacta@c494529`）。
livingdoc では64ファイルを歩いて0件。`import type` も落とす——実行時依存は増えないが、
守っているのは実行時依存ではなく参照範囲だから。

**確かめ方（2026-08-03、検査を作る前と後の両方）:**
`features/saved/types.ts` に `shared/source/queries` の import を植えた。

| | 結果 |
|---|---|
| 検査を作る前 | **`verify: Green`, exit 0。何も言わなかった** |
| 検査を作った後 | **exit 1**、`src/features/saved/types.ts:5:1` を名指し（type-only import でも落ちる） |

検体 `verify/fixtures/bad-data-layer.types.ts` / `good-data-layer.types.ts` を L6 自己テストに載せた。
`good-` の方は本文に "shared/source" という文字列を持つが黙る——**検査が読むのは module specifier であって単語ではない**
（`grep -rl "shared/source" src/features/` が2件出るのはどちらもコメントだからで、文字列一致で数えてはいけない）。

---

### D-004: `ModerationCommand` は共有に残す
決定日 2026-08-02（v0.11・実測による訂正）

moderation 専有に見えるが `shared/source/mutations.ts` と `app/api/admin/route.ts` も読んでいる。
**機能とサーバの通信契約**であり、機能に持ち帰ると `shared/source` が機能内部を import することになり L7 違反。

**理由:** 型の引力は実在するが、向いている先は他の機能ではなく**サーバ**である。

**守る検査:** L7（shared は features の内部を import しない）が部分的に守る。
機能へ移せば `shared/source/mutations.ts` の import が L7 違反になる。

**確かめ方:** 未実施（L7 の走査範囲から演繹しただけ）。**植えて確かめること。**

---

### D-005: Spacta は npm パッケージとして配る。vendor は終了
決定日 2026-08-13（v0.11）/ **2026-08-02 の「vendor する。パッケージ化は将来」を覆した決定である**

エンジンと検証器を**1パッケージ・1バージョン**で配る。`npm install spacta` で
`spacta/runtime` / `spacta/react`（`dist/` の実体）と `spacta-verify` / `spacta-measure` /
`spacta-garden` / `spacta-init` が同時に入る。
**利用者の木にエンジンのコピーは1つも置かない** —— `starter/src/shared/spacta/` は削除し、
`shell.tsx` は `spacta/react` を import する。

**理由:** 旧決定は「アプリ2つ目が何を配るべきかを教えてくれる」から待つ、というものだった。
待っている間に**同じ穴を2回踏んだ**（v0.10 で v0.9.x のコピー、v0.11 で `starter/package.json` の版ずれ）。
そして境界は2つ目のアプリを待たずに決まった —— **エンジンと検証器は1つの契約の両半分である。**
`verify/fixtures/` は `engine/` が生む形をそのまま符号化しているので、
この2つがバージョンの水準で離れられる配布は、この仕組みが消しに来た腐り方をそのまま再現する。
`mutate.mjs` と `replay/scenarios.mjs` だけが配布物から外れる（参照アプリを相対パスで掴むので、着地先で走れない）。

**守る検査:** `tools/smoke-package.mjs` —— pack して、このリポジトリを一度も見ていない
スクラッチ・プロジェクトに install し、**エンジンの往復・replay の cross-check・3つの CLI を実際に走らせる。**
`files` / `exports` / `bin` の間違いを見られるのはここだけで、リポジトリ内の他の緑は全部そのまま緑になる。
配ってはいけないもの（`mutate.mjs`・`scenarios.mjs`・`docs_HUMAN-ONLY/`・決定ログと未決事項）の**不在**も
同じ場所で assert する。CI の `package` ジョブが毎回走らせる。

**確かめ方:** 実走。`smoke` は「コーパスが同梱されていない」「fixtures が落ちた」を実際に赤にできる
——`verify` の L6 の3行（self-test / wiring / docs）がそれぞれ別の同梱物を必要としており、
1つでも欠けると出力から消えるので、それを assert している。

---

### D-006: `id?: string` を `data?: R` に吸収した
決定日 2026-08-03（v0.11）/ `spacta@5ef2c17` `livingdoc@cec9577`

Effect の答えは**1本の経路**（`data`、型は機能が宣言）だけを通る。サーバ発行の id もページの行も同じ経路。

**理由:** engine は `id` を一度も読んでいなかった（コピーするだけ、分岐なし）。`verify` は存在すら知らなかった。
実消費は `pageview/core.ts` の1箇所のみ。git log が決定的だった——
`v0.11: an Effect may answer with data, **not only an id**` ＝ `data?: R` は `id` を**置き換えず横に足された**残骸。

**守る検査: なし（無防備）。** engine の型が唯一の防波堤。
`{ id?: string; data?: R }` に戻しても、掟も検査も何も言わない。

**確かめ方:** 未実施。

---

### D-007: 読みモデルは `shared/readmodels.ts`。`shared/source/` へは移さない
決定日 2026-08-03（v0.11）/ 実測 `contract` 195→37行、`readModel` 179行

**理由:** `shared/source/` へ移すと D-003 の0件が壊れる。`shared/` に置けば矢印は伸びない。
`measure` に `readModel` ゾーンを足したので、契約と読みモデルを分けて測れる（数字の連続性はここで切れる）。

**守る検査:** D-003 と同じ = **`verify` の `data-layer-import`**（2026-08-03 に追加）。
読みモデルを `shared/source/` へ移せば、それを import する `features/*/types.ts` が落ちるようになった。

**確かめ方:** D-003 と同じ植え込みで両方向を確認済み。

---

### D-008: UIの一貫性は Frame / Vocabulary / Components の3層に分離する。L8はVocabularyのみをinfoで検査する
移設: 日付不明（v0.11期間中。旧α評価「統一プレゼンテーション層」節より移設。元の記述に日付情報なし）

構造検証（L1〜L7）がグリーンでも、UI体験の一貫性は保証されない。実例：`idea-vectorizer`（ライトUI）と
`dashboard`（ダークUI）は verify・tsc・build すべてグリーンのまま、別アプリのような見た目になった。
原因は共有デザイントークンの欠如。

**理由:** 「構造はグリーンなのに体験は揃わない」を解消するには、UIの責務を3層に割る必要がある。

1. **Frame** — ヘッダーや外殻は `app/layout.tsx` + `shared/ui` に引き上げ、機能間で共有する。shellはメインコンテンツ領域に専念する
2. **Vocabulary** — 色・余白・角丸は tokens/theme に置く。データに `types.ts` があるように、見た目にもトークンがある
3. **Components** — 機能固有のUI部品は機能の `components/` に閉じ、重複を許容する。**共有するのは完成したUIではなく語彙。** 同じトークンから描かれていれば、重複していても見た目はずれない

**守る検査:** `verify` の L8（Presentation Purity）。**ただしinfoのみでexit codeを変えない。**
検出対象は意図的に3分割: グレースケール系（`gray`/`slate`等 → `background`/`foreground`等への言い換えを促す）、
色+不透明度（`fuchsia-400/10`等 → セマンティックトークン+opacityへ）、
ステータス色（`red`/`green`/`amber`/`blue`系は許可 —— 意味が色に固定されており出現頻度も高いため）。
**L8が守るのは語彙の一貫性だけ。** タイポグラフィ・余白密度・コピーの質・トーン全体は検査対象外で、
`frontend-design` スキルや人間レビューに委ねる。

**確かめ方:** 初期実装（`#hex` と裸の `bg-[...]` のみ検出）には抜け道があった。色を揃えてverifyを通した後も
`bg-fuchsia-400/10` や `bg-white/[0.06]` のような「色名+不透明度」表記が残り、見た目のずれが再発した。
**裸のhexが無くても、色名+不透明度はハードコードの一種であり、light/dark自動対応を妨げる。**
L8の走査語彙を上記3分割に広げ、対応する検体を `verify/fixtures/` に追加してL6自己テストで固定した。

副次的に見つかったバグ: クローン検出（B3）が `.map()` コールバック内のJSXルート要素を親要素と誤って比較し、
親`<ul>`と子`<li>`をJaccard類似度0.9超の重複として誤検知していた。コールバック内のルートJSXは意味的に
親の子孫であり、親との比較から除外する必要がある。`verify/fixtures/clone-map-callback` を検体として追加し、
回帰を防止した。

---

### D-009: ESLint は **Advice 層**に置く。掟は10本のまま
決定日 2026-08-15 / 実測 livingdoc 2021件 → **2件**（エラー1・警告1）

lint を Law と同格の赤にしない。**`// eslint-disable-next-line` で消せるものは「失敗によって物理的に
強制される」を満たさないので、定義上 Law ではない。** そして抑制可能性は Advice 層がまさに欲しかったものである
——`verify` の info（clone / export-ownership / L8）は消す手段が無いので増える一方で、増える一方のリストは
いずれ読まれなくなる。ESLint 側は「理由つきで了承 → 不要になれば `reportUnusedDisableDirectives` が落とす」で
**例外に期限がつく。**

分担の軸は階層ではなく**参照範囲**であり、これは中心命題そのものから出てくる:

| | 参照範囲 | 何を見るか | 誰が |
|---|---|---|---|
| ファイル間の関係 | N ファイル | どれが何を import してよいか・型の所有・役割の網羅 | **`verify`** |
| 1ファイルの中身 | 1 ファイル | 未使用束縛・危険な正規表現・**目に見えない文字** | **ESLint** |

範囲が重ならないので二重統治にならない。**だから `no-restricted-imports` で L1/L7 を書き直すことはしない**
——独立に実装された2箇所は必ず食い違い、そのときどちらが正しいかを決める根拠がどこにも無い。
（単一ソースから生成するなら成立する。この区別が全てである。）

**唯一 `error` にするもの: 目に見えない文字。** 実測でこれが要る理由が出た。`normalizeQuote` の
`[\s ]` に U+00A0 が入っていた —— `POST /api/traces` と Core の両方が呼ぶ、`quote_key` がズレないことを
関数の同一性で保証している当の関数である。**このプロジェクトのゲートは全部素通りした:**
掟は置き場所と import を読む・crosscheck は決定的なら間違っていても再現する・`mutate` は往復を壊すので
正規表現の中は触らない・tsc から見れば型は `string` で実際そうである。
**中心命題の3条件（機能に閉じている／`(initData, actions[])` から再現できる／隠れ入力が無い）を
全部満たしたまま間違う欠陥**なので、その3条件を確かめる道具には原理的に見えない。
捕まえたのは `js.configs.recommended` の既定ルールだけで、プラグインは要らなかった。

**守る検査:** `verify` の `NOT guaranteed by this green` に
`Statement-level defects … run ESLint separately` を1行追加した（`tsc` と同じ扱い）。
**これは「ESLint を強制する検査」ではなく「verify が自分の穴を申告し続ける検査」である。**
SPACTA.md は1文字も変えていない —— L6 相当の自己検査を持たないものに Law を名乗らせないため。

**確かめ方:** 4つ植えて4つとも期待どおりに動いた。
(1) 正規表現内の不可視文字 → **error**、(2) 文字列と JSX テキストの全角スペース → **無言**
（日本語UIでは content として正当なので `skipStrings`/`skipTemplates`/`skipJSXText` は on のまま）、
(3) 不要になった抑制コメント → **error**、(4) 理由つきの必要な抑制 → **無言**。
設定を作る途中で2回踏んだ罠も記録しておく: 重み付けを severity だけ書き換えると
typescript-eslint が `.ts` 向けに `off` にしている base ルールまで復活し、`src/` に101件の偽陽性が出た。
**`error` のものだけ書き換え、`files` を引き継ぎ、書き換えは元の設定の直後に差し込む**
（flat config は後勝ちなので、末尾にまとめると `off` を上書きしてしまう）。

**やらないと決めたもの:** Stop フックへの追加（Law の赤と了承可能な赤が同じ `reason` に混ざると
どちらを先に直すか判断できない。CI の別ジョブで足りる）、`eslint-plugin-spacta` の生成（唯一の本物の筋だが
痛みが出ていない。トリガーは `doc-dev/spacta-eslint-kentou.md` 案10 に測れる形で書いてある）。

---

## 不変条件と、その防備状況

**この表が本文書の中心である。** 全部同じ強さで書かれた引継書 §5 を、実測で仕分けたもの。

| 不変条件 | 守る検査 | 確かめた？ |
|---|---|---|
| 記録器（`Recorder`）に `State` を持たせない | **`harness.selftest`**（"a State folded into an Action is rejected"） | ✅ 落ちるのを見た |
| エンジンの正本が1つしか無い | **構造で閉じた（D-005）** —— コピーが存在しないので照合する対象が無い。配布物が壊れていないことは **`smoke-package`** | ✅ 実走 |
| Effect のループを2つ書かない | **L4 effect-runtime**（手書き switch を `src/**` 全体で走査） | ⚠️ 部分的（`createRuntime` の複製は見ない） |
| T3 機能の往復が実際に動く | **`runtime.serialization`** の状態 assertion | ⚠️ **10変異中5つ生き残り**（下記） |
| **エンジンに `react` も `next` も入れない** | **`verify` の `engine-portability`** | ✅ 両方向を見た（下記） |
| **機能はデータ層を import しない（0件）** | **`verify` の `data-layer-import`** | ✅ 両方向を見た（D-003） |
| 掟は10本のまま | **なし（無防備）** | — |
| 膜語彙は4つのまま（State/Action/Effect/InitData） | **なし（無防備）** | — |
| 答えの経路は1本（`data` のみ、`id` を戻さない） | **なし（無防備）** | — |

**2026-08-03 の作業で、無防備が5件 → 3件になった。** 残る3件はいずれも
「型や掟の*本数*についての約束」で、AST を歩いて数えるのとは種類が違う（そこが難しさである）。

### エンジンへの `react` 混入は誰も止めなかった → 止まるようになった（2026-08-03）

**追記（同日、`spacta@c494529`）:** `verify` に `engine-portability` を足した。
`react.ts`（バインディングそのもの）以外を歩き、`react` / `react-dom` / `next` の import を落とす。
**fail-closed** ——エンジンにファイルが増えたら既定で検査対象になる。
再度植えたところ **exit 1、`src/shared/spacta/runtime.ts:21:1` を名指し**した。以下は検査を作る前の記録。

**D-005（パッケージ化）後の走査範囲:** 利用者の木にエンジンのコピーはもう無いので、この検査は
**`spacta` パッケージ自身の `engine/`**（`files` に入るので `node_modules/spacta/engine/` にも在る）を必ず歩く。
対象プロジェクトが `src/shared/spacta/` を手で抱えていればそちらも歩く。
**0ファイル走査で緑になる経路を残さないため**であり、配布形式が変わっても「見ていない」が
「違反が無い」に化けないようにしてある。


`engine/runtime.ts` の**冒頭コメント自身**がこう書いている:

> There is no `react` and no `next` in this file, and there must never be one.
> That is the unit that gets ported to SwiftUI or Compose.

`import { useState } from "react";` を植え、当時の同期スクリプトで3コピーに配布した結果:

```
verify (starter)          Green, exit 0
verify (livingdoc)        Green
runtime.serialization     48 assertions, all passed
sync                      3 file(s) written（黙って配った）
```

**移植可能性という設計の中心が、散文でしか守られていない。**
検査を1本足すのは容易（`engine/` 配下の import を許可リストで縛る）。

### 往復の無防備 → 塞いだ（2026-08-03 `mutate` 実測、同日対処）

**初回（`spacta@9fa8198`）:**

```
SURVIVED  draft       answer-ignored / failure-uncompensated
SURVIVED  watchlist   answer-ignored / failure-uncompensated
SURVIVED  pageview    failure-uncompensated
killed    moderation x2, saved x2, pageview answer-ignored
→ 10 mutation(s): 5 killed, 5 survived
```

`draft` と `watchlist` は**振る舞いの assertion が1つも無かった**。両方とも T3 を申告しており、
`verify` には言うことが無く、`crosscheck` は壊れた振る舞いを正しいものと同じ忠実さでリプレイしていた。

**対処後（`spacta@510a012`）:** `runtime.serialization` に実機能の状態 assertion を追加（48 → **72 assertions**）。

```
→ 10 mutation(s): 10 killed, 0 survived  (exit 0)
```

殺したのは**全部 `runtime.serialization`**。`crosscheck` は前後どちらでも1つも殺していない
——自分の文書が言っている通り（run とその replay を比べるので、間違っていても決定論的なら通る）。

draft で足した assertion のうち1つは特筆に値する。**保存が飛んでいる間に読者が打ち続けた場合、
答えは「送ったスナップショット」を確定させる**——画面の新しい本文ではなく。
`draft/types.ts` のコメントはこれを説明していたが、何も検算していなかった。

---

## 次にやるべきこと（この文書から導かれる順）

**2026-08-03 に 1〜3 を実施済み。** 以下は残り。

- [x] ~~`draft` / `watchlist` / `pageview`(補償) に状態 assertion~~ → `510a012`、0 survivors
- [x] ~~エンジンの import を検査する~~ → `c494529`、`engine-portability`
- [x] ~~`features → shared/source` を検査にする~~ → `c494529`、`data-layer-import`
- [ ] **`mutate` を CI ゲートに入れるか判断する**（今は exit 1 = 測定結果であって故障ではない。
      ゲートにすると「新機能を足したら survivors が出る」が赤になる——それは正しいのか？）
- [ ] **`mutate` の変異を増やす。** 現在は往復の2ケースだけ。Effect の構築、validation、
      補償の*中身*（正しい行を戻しているか）は無傷で通る
- [ ] 残る無防備3件（掟10本・膜語彙4つ・答えの経路1本）に手が届くか検討する

**この文書の使い方は「散文で守っているものを検査に変える」であり、上の3件はその実例である。**

---

## この文書自身の限界

- **`mutate` が見るのは T3 機能の2ケースだけ。** Effect の構築、validation、描画、データ層は無傷で通る。
- **殺された変異は「どれかのゲートが気づいた」だけで、「正しい理由で気づいた」ではない。**
- 「守る検査: なし」と書かれた項目は、**次にそれを壊す人を止められない。** 止めたいなら検査を書くこと。
- この文書は append-only で運用する。**決定を消さず、覆すときは新しいエントリで覆す**（理由が残らないと同じ議論を繰り返す）。
