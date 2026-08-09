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
| `vendor-sync --check` | 3つのコピーが正本と一致するか | |
| `measure` | 数を出す。推測を拒んで停止する | 良し悪しの判定（意図的にしない） |
| `mutate` | **T3 機能の往復が本当に検査されているか** | 往復の2ケース以外すべて |

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

### D-005: livingdoc は Spacta を vendor する。パッケージ化は将来
決定日 2026-08-02 / 再確認 2026-08-03

`/workspace/livingdoc/verify/` は `/workspace/spacta/verify/` の byte-for-byte コピー（38ファイル）、
`livingdoc/verify/starter/` は `starter/` のコピー（23ファイル）、エンジンは `engine/` が正本で3箇所へ配る。

**理由（2026-08-03 追記）:** パッケージ化を急がないのは、**アプリ2つ目が「何を配るべきか」を教えてくれるから。**
今決めると `verify` / `engine` / `starter` / `garden` / `metrics` のどこまでが配布物か推測で線を引くことになる。

**守る検査:** `tools/vendor-sync.mjs --check` が stale なら exit 1。

**確かめ方:** v0.10 で実際に落ちるのを見た（L3・L9・L10・roles を欠いた v0.9.x のコピーが放置されていた）。
**この文書を書いた日にも1件検出した**（`starter/package.json` の版上げが vendor 側に未反映）。

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

## 不変条件と、その防備状況

**この表が本文書の中心である。** 全部同じ強さで書かれた引継書 §5 を、実測で仕分けたもの。

| 不変条件 | 守る検査 | 確かめた？ |
|---|---|---|
| 記録器（`Recorder`）に `State` を持たせない | **`harness.selftest`**（"a State folded into an Action is rejected"） | ✅ 落ちるのを見た |
| エンジンのコピーが正本と一致 | **`vendor-sync --check`** + `runtime.serialization` の3コピー照合 | ✅ 実際に検出 |
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
`shared/spacta/` のうち `react.ts`（バインディングそのもの）以外を歩き、`react` / `react-dom` / `next`
の import を落とす。**fail-closed** ——エンジンにファイルが増えたら既定で検査対象になる。
再度植えたところ **exit 1、`src/shared/spacta/runtime.ts:21:1` を名指し**した。以下は検査を作る前の記録。


`engine/runtime.ts` の**冒頭コメント自身**がこう書いている:

> There is no `react` and no `next` in this file, and there must never be one.
> That is the unit that gets ported to SwiftUI or Compose.

`import { useState } from "react";` を植え、`vendor-sync` で3コピーに配布した結果:

```
verify (starter)          Green, exit 0
verify (livingdoc)        Green
runtime.serialization     48 assertions, all passed
vendor-sync               3 file(s) written（黙って配った）
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
