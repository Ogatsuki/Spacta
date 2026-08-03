# Spacta v0.11 — 実装計画

**由来:** 2026-08-02 の分析（`docs/spacta-v0.10-kairyou-bunseki.md`）と、それに続く設計対話。
**前提文書:** `docs/spacta-genzaichi-3.md`（v0.10 指示書。§5 の保留リストは**測定完了により大半が解禁された**）

> **この文書の位置づけ:** genzaichi-4 に昇格させるかは著者の判断。昇格させるなら §0 の読書指定（何を読み、何を読まないか）を genzaichi-3 から引き継ぐこと。現時点では**実装計画**であり、現在地文書の最上位は依然として genzaichi-3。

---

## 1. この版が解く問題 — 1文で

> **L4（単一ディスパッチ地点）が、コンテキスト隔離という目的から浮いており、書き込み機能ごとに共有ファイルへの編集を強制している。これを機能ローカルな `perform` に変え、副産物として「ロード後の読み」を可能にする。**

### 根拠（すべて実測 [確立]）

`Effect` union 13メンバの構築者の分布:

| 種類 | 数 | メンバ |
|---|---|---|
| **構築者ゼロ** | 2 | `RELOAD` / `LOG` — **誰も作っていない型が共有契約に居座っている** |
| **プラットフォーム** | 1 | `NAVIGATE`（ドメインのペイロードを持たない） |
| **単一機能専有** | 7 | `SET_VOTE` `SAVE_COMMENT` `SAVE_REPORT` `MODERATE` `SAVE_MATERIAL_REQUEST` `SAVE_DRAFT` `DELETE_DRAFT` |
| **2機能が使う** | 3 | `SAVE_TRACE` `SET_BOOKMARK` `SET_PAGE_WATCH` |

**13のうち10は、共有ファイルにいる理由がない。**

そして `Perform<E> = (effect: E) => Promise<{ id?: string } | null | undefined>` により、**エンジンはデータを持って帰れない**。読みは `InitData` の一発だけで、途中で読む出口は `RELOAD`（構築者ゼロ＝一度も使われていない）しかない。

---

## 2. やらないこと [決定]

- **新しい Law を追加しない。** 掟は10本のまま。今回もすべて既存の掟の**施行方法**の変更である
- **L1 / L2 / L7 を緩めない**（genzaichi-3 補足2「循環する論法」。隔離を作っている掟は緩和検討の対象外）
- **膜語彙を5つ目に増やさない。** `EffectOutcome` は `Action` の一種。`R`（答えの型）も `Action` に載って渡るだけで、膜を越えるのは `Action` である
- **`SPACTA.md` を新規ファイルに置き換えない。** 改訂する（理由: 名前がアンカー）
- **文書を JSON / YAML 化しない。** Markdown を維持し、機械可読な正本はコード側（`CHECKS` レジストリ）に置いて生成する

---

## 3. 著者が先に決めること — 2件

| # | 決めること | 選択肢 | 影響 |
|---|---|---|---|
| ~~0-1~~ | ~~再測定のタイミング~~ | **✅ 決定済み（2026-08-02）: v0.11 を先に入れる。** t5〜t8 は v0.11 完了後に、**主指標を報告書 §4-1 の推奨どおり「編集した既存ファイル（機能内部を含む）」に定義し直してから**実施する | 報告書 §4-1 は自ら「主指標には盲点がある」と結論している。今 再測定すると、**壊れていると分かっている計器で測る**ことになる。指標を直してから測るほうが、同じコストで得られる情報が多い |
| **0-2** | **人間用ドキュメントから取り込む範囲** | 基準案: **「書かれていなかったせいで実際に欠陥が出た理由づけ」だけ** | 基準なしで取り込むと `SPACTA.md` が人間用ガイド化し、毎タスク全部読まれる文書でなくなる |

**0-1 は Phase 1 の着手前に決めること。** Phase 2 以降はベースラインを動かす。

---

## Phase 1 — 文書だけ。コード0行 [解禁済み]

**先にやる理由:** 無料で、かつ「半端に管理しているふり」をやめる作業だから。genzaichi-3 §6.4「穴を隠さない」の適用。

- [x] **1-1 データ層を管轄外と宣言する。** ✅ `SPACTA.md` に **§3 Scope** を新設（§1 / §2 / §4 と番号が飛んでいた場所）。`src/features/**` から `shared/source` への import が**0件**であること、読みは `InitData` の一発で入ること、テーブル共有の結合はどの Law も見ないことを書いた
  - **`spread` は計器として残した。** §3 に「`npm run measure` reports the `spread` … so the hole stays countable」と明記。**穴を宣言することと、計器を捨てることは別**
- [x] **1-2 sink/source 基準を精密化する。** ✅ 下記のとおり本文として確定。**genzaichi-3 §8 は遡って書き換えない**（完了した指示書を事後に修正しないため）。この点についてのみ本文書が上位:
  > **【訂正】** genzaichi-3 §8 は「データアダプターは定義上 source なので、外ではなく Spacta の管轄内に置かれなければならない」と書いているが、実態（features からの import 0件）と食い違う。正しくは:
  >
  > **Action の途中に値を注入する source は外に置けない。`init` 時点の一発注入は外でよい。**
  >
  > 理由: 記録器が `initData` を丸ごと持つため、外から来た値でも**リプレイの再現性が生き残る**（crosscheck 12本が実証）。禁じるべきは「注入が外にあること」ではなく「注入が Action の列に現れないこと」である。
- [x] **1-3 直列化の代償を1行書く。** ✅ `SPACTA.md` §3 の3つ目の項目。「One feature instance performs one Effect at a time … it is paid for in concurrency」
- [x] **1-4 L4 の文言のズレを直す。** ✅ 「the only place an Effect becomes IO」→「**the only place an Effect leaves the app.** The store itself is further out — behind that call, in `app/api/**` and `shared/source/*` — and §3 says why Spacta does not follow it there」

**受け入れ条件:** コードの差分がゼロ。`verify` / `tsc` / `measure` の出力が1文字も変わらない。 → **✅ 満たした**（Phase 1 完了時に確認済み）

### Phase 1 で見つけた申し送り

- **`docs_HUMAN-ONLY/ja/` に `HUMAN_GUIDE_tactical_20260729.md` が存在する。** genzaichi-3 §0 が「読んでよいもの」に指定しているのは `HUMAN_GUIDE_tactical_20260725-modify.md` であり、**より新しい版がある。** どちらが正本か著者が確定させること（アンカーが2つあると genzaichi-3 の読書指定が壊れる）

---

## Phase 2 — 地ならし [解禁済み]

**この順序である理由:** 2-1 を Phase 3 より先にやると、エンジンの編集が**3回ではなく1回**で済む。

- [x] **2-1a エンジンの正本を1つ立て、伝播を機械化した。** ✅
  - `spacta/engine/{runtime,react}.ts` を**正本**として新設。3つの着地点（starter / livingdoc / `livingdoc/verify/starter/`）はコピーになった
  - `spacta/engine/sync.mjs` — `bun engine/sync.mjs` で伝播、`--check` で検査（stale なら **exit 1**）。`package.json` に `engine:sync` / `engine:check` を追加
  - `replay/runtime.serialization.test.mjs` の byte 一致 assert を**正本との比較**に変更。以前は「peer 同士の比較」だったので、**どの方向に直すのが正しいかを検査自身が知らなかった**
  - **§6.5 の要求どおり、検査が何かに向いていることを実証した:** livingdoc のコピーに乖離を植え → `engine:check` が exit 1、serialization が `FAIL` → `sync` で修復 → byte 一致に復帰、を確認済み
  - **測定ゾーンは無傷。** `spacta/engine/` は measure の対象外なので `engine` ゾーンは 2ファイル / 292行のまま。`zones` / `effectUnion` / `tiers` すべて `04.json` と一致

- [x] **2-1b コピーを3から減らす → ✅ 決定済み（2026-08-02）: (b) 現状維持。livingdoc は Spacta を vendor する。** 本物のパッケージ化 (c) は将来の課題として保留リストに残す。**同期義務は残るが、2-1a で機械化され、乖離が exit 1 で落ちることも実証済み**なので、運用上の穴は閉じている。

  以下は判断の根拠として残す:

  **実測で判明した構造:** 重複の本体はエンジン2ファイルではなく、**`livingdoc/verify/` が `spacta/verify/` の byte-for-byte コピー + starter コーパス丸ごと（21ファイル）**であること。
  ```js
  // verify/verify.mjs:1494 — コーパスを2箇所から探す
  const CORPUS_CANDIDATES = [join(__dirname, "..", "starter"), join(__dirname, "starter")];
  ```
  エンジンの3部目は、この「同梱された検証器」が自分用のコーパスを必要とすることの帰結にすぎない。

  **そして測定4回はすべて `cd /workspace/spacta && bun verify/verify.mjs ../livingdoc` を使っている**（測定計画 §3 の条件5）。**`livingdoc/verify/` はこのワークフローで一度も実行されていない。**

  | 選択肢 | 得るもの | 失うもの |
  |---|---|---|
  | (a) `livingdoc/verify/` を削除し、`package.json` の `verify` を `../spacta/verify/verify.mjs .` に向ける | コピーが3→2。21ファイルの同期義務が消える | **livingdoc が自己完結でなくなる。** spacta リポジトリが隣に無いと verify できない |
  | (b) 現状維持（正本 + sync で運用） | 自己完結を保つ | 同期義務は残る（ただし機械化済み・検査済み） |
  | (c) 本物のパッケージ化 | 正しい解 | **この環境では検証不能**（node / npm が無く bun のみ。`starter/node_modules` も存在しない） |

  **(c) は今の環境では選べない。** (a) と (b) は「アプリは Spacta を vendor するのか依存するのか」という配布方針の決定であり、著者のもの。
- [x] **2-2 段位の梯子の穴（`T?`）を塞いだ。** ✅ **穴の正体は判定の順序だった**——`judgeTier` が `InitData` の有無を **shell の有無より先に**見ていたため、状態機械を必要としない読み取り専用機能が1段目で落ちていた
  - 修正: `!f.hasShell` の分岐を `!c.initData` より**前**に置いた。shell が無ければ `InitData` の有無に関わらず **T1**。`InitData` を要求するのは shell を持つ機能に対してだけ
  - 根拠: L3 の inbound を施行しているのは **L2 / L9** であり、`InitData` を持たない core にも L2 は等しく届く。**持たないのは検査されていないからではなく、注入すべき値が無いから**である
  - **`T?` は廃止せず、狭めた。** shell があるのに状態機械が読めない場合のために残る（fixture `tier-ungraded.core.ts` + shell がその対照群）
  - **自己テストを2件追加**（§6.5）: ①純ヘルパのみ・shell 無し → T1（`tracetype` の形。**この行が落ちたら穴が戻っている**）②`tier-ungraded` を shell 無しで → T1（「T? を廃止した」と「T? を正しく狭めた」の区別）
  - **判定を壊して自己テストが落ちることを実証済み:** 穴を意図的に戻す → 追加した2件が `expected: T1 / got: T?` で発火、**exit 1**（“The verifier itself is malfunctioning”）→ 復元して緑
  - `verify/README.md` の段位表・`T?` の説明・fixtures 節を同期（genzaichi-3 §5 が「手書きでドリフトしうる」と指摘していた箇所）
  - **受け入れ条件を満たした:** `tracetype` が T1 を得た / **他9機能の段位は不変**（`measure` の `tiers` を `04.json` と比較して確認）/ `zones` と `effectUnion` も `04.json` と完全一致 / wiring テスト・role-claim テスト・fixtures すべて緑

- [x] **2-2b【2-1b の帰結として発生】vendor 同期を機械化した。** ✅ 2-2 で `verify/verify.mjs` と `verify/README.md` を変更した結果、**`livingdoc/verify/` の同梱コピーが即座にドリフトした。** vendor を選んだ以上これは常設の義務であり、v0.10 は同じ穴を踏んでいる（「`livingdoc/verify/` は L3・L9・L10・roles を欠く v0.9.x のコピーだった」＝**無言で古くなっていた**）
  - `engine/sync.mjs` を `tools/vendor-sync.mjs` に一般化。3つの束を持つ: **engine**（3着地点）/ **verifier**（`spacta/verify` → `livingdoc/verify`、35ファイル）/ **corpus**（`spacta/starter` → `livingdoc/verify/starter`、22ファイル）
  - `package.json`: `vendor:sync` / `vendor:check`（stale なら **exit 1**）
  - **ドリフト検出 → 同期 → 一致を実走で確認**（3ファイルが stale として検出され、同期後に `vendor: every copy matches its source`）
  - **`livingdoc` 同梱の検証器が spacta 側と同一の出力を出すようになった**（段位の修正を含む）。vendor 方針が初めて機械的に保たれている状態
- [ ] **2-3 `moderation` に識別子を持たせる**（2-2 の後）。成功したコマンドが `pending` に残り続ける既存の不具合（`core.ts:108` にコメントとして事実が記録されている）。`MODERATE` に `correlationId` を足せば閉じる
  - **✅ 完了。ただし genzaichi-3 §5 が記録していた症状は、実際には発現しない。** §5 は「成功したコマンドの**行が無効化されたまま残る**」と書いているが、実測すると **`pending` はどのコンポーネントからも読まれていない**（参照はすべて `core.ts` / `types.ts` の中）。行を無効化する実装は存在しない。**本当の欠陥は別だった:**

    > **失敗しても楽観更新が巻き戻らない。** 旧 `EFFECT_FAILED` は `pending: []` と notice を書くだけで、適用済みの変更を画面に残していた。**「承認済み」の表示の下に「失敗しました」の通知が出る**状態である。加えて、身に覚えのない答えが1つ来ただけで `pending` が空になり notice が書き換わった。

  - `pending: string[]` → `PendingCommand[]`。各要素が `correlationId` と **`undo`（その楽観更新が何を押しのけたか）** を持つ
  - `undo` を持たせた理由: 9コマンド中6つはトグル対なので逆コマンドで戻せるが、`resolve-report`（行を消す）と2つの verdict（前の status が復元不能）は戻せない。**3つを例外扱いにせず、全コマンドが押しのけたものを記録する**——打ち消しが「規則＋注釈」ではなく単一の規則になる
  - `undoFor` は `applyLocally` の**前**に読む（後では前の値が消えている）
  - 成功・失敗とも `pending` に**記録があるときだけ**動く。pageview と同じ作法で、遅延・重複した答えが二重に打ち消すのを防ぐ
  - **検査を11件追加**: `replay/runtime.serialization.test.mjs` の「moderation — what the answer is allowed to change」節。エンジン経由で実 `core.ts` を駆動し、成功時に pending が落ちる / 失敗時に行が戻る / **2件出したとき失敗した方だけが戻る** / 身に覚えのない答えは何も変えない、を assert
  - **シナリオ S9 を追加**（`crosscheck` 13本に）。moderation のコマンドが 500 で拒否される経路。**既存 S7 は `correlationId` を渡しておらず、修正した経路を一度も通らないまま緑だった**（`.mjs` は型検査されない）ので併せて修正
  - **旧挙動を植え直して検査が落ちることを実証:** 4 assertion が発火し **exit 1**。うち1件は「存在しないコマンドの答えが `pending` を空にし notice を書き換える」を捕まえている

- [x] **2-4 回帰網のベースライン。** ✅ Phase 2 完了時点で全ゲート緑:

  | ゲート | 結果 |
  |---|---|
  | `verify` livingdoc / starter / **同梱自走** | **Green**（3つとも） |
  | `tsc --noEmit` | **exit 0** |
  | `replay/crosscheck` | **13 checks**（S9 追加。legacy は #1 / #5 で発散） |
  | `replay/harness.selftest` | **12 assertions** |
  | `replay/runtime.serialization` | **22 assertions**（moderation の11件を追加） |
  | `tools/vendor-sync --check` | every copy matches its source |

  `measure`（`04.json` 比）: **`engine` 292行で不動** / `contract` 256行で不動 / `Effect` 13メンバで不動 / `feature` 3993 → 4122行 / **段位の変化は `moderation` T2→T3 と `tracetype` T?→T1 の2件のみ**

---

## Phase 3 — 本体: L4 の機能ローカル化

### 設計の核

**合成（`compose(a, b)`）ではなく置換。** 各機能が自分の `perform` を持つだけで、合成機構は要らない。重なる3メンバは**重複させる**（`SPACTA.md` §2 が既に「Duplication is allowed and preferred over coupling」と言っている）。

重複してよい理由: `SET_BOOKMARK` の perform は `post("/api/bookmarks", {traceId, active})` の3行であり、**本当の結合は HTTP エンドポイントの形（＝スキーマ）にある**。共有 perform はその結合を守っていない。管理しているように見せているだけである。

- [x] **3-1 エンジンに答えの型引数を足した。** ✅ 実際の形は下記。**⚠️ で挙げていた懸念は両方とも解消した**

  ```ts
  export type Perform<E, R = never>      = (effect: E) => Promise<{ id?: string; data?: R } | null | undefined>;
  export type EffectOutcome<R = never>   = { type: "EFFECT_SUCCEEDED"; correlationId: string | null; id?: string; data?: R }
                                         | { type: "EFFECT_FAILED";    correlationId: string | null; message: string };
  export type Update<S, A, E, R = never> = (state: S, action: A | EffectOutcome<R>) => [S, E[]];
  ```

  - **既存10機能は1行も変更せずコンパイルを通った。**「ergonomics 未検証」と書いていた点の答えは **デフォルト型引数（`R = never`）で足りる**。`id` を `result` に置き換える破壊的変更ではなく `data` を**追加**したのが効いた
  - **記録セッションも一切変わらなかった。** `JSON.stringify` は `undefined` を落とすので、12本の `replay-sessions/*.json` が byte 一致のまま。**リプレイ側は無改造**（4-2 の予測が前倒しで確認された）
  - **エンジンは 292 → 307行**（+15、大半が `data` の説明コメント）。**5スナップショットで一度も動かなかった数字を、ここで意図的に使った。`shared/types.ts` は256行のまま動いていない**——そこに使わないことが目的だったので、意図どおり
  - **検査を8件追加**（`runtime.serialization` は 22 → 30 assertion）: データが Core に届く / 2回目の読みが1回目の続きから始まる / 失敗が同じ outcome Action でメッセージを運ぶ / **記録器が答えを記録する**（リプレイは再取得できないので、落とすと「ユーザーが見ていない画面」を再構成することになる）
  - **エンジンから `data: result?.data` を落として検査が落ちることを実証:** 4 assertion が発火、**exit 1**

- [ ] ~~3-1（元の記述）~~
  ```ts
  export type Perform<E, R>       = (effect: E) => Promise<R | null | undefined>;
  export type EffectOutcome<R>    = { type: "EFFECT_SUCCEEDED"; correlationId: string | null; result?: R }
                                  | { type: "EFFECT_FAILED";    correlationId: string | null; message: string };
  export type Update<S, A, E, R>  = (state: S, action: A | EffectOutcome<R>) => [S, E[]];
  ```
  **エンジンは `R` の中身を知らない。`E` を素通しするのと同じ扱い。**
  - ⚠️ **既存10機能を壊さない書き方（デフォルト型引数など）は未検証。** 実装者が確かめること
  - ⚠️ **エンジンは292行 × 5スナップショット × 3部で一度も動かなかった唯一のもの。** その記録を使うことになる
- [ ] **3-2 機能が自分の `Effect` union と `perform` と答えの型を持つ。** `features/<name>/perform.ts`（配置は実装者の裁量）
- [ ] **3-3 専有7メンバと `ModerationCommand` を機能へ里帰りさせる。** `ModerationCommand`（9メンバ、moderation 完全専有）が `shared/types.ts:171` にいるのは、`Effect` の `MODERATE` が参照しているからである——**型の引力**
- [ ] **3-4 プラットフォーム3つを処理する。** `NAVIGATE` はアダプター（`shared/spacta/react.ts`）の能力へ。**`RELOAD` / `LOG` は構築者ゼロなので、削除するか、使う機能が現れるまで置かない**
- [ ] **3-5 2機能共有の3メンバを重複させる**（`SAVE_TRACE` / `SET_BOOKMARK` / `SET_PAGE_WATCH`。合計20行程度）
- [ ] **3-6 `shared/types.ts` の読みモデル180行を `shared/source/` へ移す。** 実測で `shared/types.ts` 256行は**2つの別物の同居**だった——読みモデル型 約180行（データアダプターの出力の形）＋ `Effect` union 約60行（L4×L7 の産物）。Phase 1 で読みをデータ層＝管轄外と宣言した以上、読みモデル型はそちら側に属する
- [ ] **3-7 `verify` に新しい役割を足す**（`features/*/perform.ts`）。L4 の検査自体は既に `src/**` 全体（108ファイル）を走るので追加不要。**役割表に足すなら genzaichi-3 §6.5 の3層（L6 自己テスト / wiring テスト / role-claim テスト）が要る**
- [ ] **3-8 `measure` の `effectUnion` を切り直す。** 「union のメンバ数」は機能ローカル化すると意味を失う。**「共有 Effect の数 / 機能ローカルの数」に分けること。** 分けないと計器を1つ失う
- [ ] **3-9 `SPACTA.md` の L4 と §4-2 を改訂する。** 「単一ディスパッチ地点」の意味を変える:
  > **「Effect を IO に変える場所が1つ」 → 「Effect をディスパッチする機構が1つ」**

  後者のほうが**エンジンが実際にやっていることの正確な記述**である（エンジンは Effect から `{type, correlationId?}` の2つしか読まない）。§4-3「Do not write your own effect loop」は**変更しない**——エンジンは1つのままであり、3分岐の再発防止はここが担っている

**Phase 3 の受け入れ条件:**
- `verify` 緑 / `tsc --noEmit` 0エラー
- `crosscheck` 12本が Phase 2-4 と同じ判定（legacy が #1 / #5 で発散、engine は全 replays）
- `harness.selftest` 12件、`runtime.serialization` 全件が通る
- `shared/types.ts` の行数が **大幅に減っている**（目標: `Effect` union と読みモデルの両方が出て、100行を切る）
- エンジンに **React / Next.js の import が1つもない**（不変）

---

## Phase 4 — 収穫: ロード後の読み

- [ ] **4-1 最初の消費者を1つ実装する。** 例: 「あとで読む」一覧の「もっと見る」。機能ローカルな `Effect` と答えの型で完結すること
  ```ts
  // features/saved/types.ts — 機能の中で完結する
  export type Effect = { type: "LOAD_MORE"; correlationId: string; cursor: string } | …;
  export type Answer = { of: "LOAD_MORE"; traces: TraceWithPage[] } | …;
  ```
  **`shared/types.ts` は1行も増えないこと。** 増えたら 3-2 が不完全である
- [ ] **4-2 リプレイが無改造で通ることを確認する。** 記録器は Action を記録し、`EFFECT_SUCCEEDED` に載った答えは**自動的に記録される**。折り返しも `update` を畳むだけ。**理論上ゼロコストのはずなので、そうでなければ 3-1 の設計に問題がある**

---

## Phase 5 — 検算

- [ ] **5-1 全ゲートを走らせる**（付録のコマンド）
- [ ] **5-2 `measure` を取り、Phase 2 前と比較する。** 見るべき数字:
  - `contract`（`shared/types.ts`）が**減っている**こと
  - `engine` の増分が**型引数の追加分だけ**であること
  - `effectUnion` が新しい切り方（共有 / ローカル）で出ていること
- [ ] **5-3 変更の効果を1枚に記録する。** 機能を1つも増やしていないので、これは**測定ではなくリファクタの差分**である。`docs/measurements/` には入れない（測定の記録と混ざる）

---

## 4. この版が終わったと言える条件

- [ ] 掟が10本のままである。`SPACTA.md` に L11 以降が無い
- [ ] 膜語彙が4つのままである
- [ ] `src/features/**` から `shared/source` への import が引き続き0件
- [ ] 書き込みのある機能が、新しい Effect を足すのに `shared/types.ts` を編集しなくてよい
- [ ] エンジンが1箇所にしか存在しない（3部重複の解消）
- [ ] `verify` 緑 / `tsc` 0 / `crosscheck` 12本 / `selftest` 12件 / `serialization` 全件
- [ ] `measure` の `effectUnion` が共有とローカルを区別して出す
- [ ] Phase 1 の4項目が文書に反映されている
- [ ] 作業中に見つけた改善案が、実装せずに保留リストへ追記されている

---

## 付録: ゲートのコマンド

```bash
cd /workspace/spacta && bun verify/verify.mjs ../livingdoc
cd /workspace/livingdoc && bun ./node_modules/typescript/lib/tsc.js --noEmit
cd /workspace/spacta && bun replay/crosscheck.mjs
cd /workspace/spacta && bun replay/harness.selftest.mjs
cd /workspace/spacta && bun replay/runtime.serialization.test.mjs
cd /workspace/spacta && bun metrics/measure.mjs   # 出力を保存して差分で読む
```

**この環境では `workerd` が動かないため dev サーバと D1 は起動しない。** 実効的なゲートは verify 緑と tsc 0 エラーであり、これは測定期間中と同じ条件である。
