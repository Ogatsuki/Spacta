# Spacta v0.11 — 引継書

**この文書と `/workspace/spacta/SPACTA.md` の2枚で完結する。他の文書は読まなくてよい。**

`docs/spacta-genzaichi-3.md`（v0.10 指示書）、`docs/spacta-v0.11-jissou-keikaku.md`（v0.11 計画）、
`docs/measurements/**`（測定記録）は**開かなくてよい**。必要なことは全部ここに写してある。
開いてよいのは `SPACTA.md`、`/workspace/spacta/` と `/workspace/livingdoc/` の実コード、そしてこの文書。

作成: 2026-08-02 / 前セッションからの引き継ぎ

---

## 0. 30秒で現在地

| | |
|---|---|
| リポジトリ | `/workspace/spacta`（道具）と `/workspace/livingdoc`（検証台アプリ）。**別々の git リポジトリ** |
| ブランチ | 両方とも `feature/v0.11-feature-local-effects`。**両方 clean、全部コミット済み** |
| 状態 | **全ゲート緑。** v0.11 の主要作業は完了。残っているのは §4 の4件 |
| git 管理 | ⚠️ `/workspace/docs/` は **git 管理外**。この文書も版管理されていない |

**v0.11 が何をした版か、1文で:**

> **掟を1本も増やさずに、Effect の語彙を共有契約から各機能へ返した。** 共有 `Effect` union は消滅し、各機能が自分の `types.ts` で Effect を宣言し自分の `perform.ts` で実行する。

---

## 1. まず走らせるコマンド（作業前に全部緑を確認すること）

この環境には **node / npm が無い。bun だけがある。** `package.json` の scripts は `node` と書いてあるが、手で `bun` に置き換えて走らせる。

```bash
cd /workspace/spacta && bun verify/verify.mjs ../livingdoc      # → verify: Green
cd /workspace/spacta && bun verify/verify.mjs starter           # → verify: Green
cd /workspace/livingdoc && bun ./node_modules/typescript/lib/tsc.js --noEmit   # → exit 0
cd /workspace/spacta && bun replay/crosscheck.mjs               # → 13 checks
cd /workspace/spacta && bun replay/harness.selftest.mjs         # → 12 assertions
cd /workspace/spacta && bun replay/runtime.serialization.test.mjs # → 30 assertions
cd /workspace/spacta && bun tools/vendor-sync.mjs --check        # → every copy matches
cd /workspace/spacta && bun metrics/measure.mjs ../livingdoc     # → JSON を標準出力へ
```

**`dev` サーバと D1 は起動できない**（`workerd` バイナリが無い）。実行時確認は不可能で、実効的なゲートは
**verify 緑 + tsc 0エラー + 上のテスト群**である。これは前セッションと同条件。

### ⚠️ vendor-sync を忘れないこと

`/workspace/livingdoc/verify/` は `/workspace/spacta/verify/` の **byte-for-byte コピー**（35ファイル）で、
`/workspace/livingdoc/verify/starter/` は `/workspace/spacta/starter/` のコピー（22ファイル）である。
エンジンは `/workspace/spacta/engine/` が正本で3箇所に配られる。

**`spacta/verify/`・`spacta/starter/`・`spacta/engine/` のどれかを触ったら必ず:**

```bash
cd /workspace/spacta && bun tools/vendor-sync.mjs
```

`--check` は stale なら **exit 1**。忘れると `livingdoc` 同梱の検証器だけが古いまま静かに残る
（v0.10 で実際に起きた。L3・L9・L10・roles を欠いた v0.9.x のコピーが放置されていた）。

---

## 2. 現在の数字（`measure` の出力。作業後にこれと比べる）

```
zones:  feature 63f/4378L   engine 2f/307L    contract 1f/199L   sharedUi 15f/404L
        dataAdapter 7f/1240L   sharedOther 2f/68L   framework 24f/802L
effectUnion: { members: 11, shared: 0 }
tiers: pageview T3, draft T3, moderation T3, saved T3, watchlist T3,
       materialrequest T2, catalog T1, search T1, profile T1, tracetype T1
```

**`shared: 0` が v0.11 の到達点である。** 共有契約に Effect メンバは1つも残っていない。

---

## 3. v0.11 で決まったこと — 蒸し返さないこと

以下は**著者が決定済み**か、実測で確定した事実である。再検討しないこと。

### 3.1 Effect は機能が持つ [決定]

- 各機能が `features/<name>/types.ts` で自分の `Effect` を宣言し、`features/<name>/perform.ts` で実行する
- **共有 `Effect` union は存在しない。** 復活させないこと
- 2機能が同じ Effect を使う場合は**両方に書き出す**（`SPACTA.md` §2「duplication over coupling」）。
  現在 `NAVIGATE` / `SAVE_TRACE` / `SET_BOOKMARK` / `SET_PAGE_WATCH` の4つが重複宣言されている。
  **これは減らすべき数ではない。** 2つの画面を縛っているのはエンドポイントであって宣言ではなく、
  共有宣言はその結合を守っていなかった（管理しているように見せていただけ）
- `shared/runEffect.ts` に残っているのは `post` / `del` の**輸送だけ**。これは機構であって語彙ではない
  （判定基準: **機能を1つ足したときに変わるか**。`post` は変わらない）

### 3.2 L4 は2つの終端形を持つ [決定]

`assertNever` は **2メンバ以上の union でないと書けない**。TypeScript が1要素 union を潰すため。
機能ローカル perform にすると1メンバの Effect が普通になる（現在 6機能中3つ）。

そこで L4 は第2の形を認める:

> **`default` を持たない switch を、`undefined` を返せない関数の最後の文として置く。**
> メンバ追加は **TS2366（Function lacks ending return statement）** になる。

**3条件すべてが効いている。** 1つでも欠けると保証が消える:

| 条件 | 欠けると |
|---|---|
| `default` が無い | default が飲み込む |
| 関数本体の**最後の文** | switch の後に `return` があると TS2366 が永久に発火しない |
| 戻り値型が `undefined` を含まない | 推論型が undefined を含み、値を返さず終われてしまう |

検体が3つある（`verify/fixtures/good-perform-single.ts` / `bad-perform-fallthrough.ts` /
`bad-perform-untyped.ts`）。**この3つを壊さないこと。**

### 3.3 データ層は Spacta の管轄外 [決定]

`SPACTA.md` §3 に明記済み。`src/features/**` から `shared/source` への import は **0件**であり、
読みは `app/**`（サーバ境界）経由で `InitData` として一発だけ入る。

**この 0件 を壊さないこと**（§4-1 の注意点を参照）。確認は import 文で取ること:

```bash
cd /workspace/livingdoc && grep -rn 'from "@/shared/source' src/features/   # → 0件
```

`grep -rl "shared/source" src/features/` は**2件出るが、どちらもコメントである**
（`moderation/types.ts` と `moderation/perform.ts` が §3.5 の理由を説明している）。
文字列一致で数えないこと。

### 3.4 livingdoc は Spacta を vendor する [決定]

パッケージ化（npm）は**将来の課題**。この環境には npm が無く `starter/node_modules` も無いので検証不能。
当面は `tools/vendor-sync.mjs` で運用する。

### 3.5 実測で分かった訂正 [確立]

- **`ModerationCommand` は共有に残す。** moderation 専有に見えるが、`shared/source/mutations.ts` と
  `app/api/admin/route.ts` も読んでいる。**機能とサーバの通信契約**であり、機能に持ち帰ると L7 違反。
  型の引力は実在するが、向いている先は他の機能ではなく**サーバ**である
- **`pending` はどのコンポーネントからも読まれていない**（moderation / pageview とも）。
  「行が無効化されたまま残る」という症状は発現しない

---

## 4. 残っている作業 — 4件

**優先順に並べてある。1件ずつ、ゲートを回してからコミットすること。**

### 4-1. 【完了】`shared/types.ts` の読みモデル → **(b) を選択**

> **2026-08-03。著者判断で (b)。** `livingdoc@5bc6385` / `spacta@57723cc`。
>
> 読みモデル約155行を **`src/shared/readmodels.ts`** に分離。`shared/types.ts` に残ったのは
> `ModerationCommand`（§3.5・サーバとの通信契約）と `assertNever` の**2つだけで 195 → 37行**。
> import 文 **55箇所 / 49ファイル**を書き換えた。
>
> **(c) を採らなかった理由**（前セッションの結論を実測で裏付けた）: `shared/source/` へ移すと
> `features/*/types.ts` がデータ層を import する。**import は全部 `import type` なので実行時依存は
> 1本も増えない**（49箇所中47が type-only、値 import は `assertNever` の2件のみ）。
> それでも採らなかったのは、守っているのが実行時依存ではなく
> **「機能を読む人がデータ層を見に行かずに済むこと」**だから。型の import は実行時には消えても、
> 読む人の頭からは消えない。**分離後も `features/** → shared/source` は 0件を維持**（確認済み）。
>
> **`measure` のゾーン定義を変更した**（数字の連続性が切れることは承知の上）:
> `ZONE_ORDER` に `readModel` を `contract` の隣に追加。放置すると `sharedOther` に落ちて
> 輸送層と混ざり、同居を1ファイル分ずらしただけになる。
>
> | ゾーン | 前 | 後 |
> |---|---|---|
> | contract | 1f/195L | **1f/37L** |
> | readModel | — | **1f/179L** |
> | sharedOther | 3f/267L（混ざった状態） | **2f/88L**（元に戻った） |
>
> `readmodels.ts` は verify の役割表で `shared`（L7 が届く）に落ちる。**platform 表の変更は不要。**
> starter は `readModel: 0f/0L` と出るだけで `die()` しない。
> `metrics/baseline/*.json` を読むコードは無いので壊れるゲートも無い。
>
> **確認済み:** `src/lib/` にファイルを植えると `measure` は今も exit 1 で止まり名指しする
> （catch-all を足していない）。

### （原文）4-1. 【要判断】`shared/types.ts` の読みモデルをどうするか

`shared/types.ts`（199行）の中身は現在こうなっている:

| 行 | 中身 | 性質 |
|---|---|---|
| 18〜172 | 読みモデル型（`TraceRecord` / `TraceWithPage` / `PageSummary` / `AdminReport` …）**約155行** | データアダプターの出力の形 |
| 175 | `ModerationCommand` | サーバとの通信契約（§3.5。動かせない） |
| 191 | `EffectResult` | 輸送契約 |
| 197 | `assertNever` | L4 のガード |

当初の計画は「読みモデルを `shared/source/` へ移す」だったが、**前セッションでこれが破綻することが分かった:**

> **移すと `features/*/types.ts` が `shared/source/**` を import することになり、§3.3 で確定した
> 「機能はデータ層を import しない（0件）」が壊れる。** そして §3.3 は `SPACTA.md` §3 に
> 書いてしまった性質である。

選択肢は3つ。**どれも一長一短で、著者の判断が要る:**

| 案 | 得るもの | 失うもの |
|---|---|---|
| **(a) 何もしない** | 0件の性質が保たれる。コスト0 | `contract` ゾーンが199行のまま。中身は「読みモデル155行 + 契約44行」の同居が続く |
| **(b) `shared/readmodels.ts` に分ける**（`shared/source/` ではなく） | 同居が解消し、measure が2つを分けて測れる。import 元は `shared/` のままなので0件も保たれる | `measure` の `contract` ゾーン定義（`src/shared/types.ts` 決め打ち）を直す必要がある。新ファイルの役割が verify で引けるか要確認 |
| **(c) `shared/source/` へ移す** | 読みモデルがデータ層と同居し、圏が揃う | **0件が壊れる。** `SPACTA.md` §3 の記述を書き換えることになる |

**私の推奨は (b)。** ただし `measure` のゾーン定義に手を入れることになるので、
数字の連続性が切れることを承知の上で。**(a) も十分に正当な選択である**（急ぐ理由がない）。

**判断せずに着手しないこと。**

---

### 4-2. starter に `perform.ts` を置く（`feature-internal` の検証穴を閉じる）

> **【完了】2026-08-03。** `spacta@aebd877` / `livingdoc@896e2c3`（ブランチ `feature/v0.11-completion`）。
> 受け入れ条件は4つとも満たした。`verify` の `NOT guaranteed` 行は
> `boundary, test, unscoped, ignored` の4つになり `feature-internal` が消えた。
> `sample` は T3 のまま、corpus は 17 → 18 ファイル、`measure starter` exit 0。
>
> **穴を両方向から実証してから復元した**（§5 の「一度も落ちるのを見ていない検査は検査ではない」）:
>
> | 状態 | `feature-internal` に L2 を主張させる（嘘） |
> |---|---|
> | `perform.ts` あり | **検出。exit 1**「no such check walked src/features/sample/perform.ts」 |
> | `perform.ts` 退避 | **素通り。verify: Green, exit 0** |
>
> 素通りする理由は `verify.mjs` の `roleCoverage()` が `if (files.length === 0) continue`
> でファイル0件の役割を飛ばすため。**役割は主張していたが、検算対象が1件も無かった。**
>
> 触った範囲: `sample/{types,perform,shell}.ts(x)`、`shared/{types,runEffect}.ts`、
> `app/api/sample/route.ts`、`README.md`。README は旧 Form（共有 union + 共有 switch）を
> 教えていたので実態に合わせた。`shared/runEffect.ts` は名前を残した（§4-4-a の改名は保留のまま）。

**これが4件のうち最も重要である。**

現在 `verify` は毎回こう印字している:

```
- Law claims of roles the reference corpus has no file of → unverified —
  L6 measures ROLES[].laws against starter/, which holds no file of role:
  boundary, feature-internal, test, unscoped, ignored
```

**そして v0.11 で作った6つの `perform.ts` は、全部この `feature-internal` に落ちている。**
つまり**機能の IO を全部担うファイルが、役割主張が一度も検算されていない役割にいる。**
`feature-internal` は L1 と L4 を主張しているが、role-claim テスト（過去に `layout.tsx` が
L5 を主張しながら L5 が走査していない穴を実際に見つけた検査）がこの役割に対して走っていない。

#### やること

1. `/workspace/spacta/starter/src/features/sample/` に `perform.ts` を新設し、
   `sample` が自分の Effect を自分で実行する形にする
   （現在 starter は `shared/runEffect.ts` に `SAVE` / `LOG` の switch を持っている。
   これを v0.11 の形に直す＝**教える Form を実態に合わせる**）
2. `starter/src/shared/types.ts` から `Effect` union を落とし、`sample/types.ts` へ移す
3. `starter/src/shared/runEffect.ts` は輸送だけにする（livingdoc と同じ形）
4. `bun tools/vendor-sync.mjs` を走らせる（starter は `livingdoc/verify/starter/` にも配られる）

#### 受け入れ条件

- `verify` の `NOT guaranteed` 行から **`feature-internal` が消える**
- `bun verify/verify.mjs starter` が緑、`sample` の段位が **T3 のまま**
- L6 自己テスト / wiring テスト / role-claim テストの3層すべて緑
- `bun metrics/measure.mjs starter` が exit 0

#### 注意

starter のファイル数が 17 → 18 に増える。**これは許容してよい**（測定は完了済み）。

---

### 4-3. ロード後の読みを実機能で1つ実装する

> **【完了】2026-08-03。** `livingdoc@7683d21` / `spacta@9fe92b1`。
> 受け入れ条件は4つとも満たした。**`shared/types.ts` は0行変更**（`git diff` 空）＝機能ローカル化が完全だった証拠。
> `saved` の Effect は2メンバになり `assertNever` に戻った。`crosscheck` 13 → 14 checks（S10）、
> `runtime.serialization` 30 → **45** assertions。`measure` の `contract` は **1f/199L のまま不変**、
> `effectUnion` は 11 → 12 members で **`shared: 0` を維持**。
>
> **設計上の決定:**
> - カーソルは**最後の行の trace id**（オフセットではない）。ページ間で削除が起きるとオフセットは
>   一度も見せていない行を飛び越すため。読みモデルに列を足さずに済む点も効いた（§4-1 の制約を壊さない）
> - `splitPage` は純関数で `app/saved/page.tsx` と `app/api/bookmarks` の GET の**両方から呼ぶ**。
>   ページの切れ目について2箇所が食い違えない（L5）
> - `shared/runEffect.ts` に `get<T>` を追加。輸送であって語彙ではない（機能を足しても変わらない）
>
> **⚠️ 途中で見つけた穴（修正済み）:** `replay/drivers.mjs` の `settle()` が
> **`{ id }` だけを resolve し `data` を捨てていた。** このまま S10 を足すと Core は
> 「空のページが返った」と読んで決定論的に間違い、**crosscheck は緑のまま通過する**。
> §6 の「crosscheck は再現性しか見ない」が実際に効く場面だった。実証:
>
> | 検査 | `data` を捨てる穴を植えたとき |
> |---|---|
> | `runtime.serialization`（§8 を新設） | **FAIL, exit 1** |
> | `crosscheck` | **緑, exit 0 —— 捕まえられない** |
>
> IO スタブ自体を直接検査する assertion を追加したので、次に誰かが `settle()` を壊せば落ちる。

**配管とテストは完了済み。** エンジンは `R`（答えの型引数）を通し、`EFFECT_SUCCEEDED` に
`data?: R` が乗る。`replay/runtime.serialization.test.mjs` に8件の assertion があり、
データが Core に届くこと・記録器が答えを記録すること・リプレイが再構成できることを確認済み。

**残っているのは実際の機能で使うことだけ。**

#### なぜ要るか

`Perform` が `{ id }` しか返せなかった間、Spacta は**書けるが読めなかった**。
画面にデータが増える唯一の道は新しい `InitData`＝ナビゲーションかリロードで、
その逃げ道である `RELOAD` は10機能のどれも一度も構築していない。
無限スクロール、検索の逐次実行、投稿後の再取得は全部「実行中の読み」である。

#### やること

候補: 「あとで読む」一覧（`features/saved`）の「もっと見る」。

```ts
// features/saved/types.ts — 機能の中で完結すること
export type Effect =
  | { type: "SET_BOOKMARK"; correlationId: string; traceId: string; active: boolean }
  | { type: "LOAD_MORE"; correlationId: string; cursor: string };

export type Answer = { of: "LOAD_MORE"; traces: TraceWithPage[] };
```

`useSpacta<State, Action, Effect, Answer>` のように `R` を渡す。

#### 受け入れ条件

- **`shared/types.ts` が1行も増えないこと。** 増えたら機能ローカル化が不完全である
- `saved` の Effect が2メンバになるので `assertNever` が書けるようになる（§3.2 の第1形に戻る）
- `crosscheck` にシナリオを1本足し、`replay-sessions/` に記録が増えること
- サーバ側（`app/api/bookmarks/route.ts` か新ルート）がカーソルを受けること

---

### 4-5. 【完了】`id?: string` を `data?: R` に吸収した

> **2026-08-03。** `spacta@5ef2c17` / `livingdoc@cec9577`。**§4 には無かった項目**で、
> 4-3 の実装中に「同じ union に2つの答え方が同居している」ことが実物で見えたので著者判断で実施した。
>
> **根拠（実測）:**
> - engine は `id` を**一度も読んでいなかった**。200行目で右から左へコピーするだけで分岐は無い。
>   `runtime.ts` の冒頭コメント自身が "Nothing here branches on a domain concept" と書いている
> - **`verify` は `id` の存在を知らない**（`grep 'EffectResult' verify/verify.mjs` → 0件）。
>   つまり掟の層は無傷で、**掟は10本のまま**（§5 の不変条件を守っている）
> - 実消費は `pageview/core.ts` の1箇所のみ。10機能が `EFFECT_SUCCEEDED` に載せていたが9つは読んでいなかった
> - git log が決定的だった: `8560bde v0.11: an Effect may answer with data, **not only an id**`。
>   `data?: R` は `id` を**置き換えず横に足された**。つまり `id` は設計思想ではなく v0.10 の残骸
>
> **結果:** `pageview` は `Answer = { id: string }` を自分で宣言する。答えを読まない5機能は
> **何も宣言しない**ことでそれを表明し、`perform` は `Promise<null>` を返す（以前は書けなかった形）。
> `shared/types.ts` から `EffectResult` が消えて **199 → 195行**。`post`/`get`/`del` は総称になった。
>
> **⚠️ 途中で見つけた、より重大な穴（塞いだ）:**
> `pageview` が**サーバの id を採用しそこねる**——`id` という仕組みが存在した唯一の理由——を
> 植えたところ、**crosscheck 14 checks も serialization 45 assertions も全部緑で通った。**
>
> | 検査 | `pageview` が id を採用しない穴 |
> |---|---|
> | `crosscheck` | **緑, exit 0** |
> | `runtime.serialization`（§9 新設） | **FAIL, exit 1** |
>
> **この穴は `id` フィールドが存在した全期間にわたって開いていた。**
> tempId のまま残る trace は完全に決定論的なのでリプレイは一致する。§9 を新設して 45 → **48** assertions。
>
> **やり残し:** `id` を復活させないことを機械的に守る検査は無い。engine の型が唯一の防波堤である。

### 4-4. 申し送り（急がないが記録しておく）

| # | 内容 |
|---|---|
| a | **`shared/runEffect.ts` に `runEffect` が無い。** 中身は `post` / `del` の輸送だけ（42行）。名前が実態と合っていない。改名すると verify の役割表（`runtime` 役割、1ファイル）に触るので保留にした。改名するなら役割の引き直しと3層自己テストの確認が要る |
| b | **`RELOAD` / `LOG` は削除済み。** 構築者ゼロだった。復活させる必要が出たら、それは機能ローカルな Effect として書くこと |
| c | **`/workspace/docs/` が git 管理外。** コードは版管理されているのに判断の根拠が残る文書は残らない。`git init` するかは著者の判断 |
| d | **両リポジトリの過去の AI 作業は `Claude <noreply@anthropic.com>` 名義**だが、v0.11 のコミットは `Ogatsuki` 名義になっている（livingdoc に identity が未設定だったため spacta に揃えた）。未 push なので付け替えは容易 |
| f | **シナリオ id の重複が検査されていない。** 2026-08-03、`S9` が既に存在するのに気付かず2つ目の `S9` を書いた。セッションファイル名が `{id}-{driver}-{feature}.json` なので上書きは起きず、`crosscheck` は 14 checks で緑のまま通った（`S9-engine-saved.json` という残骸が1つ増えただけ）。**id が重複しても誰も何も言わない。**同じ feature 名で重複させれば静かに上書きされる。`SCENARIOS` の id 一意性を `crosscheck` の起動時に確認するのは数行で済む。今回は §7 の「実装せずに追記」に従い見送った |
| e | **測定は「保留（型を揃えて再測定）」で止まっている。** v0.11 完了後に、主指標を「編集した既存ファイル（**機能内部を含む**）」に定義し直してから t5〜t8 を実施する、と決めてある。現在の主指標は機能内部の編集を数えないという既知の盲点を持つ |

---

## 5. 破ってはいけない不変条件

作業中に迷ったらここに戻る。**これらは v0.11 で実際に検算されている。**

- [ ] **掟は10本のまま。** `SPACTA.md` に L11 以降を足さない。v0.11 の変更はすべて既存の掟の*施行方法*の変更である
- [ ] **膜語彙は4つのまま**（`State` / `Action` / `Effect` / `InitData`）。`EffectOutcome` は `Action` の一種であり5つ目ではない。`R`（答えの型）も `Action` に載って渡るだけ
- [ ] **エンジン（`shared/spacta/runtime.ts`）に `react` も `next` も1文字も入れない。** そこが SwiftUI / Compose へ移る単位である
- [ ] **Effect のループを2つ目書かない。** `createRuntime` が唯一の実装。3つに分岐して2つが答えを捨てていたのが v0.10 で直した問題である
- [ ] **記録器（`Recorder`）に `State` を持たせない。** 型引数に `S` が無いのは設計であって手落ちではない。State を記録するとリプレイ照合が自分自身と比較して必ず一致し、緑に見えながら何も検証しなくなる
- [ ] **`src/features/**` から `shared/source` を import しない**（現在0件）
- [ ] **検査を足したら、それが落ちることを実際に見ること。** 「一度も落ちるのを見ていない検査は検査ではない」。v0.11 では毎回これをやった——穴を植える → 落ちることと exit code を確認 → 復元
- [ ] **穴があること自体は許される。穴を隠すことは許されない。** `verify` の `NOT guaranteed` 節、`crosscheck` の「(4) は検証不能」、`measure` が推測を拒んで停止すること——この性質を減らす変更をしない

---

## 6. 前セッションで踏んだ罠 — 繰り返さないこと

| 罠 | 何が起きたか |
|---|---|
| **`.mjs` は型検査されない** | `replay/scenarios.mjs` の S7 が `correlationId` を渡さないまま緑だった。修正した経路を一度も通らずに「13 checks passed」と出ていた。**シナリオを足したら、それが本当に狙った経路を通っているか確かめること** |
| **`crosscheck` は再現性しか見ない** | 実行とリプレイを比べるので、**間違っているが決定論的な**補償は全シナリオを通過する。振る舞いの正しさは `runtime.serialization.test.mjs` に状態の assertion として書くこと |
| **vendor コピーは黙って古くなる** | `verify/verify.mjs` を変えた瞬間 `livingdoc/verify/` がドリフトした。`tools/vendor-sync.mjs` を走らせること |
| **`git add` の残留** | 前回の失敗コミットで staged だったファイルが次のコミットに全部入った。`git status --porcelain` で第2列を確認してからコミットすること |
| **1要素 union は潰れる** | `assertNever` が書けない。§3.2 の第2形を使う |
| **`measure` は推測を拒んで停止する** | 契約の形を変えると `die()` する。これは故障ではなく設計。メッセージを読んで `metrics/measure.mjs` を直すこと |

---

## 7. 作業の型

1. §1 のコマンドを全部走らせ、**全部緑であることを確認してから**始める
2. 1件だけ着手する
3. 検査を足したなら、**穴を植えて落ちることを確認し、復元する**
4. `spacta/verify` `spacta/starter` `spacta/engine` を触ったなら `bun tools/vendor-sync.mjs`
5. §1 を全部走らせ直す。`measure` を §2 と比べる
6. コミットする（両リポジトリとも `feature/v0.11-feature-local-effects`。
   livingdoc は identity 未設定なので
   `git -c user.name=Ogatsuki -c user.email=ogatsuki.masu.5fjo@gmail.com commit`）
7. この文書の §4 の該当項目に、**何をどう決めたか**を追記する

**作業中に「これも直したい」と思ったものは、実装せずに §4-4 に追記すること。**
