# 測定 #04 — 気になるページの登録

## 事前（実装開始前に書いた。凍結は `00-plan.md` §1。t1〜t3 の数字を見てから動かしていない）
- 宣言した型: **書き込み型**
- 予測した段位: **T2**
- 予測した既存共有ファイルの編集数: **5**
- 起点 (BEFORE): `74f7bd2d2e1b8f52c94a3c5178a5877f15cf7d14`

## 実装
- 日時 / モデル: 2026-07-28 / **sonnet**（t1〜t3 とは別の新規エージェント。文脈の持ち越しなし）
- 到達コミット (AFTER): `6458195361f82c0cdade10671ebfb61bd7351564`
- 渡したもの / 渡していないもの: 他の3回と同一（固定リストのみ。指標の定義は渡していない）
- ゲート: **1回目で両方通過**（差し戻しゼロ）

## 結果 — 主指標

| 編集した既存ファイル | ゾーン | +行 | -行 |
|---|---|---|---|
| `src/shared/source/queries.ts` | dataAdapter | 39 | 0 |
| `src/shared/source/mutations.ts` | dataAdapter | 23 | 0 |
| `src/shared/types.ts` | contract | 7 | 0 |
| `src/shared/ui/SiteHeader.tsx` | sharedUi | 3 | 0 |
| `src/shared/runEffect.ts` | sharedOther | 2 | 0 |
| `app/m/[material]/[page]/page.tsx` | framework | 6 | 2 |

**既存共有ファイルの編集数: 6**

`db/schema.sql`（`page_watches` テーブル）も編集されたが、定義により数えない。

## 結果 — 副次的事実（主指標の定義外）

既存機能 `pageview` の内部を4ファイル編集している（t3 と同じ構図）。

| 編集した既存の機能ファイル | +行 |
|---|---|
| `src/features/pageview/core.ts` | 19 |
| `src/features/pageview/types.ts` | 6 |
| `src/features/pageview/shell.tsx` | 6 |
| `src/features/pageview/components/PageMasthead.tsx` | （M） |

## 結果 — 新規作成（参考。主指標には数えない）

`app/api/watches/route.ts`（21）/ `app/watchlist/page.tsx`（28）/ `src/features/watchlist/{core.ts 76, shell.tsx 46, types.ts 33, components/WatchedPageCard.tsx 25}` / `src/features/pageview/components/WatchToggle.tsx`

## 結果 — 副指標
- 到達した段位: **T3**（予測 T2 と外れた。t3 と同じ理由 — 既存画面上のトグルは楽観更新を要求する）
- measure の出力: `spacta/metrics/04.json`
  - engine 2ファイル / **292行（5スナップショットすべてで不変）**
  - contract 249 → **256行**、`Effect` union **12 → 13メンバ**
  - dataAdapter 1178 → **1240行**（+62）、ファイル数 7 で不変
  - sharedUi **15ファイルで不変**（4回連続）
  - feature 52 → 57、app 22 → 24、機能数 9 → **10**、総ファイル 101 → **108**
- verify: **緑**（108ファイル 0 unclassified）。新しい info が1件: `types.ts sharing budget exceeded: src/shared/types.ts = 257 lines (> 250)`。exit code には影響しない
- tsc: **0エラー**

## 予測との差
- 主指標: 予測 **5** → 実測 **6**
- 仮説: 6つ目は `app/m/[material]/[page]/page.tsx`（既存ルート）の編集だった。**登録トグルを既存画面に置く要件だと、その画面のサーバ側ルートに「このページを登録しているか」を渡す配線が必要になる。** 新規画面に閉じる機能（t2）ではこれが発生しない。要件文が「既存画面から操作する」と言うかどうかが、主指標に +1 する。
- 段位: 予測 T2 → 実測 T3（t3 と同一の外れ方。宣言の型分類を改めるべき）

## 定性メモ
- 差し戻しゼロで緑。4回すべて1回目で通った。
- 実装エージェントは dev サーバを起動できないため、`bun:sqlite` でローカル D1 sqlite にスキーマを当てて SQL を直接実行し、トグルの冪等性と結合・件数を確認したと報告している（テスト行は削除済み）。**この代替検証は t4 だけが行った** ので、条件の完全な同一性という点では t4 のみ検証手段が1つ多い。主指標には影響しない（主指標は git から取っている）。
- `clone` info が 1 → 2 に増加。`garden` の管轄。測定期間中なので触らない。
