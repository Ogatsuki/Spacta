# 測定 #03 — あとで読む（痕跡の保存）

## 事前（実装開始前に書いた。凍結は `00-plan.md` §1。t1/t2 の数字を見てから動かしていない）
- 宣言した型: **書き込み型**
- 予測した段位: **T2**
- 予測した既存共有ファイルの編集数: **5**
- 起点 (BEFORE): `f6492fa9fa9789dfdb404d1a53cf68f5f022755c`

## 実装
- 日時 / モデル: 2026-07-28 / **sonnet**（t1/t2 とは別の新規エージェント。文脈の持ち越しなし）
- 到達コミット (AFTER): `74f7bd2d2e1b8f52c94a3c5178a5877f15cf7d14`
- 渡したもの: `SPACTA.md` の場所 / 要件文 / 作業ディレクトリ / 「緑になるまで自分で直せ」のみ
- 渡していないもの: 設計書・実施手順書・`genzaichi-3`・`/workspace/docs/` 全体・`docs_HUMAN-ONLY/`・指標の定義・**t1/t2 の内容と結果**
- ゲート: 統括がコミット前に verify 緑 / tsc 0 を確認済み

## 結果 — 主指標

| 編集した既存ファイル | ゾーン | +行 | -行 |
|---|---|---|---|
| `src/shared/source/queries.ts` | dataAdapter | 23 | 1 |
| `src/shared/source/mutations.ts` | dataAdapter | 23 | 0 |
| `src/shared/types.ts` | contract | 5 | 1 |
| `src/shared/ui/SiteHeader.tsx` | sharedUi | 3 | 0 |
| `src/shared/runEffect.ts` | sharedOther | 2 | 0 |

**既存共有ファイルの編集数: 5**

`db/schema.sql`（`bookmarks` テーブル）も編集されたが、定義により主指標には数えない。

## 結果 — 副次的事実（主指標の定義外。§2 の定義は変えない）

**この機能は既存機能 `pageview` の内部を5ファイル編集している。** 設計書 §2 は `src/features/**` をカウント対象外としているため主指標には現れない。

| 編集した既存の機能ファイル | +行 |
|---|---|
| `src/features/pageview/core.ts` | 33（**この編集後 596行**） |
| `src/features/pageview/components/TraceCard.tsx` | 11 |
| `src/features/pageview/components/SpotCard.tsx` | 8 |
| `src/features/pageview/shell.tsx` | 8 |
| `src/features/pageview/types.ts` | 2 |

L1 違反ではない（他機能の内部を import したのではなく、`pageview` 自身のファイルに「あとで読む」ボタンと状態を足している）。ただし **1タスクの参照範囲という予算の観点では、596行の `core.ts` を開いて編集したことは支出である。** この事実は §7 の判定には使わない（判定基準を後から変えないため）が、指標の定義の盲点として報告書に書く。

## 結果 — 新規作成（参考。主指標には数えない）

| ファイル | ゾーン | 行数 |
|---|---|---|
| `app/api/bookmarks/route.ts` | framework | 21 |
| `app/saved/page.tsx` | framework | 28 |
| `src/features/saved/core.ts` | feature | 76 |
| `src/features/saved/components/SavedTraceCard.tsx` | feature | 61 |
| `src/features/saved/shell.tsx` | feature | 47 |
| `src/features/saved/types.ts` | feature | 35 |
| `src/features/pageview/components/BookmarkButton.tsx` | feature | 46 |

## 結果 — 副指標
- 到達した段位: **T3**（予測 T2 と外れた）
- measure の出力: `spacta/metrics/03.json`
  - engine 2ファイル / **292行（4スナップショットすべてで不変）**
  - contract 246 → **249行**（+3）、`Effect` union **11 → 12メンバ**
  - dataAdapter 1134 → **1178行**（+44）、ファイル数 7 で不変
  - sharedUi **15ファイルで不変**（4回連続で新規プリミティブなし）
  - feature 47 → 52ファイル、app 20 → 22、機能数 8 → 9、総ファイル 94 → 101
- verify: **緑**（統括がコミット前に確認）
- tsc: **0エラー**

## 予測との差
- 主指標: 予測 **5** → 実測 **5**（一致。t2 と同じ内訳で、`types.ts` / `runEffect.ts` / `mutations.ts` / `queries.ts` + 導線1つ）
- 段位: 予測 **T2** → 実測 **T3**。仮説: 「入れる／外せる」というトグルは押した瞬間に画面が変わることを要求するので、実装者は楽観更新と失敗時の巻き戻しを選んだ。**書き込み型と相互作用型の境界は要件文の側にあり、宣言時に見分けきれていなかった。** 「一覧画面に出るだけの送信」と「既存画面上のトグル」は別物として型宣言すべきだった、というのが次の測定への学び。

## 定性メモ
- 差し戻しなしで緑（統括の確認による）。
- **指標の盲点が実データで露出した**（上記「副次的事実」）。既存機能への波及が主指標に一切現れない。
- `Effect` メンバは +1 で済んでいる（t2 は +2）。書き込み1つあたりの contract の伸びは小さい。
- 実行時確認は不可（`workerd` 欠落で D1 / dev サーバが起動しない）。4回すべて同条件。
