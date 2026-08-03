# 測定 #02 — 下書きの自動保存つきエディタ

## 事前（実装開始前に書いた。凍結は `00-plan.md` §1）
- 宣言した型: **相互作用型**
- 予測した段位: **T3**
- 予測した既存共有ファイルの編集数: **5**（`shared/types.ts` / `shared/source/queries.ts` / `shared/source/mutations.ts` / `shared/runEffect.ts` / 導線1つ）
- 起点 (BEFORE): `2fec76d3b04740452ef859b5d5d63b9316bbd5ab`

## 実装
- 日時 / モデル: 2026-07-28 / **sonnet**（t1 とは別の新規エージェント。文脈の持ち越しなし）
- 到達コミット (AFTER): `f6492fa9fa9789dfdb404d1a53cf68f5f022755c`
- 渡したもの: `SPACTA.md` の場所 / 要件文 / 作業ディレクトリ / 「緑になるまで自分で直せ」のみ
- 渡していないもの: 設計書・実施手順書・`genzaichi-3`・`/workspace/docs/` 全体・`docs_HUMAN-ONLY/`・指標の定義・**t1 の内容と結果**
- ゲート: **1回目で両方通過**（統括からの差し戻しゼロ）

## 結果 — 主指標

`git diff --name-status 2fec76d f6492fa` を super user が外部から集計。

| 編集した既存ファイル | ゾーン | +行 | -行 |
|---|---|---|---|
| `src/shared/types.ts` | contract | 37 | 0 |
| `src/shared/runEffect.ts` | sharedOther | 19 | 0 |
| `src/shared/source/mutations.ts` | dataAdapter | 34 | 0 |
| `src/shared/source/queries.ts` | dataAdapter | 39 | 0 |
| `src/shared/ui/SiteFooter.tsx` | sharedUi | 11 | 3 |

**既存共有ファイルの編集数: 5**

`db/schema.sql` も編集された（`drafts` テーブル追加）が、`src/shared/**` でも `app/**` でもないため設計書 §2 の定義により**主指標には数えない**。

## 結果 — 新規作成（参考。主指標には数えない）

| ファイル | ゾーン | 行数 |
|---|---|---|
| `app/api/drafts/route.ts` | framework | 46 |
| `app/write/page.tsx` | framework | 31 |
| `src/features/draft/core.ts` | feature | — |
| `src/features/draft/shell.tsx` | feature | — |
| `src/features/draft/types.ts` | feature | — |
| `src/features/draft/components/DraftForm.tsx` | feature | — |
| `src/features/draft/components/DraftPosted.tsx` | feature | — |

feature 42 → 47 ファイル、app 18 → 20。

## 結果 — 副指標
- 到達した段位: **T3**（予測 T3 と一致）。相互作用型の宣言どおり往復を必要とした
- measure の出力: `spacta/metrics/02.json`
  - engine 2ファイル / **292行（ベースライン・t1 と1行も変わらず）**
  - contract 209 → **246行**（+37）、`Effect` union **9 → 11メンバ**
  - dataAdapter 1061 → **1134行**（+73）、ファイル数は 7 で不変
  - sharedUi **15ファイルで不変**（新規プリミティブの追加なし。既存の再利用で足りた）
  - spread 95 → 101行、最大消費者数 `textError` 8 → 9
- 実装 AI が開いたファイル数 / 入力トークン数: 未取得（自己申告はさせない方針）
- verify: **緑**（94ファイル 0 unclassified。`export-ownership` が ⓘ 0 → 2）
- tsc: **0エラー**

## 予測との差
- 主指標: 予測 **5** → 実測 **5**（一致）
- 構造の内訳: 4つ（`types.ts` / `runEffect.ts` / `mutations.ts` / `queries.ts`）は**書き込みのある機能なら構造的に避けられない**。L4 が単一ディスパッチ地点を要求し、L7 が `runEffect` に機能型の import を禁じるため、`Effect` メンバの追加と case の追加は必ず共有側の編集になる。5つ目（`SiteFooter.tsx`）は導線で、これは裁量。
- **設計書 §7 の成立条件「各回の主指標が4以下」を、この回は超えている（5）。** 判定は4回終了後に行うので、ここでは事実の記録に留める。この超過は事前に予測されていたものであり、数字を見てからの解釈ではない。
- 段位: 一致（T3）。

## 定性メモ
- 差し戻しゼロで緑。相互作用型でも掟が1回で通った。
- 実装エージェントは、**保存中に編集が届いた場合に備えて pending write のスナップショットを取る**という判断を自分で行ったと報告している。楽観更新とロールバックを要求する型の宣言と整合する。
- 実行時確認は不可（`workerd` バイナリ欠落で `wrangler dev` / D1 が起動せず、新テーブルと `/api/drafts` は一度も実行されていない）。ゲートは verify 緑と tsc 0 のみ。**4回すべて同条件**であり、これは条件の差ではない。
- `export-ownership` info が 2 件出た。`garden` の管轄であり、**測定期間中はリファクタ禁止なので触らない。**
