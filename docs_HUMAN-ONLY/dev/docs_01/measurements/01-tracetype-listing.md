# 測定 #01 — タイプ別の痕跡一覧

## 事前（実装開始前に書いた。凍結は `00-plan.md` §1）
- 宣言した型: **読み型**
- 予測した段位: **T1**
- 予測した既存共有ファイルの編集数: **3**（`shared/types.ts` / `shared/source/queries.ts` / 導線1つ）
- 起点 (BEFORE): `6957b4b9977d625747d2b44c81ebf6df1cf580d8`

## 実装
- 日時 / モデル: 2026-07-28 / **sonnet**（統括 opus が起動。1機能=1エージェント=1セッション）
- 到達コミット (AFTER): `2fec76d3b04740452ef859b5d5d63b9316bbd5ab`
- 渡したもの: `SPACTA.md` の場所 / 要件文 / 作業ディレクトリ / 「緑になるまで自分で直せ」のみ
- 渡していないもの: 設計書・実施手順書・`genzaichi-3`・`/workspace/docs/` 全体・`docs_HUMAN-ONLY/`・指標の定義
- ゲート: **1回目で両方通過**（統括からの差し戻しゼロ）

## 結果 — 主指標

`git diff --name-status 6957b4b 2fec76d` を super user が外部から集計。

| 編集した既存ファイル | ゾーン | +行 | -行 |
|---|---|---|---|
| `src/shared/source/queries.ts` | dataAdapter | 13 | 0 |
| `src/shared/ui/SiteHeader.tsx` | sharedUi | 22 | 1 |

**既存共有ファイルの編集数: 2**

## 結果 — 新規作成（参考。主指標には数えない）

| ファイル | ゾーン | 行数 |
|---|---|---|
| `app/type/[type]/page.tsx` | framework | 49 |
| `src/features/tracetype/core.ts` | feature | — |
| `src/features/tracetype/types.ts` | feature | — |
| `src/features/tracetype/components/TypeTraceCard.tsx` | feature | — |

feature ゾーン計 39 → 42 ファイル、app 17 → 18。

## 結果 — 副指標
- 到達した段位: **`T?`（判定不能。予測 T1 と外れた）** — verify の印字: `? tracetype: core.ts takes no parameter typed *InitData, so the inbound half of L3 cannot be read off it`
- measure の出力: `spacta/metrics/01.json`
  - engine 2ファイル / **292行（ベースラインから1行も動かず）**
  - contract 209行（不変）、`Effect` union 9メンバ（不変）＝書き込みが無いので当然
  - dataAdapter 1048 → 1061行（+13）、sharedUi 15ファイル（新規プリミティブなし）
  - spread 94 → 95行、最大消費者数は `textError` の 8 で不変
- 実装 AI が開いたファイル数 / 入力トークン数: 未取得（自己申告はさせない方針。セッションログから確実に取れない）
- verify: **緑**（87ファイル 0 unclassified。`clone` が ⓘ 1 に増加）
- tsc: **0エラー**

## 予測との差
- 主指標: 予測 **3** → 実測 **2**
- 仮説: 既存の読みモデル型（`TraceWithPage`）がそのまま使えたため、**`shared/types.ts` を触る必要が発生しなかった**。読み型で新しい読みモデルを必要としない場合、構造的な下限は「取得経路1つ＋導線1つ」の2ファイルになる。次の読み型の予測は2に下げてよい（ただし新しい読みモデルが要る読み型なら3に戻る）。
- 段位: 予測 **T1** → 実測 **T?**。仮説: この機能の `core.ts` は型パースとラベルという純粋ヘルパだけで、`init(initData)` を持たない。読み取り専用画面には状態機械が要らないので**掟には反していない**が、段位の梯子は T1 の条件を「`core.ts` が `InitData` を受ける」と定義しているため、T0（`core.ts` なし）でも T1 でもない穴に落ちる。**梯子側の穴であって実装の誤りではない。**

## 定性メモ
- 差し戻しゼロで緑。相互作用が無い読み型では、掟が実装を1回で通した。
- **段位の梯子に穴が見つかった**（上記）。測定期間中の判定器変更は交絡因子になるため**修正しない**。`genzaichi-3` §5 に追記した。
- `clone` info が 0 → 1 に増えた。新カードが既存カードと形が似ていることの申告であり、`garden` の管轄。**測定期間中はリファクタ禁止（設計書 §9）なので触らない。**
- 実行時確認はこの環境では不可（`workerd` バイナリ欠落で `wrangler dev` / D1 が起動しない）。ゲートは verify 緑と tsc 0 の2つのみ。4回すべて同条件。
