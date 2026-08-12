# Spacta — AIにNext.jsを書かせるための、機械検証つきアーキテクチャ

AIコーディングの難しさは「AIが書けないこと」ではなく、**書けたと報告されたコードが他を壊していないかを確かめる手段がないこと**にあります。

Spactaは、Next.jsアプリの各機能を独立したディレクトリに文字通り隔離し、**その境界が破られていないことをスクリプトが検証する**仕組みです。境界を守らせることで、LLMとしての回答精度向上と、保守性を高めています。

Spactaは機能ごとに、**計算だけをする層（Core）と、外界に触る層**を物理的に分けます。その境目を**膜**と呼びます。

> **膜を越えるのはデータだけ。IOは入らず、計算は出ない。**

---

## この文書の読み方

必要な章だけ読んでください。

| 章 | 内容 | 誰向け |
|---|---|---|
| **1. 何を解決するのか** | 症状と原因、Spactaの答え | 全員 |
| **2. どう動くのか** | ディレクトリ・ループ・実コード | 使う人（Next.jsの知識が要る） |
| **3. verifyが保証すること／しないこと** | 緑の意味 | 使う人 |
| **4. 実際の作業ループ** | 人間とAIの分担、1機能の作り方 | 使う人 |
| **5. Gardener** | UIの片付け | 使う人 |
| **6. よくある質問** | 既存アプリ、1画面2機能、テストなど | 使う人 |
| **7. Spactaが解決していないこと** | 構造的な限界 | 評価する人 |
| **8. 検査自身を検証する仕組み** | 定理の検算、変異テスト | 評価する人 |
| **9. 現時点の未成熟さ** | 版ごとに変わる話 | 評価する人 |
| **10〜11. 設計の背景と展望** | 思想、他分野への応用 | 興味があれば |

**前提：** Next.js **App Router**（Pages Routerは対象外）／ React 18以降 ／ TypeScript **`strict: true`**（網羅性チェックが最後の砦になるため実質必須）。データベースは不問です — 取得と永続化はSpactaの管轄外です（§7-1）。

**コマンドの表記：** 以下 `npm run verify` と書くのは `starter/package.json` に定義された `node verify/verify.mjs .` のショートカットです。npmパッケージは未配布なので、starter以外では末尾（「次のステップ」）のコマンドを直接実行してください。

その他：

- AIに渡す実行ルールは [`SPACTA.md`](../../SPACTA.md)（79行）です。この文書はAIには読ませません。
- 設計判断の背景メモは [α評価](spacta-alpha-evaluation.md) にあります。
- セットアップは [setup.md](../setup.md)。
- ベータ版です。未検証の主張が残っています。§7〜§9に記載しました。フィードバックを歓迎します。
- 土台に FCIS（Functional Core, Imperative Shell）を採用しています。

---

## 1. 何を解決するのか

### 1-1. 症状

Next.jsアプリをAIに書かせると、次のことが起きます。

- **小さな変更でもAIが大量のファイルを読む。** UIとロジックと状態管理が結合しているため、1箇所を直すのに周辺の理解が要る。トークンを消費し、精度が落ちる。
- **`dashboard` を直したら `home` が壊れる。** しかもビルドは通る。
- **AIは「できました」と報告する。** 境界を守ったかどうかを確かめる手段がない。

3つ目が最も重い問題です。**Next.jsは絡み合ったコードを文法的に許すので、不健全な状態管理はビルドを素通りします。**

### 1-2. 答え：物理的な隔離と、機械的な検証

**隔離。** `dashboard` と `home` はそれぞれ専用ディレクトリに閉じます。片方が他方の内部をimportすると、`verify` が構文木（AST）を読んで赤にします。

**契約。** 各機能は `types.ts` に入出力の型（`State` / `Action` / `Effect` / `InitData`）を公開します。この4つが膜を越える語彙です。型を満たすように実装すれば、**他の機能を1行も読まずに実装が完結します**（`shared/ui` の部品は読みます。読まなくてよいのは他の機能です）。

AIに渡すのは「アプリ全体の仕様」ではなく「1つの型契約」で済みます。

初期評価では、**人間が契約を先に凍結したうえで**、複数のAIエージェントが別々の機能を並行実装し、衝突ゼロで統合できました。

### 1-3. hope-prompt を使わない

「このファイルに `fetch` を書かないでください」とプロンプトで指示するのは、ツールによって強制されない散文の依頼です。これを **hope-prompt** と呼んでいます。守られる保証がありません。

加えて、禁止事項を並べるほどAIの注意が分散します。注意すべき事項が広範囲に散らばると、推論時に取りこぼす確率が上がります（[α評価 α5](spacta-alpha-evaluation.md)）。

Spactaは禁止事項をプロンプトから検証器へ移します。

- 書く rule：「IOが必要ならCoreからEffectを*宣言*する」
- 書かない hope：「Coreに `fetch` を書くな」

AIは「プロンプトを遵守しているか自己確認する」作業から解放されます。違反があれば `verify` が赤を返すので、緑になるまで直せば済みます。

### 1-4. ステートマシンという冗長さ

Spactaは網羅的なswitch文と、全分岐への明示的な型付けを要求します。人間が手で書くには冗長ですが、**AIにとっては生成コストがほぼゼロで、かつ正確に再生産できる形式です。**

効果は、「隠れた相互作用をたどって何が起こるべきか推論する」作業が、**「欠けている1つのケースを埋める」というパターンマッチ可能な作業に変わる**ことです。判断が要らなくなり、tscが最後の検査になります。

*（コスト面：冗長な記述はoutputトークンを増やします。inputトークンと推論コストは隔離によって減ります。総体で安いか高いかは計測していません。）*

### 1-5. 緑は「バグがない」ではない

`count + 1` と書くべきところを `count + 2` と書いたコードは緑のまま通ります。

緑が意味するのは次の3点だけです。

- バグがあっても、それは1つの機能のcoreの中に閉じている
- `(initData, actions[])` だけから再現できる（隠れた入力がない）
- 他機能への波及がコードレベルでは起きない（データ層経由の結合は残る → §7-1）

Spactaは暗黙の接続を証明するのではなく、**不要な接続を削除し、残った接続を型契約に通します。** その結果、「これは正しいか」がアプリ全体を見渡す問いではなく、**1つの純粋関数を読めば答えられる問い**になります。推論の対象が1ファイルに収まる、というのがAIとの相性の実体です。

### 1-6. 道具なしで持ち帰れる部分

Spactaを導入しなくても、以下の5点は任意のNext.jsコードベースで適用できます。

1. **ロジックは純粋関数に置く。** `fetch`・`new Date()`・`Math.random()` をそこに書かない
2. **非決定性は引数として注入する。** 時刻もIDも外で採取して値として渡す。**サーバが採番したIDも同じ扱い**
3. **副作用は実行せず、宣言して返す。** 何をするかを値で返し、実行は外側の1箇所に集める
4. **その実行ループはプロジェクトに1つだけ。** 2つ書くと互いに食い違います（実例は §8-2）
5. **初期データは一度だけ渡す。** 途中で外から状態に触らない

`verify` は、この5点を忘れられないようにする装置です。装置がなくても5点は有効です。

---

## 2. どう動くのか

参照実装として `starter/` があります。緑になる最小のNext.jsプロジェクトで、同時に検証器自身のテスト対象でもあります。以下のコードは `starter/src/features/sample/` の実物からの抜粋です。

### 2-1. ディレクトリ

```txt
src/
  features/
    sample/
      types.ts      # 契約。State / Action / Effect / InitData / Answer
      core.ts       # 純粋ロジック。(state, action) => [nextState, effect[]]
      perform.ts    # この機能のEffectを実行する（IO）
      shell.tsx     # JSXの配線のみ。状態は持たない
      components/   # propsの純粋関数。useStateもfetchも禁止
  shared/
    spacta/
      runtime.ts    # エンジン。Effectキューを直列に回し、結果を必ずActionに変換して戻す
      react.ts      # 束縛アダプター。Reactでの状態保持と、時刻・IDの採取
    runEffect.ts    # 輸送のみ（POSTしてJSONを返す）。何を送るかは知らない
    source.ts       # 非決定性の入口。時刻・UUID・DB/APIフェッチ（サーバ側）
    ui/             # 機能に依存しない表示部品（Button, Card…）
```

| 部品 | 役割 | 場所 |
|---|---|---|
| **Core** | 純粋ロジック。`init` / `update`。async・fetch・`new Date()` を含まない。どこで実行しても安全 | `features/*/core.ts` |
| **Perform** | その機能のEffectを実行する。Effect語彙の宣言（`types.ts`）の隣に置く | `features/*/perform.ts` |
| **Shell** | JSXの配線のみ。状態をpropsへ、操作を `Action` へ。状態は自分で持たない | `features/*/shell.tsx` |
| **Engine** | Effectキューを直列に回し、`perform` を呼ぶ唯一の場所。結果を必ず `Action` に変換してCoreへ戻す。ドメインの分岐を持たず、ReactもNext.jsも参照しない。**編集する場所ではありません** | `shared/spacta/runtime.ts` |
| **束縛アダプター** | 状態を保持して再描画を起こし、時刻とIDを採取する。React / Next.js の変化が着地する唯一の場所 | `shared/spacta/react.ts` |
| **Source** | 非決定性の入口。時刻・UUID・DB/APIフェッチ（サーバ側） | `shared/source.ts` |
| **輸送** | POSTしてJSONを返すだけ。語彙を名指ししない | `shared/runEffect.ts` |

**Effect語彙が機能ごとに分かれている理由。** 以前は `shared/runEffect.ts` が全Effectの単一ディスパッチ地点で、L7（shared は機能の型をimportできない）との組み合わせにより `Effect` union が全機能共有の1ファイルに集まっていました。「機能AにEffectを1つ足す」操作が機能Bの依存先の編集になる、という結合です。

これを解体した判断基準は次のとおりです。

> **機能を1つ足したときに、それは変わるか。**
> - **変わらない** → **機構**（`post`、エンジン）→ 1箇所に集約してよい
> - **変わる** → **語彙**（`Effect`、`Answer`）→ 集約せず、機能に持たせる

共有宣言は結合を防いでいたのではなく、管理されているように見えるだけでした。2つの画面を縛るのはエンドポイントであって宣言ではありません。`/api/bookmarks` を変えれば、共有宣言があっても両方壊れます。**2機能が同じEffectを必要とする場合は、両方に書き出します**（duplication over coupling）。

### 2-2. データフローのループ

状態変化を分散させる代わりに、データは1本のループを流れます。

```txt
  [UI: shell.tsx / components]
            │  Action（ユーザー操作）
            ▼
  [Core: core.ts（純粋）]
            │
            ├──▶ 新しい State ──▶ 再描画（UIへ）
            │
            └──▶ Effect[]（実行したいIOの宣言）
                        │
                        ▼
                  [Engine] ──▶ perform.ts（実際のIO）
                        │
                        │  成功も失敗も、必ず Action に変換
                        └──────────────▶ Core へ戻る
```

重要なのは最後の戻り線です。**Effectの結果は、成功も失敗も、必ずActionとして膜を通って戻ります。** 戻りの配線を書き忘れることがないのは、エンジンがそう作られているためです。ループの実装はプロジェクトに1つしかありません（この設計に至った経緯は §8-2）。

### 2-3. Before / After

#### Before — 結合されたNext.jsコンポーネント

UI・非決定性（`new Date()`）・副作用（`fetch`）が同じ場所にある典型例です。

```tsx
// src/components/Counter.tsx
'use client';
import { useState, useEffect } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  const [lastTouched, setLastTouched] = useState('');

  useEffect(() => {
    fetch(`/api/log?count=${count}`);        // ❌ UIの中に副作用（追跡できない）
  }, [count]);

  const handleIncrement = () => {
    setCount(count + 1);
    setLastTouched(new Date().toISOString()); // ❌ UIの中に非決定性（テストできない）
  };

  return (
    <div>
      <p>Count: {count} (Updated: {lastTouched})</p>
      <button onClick={handleIncrement}>Increment</button>
    </div>
  );
}
```

#### After — Spactaによる分離

**用語を1つ。** 以下に出てくる `correlationId` は**書き込みリクエストの整理番号**です。楽観的更新（先に画面を書き換え、後からサーバに送る）をしたあと、どの書き込みの結果が返ってきたのかをCoreが照合するために使います。**サーバが採番するIDとは別物**で、クライアント側で発行します。

**① `types.ts` — 契約**

```ts
export type InitData = { now: string; initialCount: number };

export type State = {
  count: number;
  lastTouched: string;
  pending: string[];      // 実行中の書き込みのcorrelationId。Coreが持つ（Shellではない）
  notice: string | null;
};

// この機能だけのEffect語彙。共有unionは存在しない。
// ここにメンバを足しても、このディレクトリの外は変わらない。
export type Effect =
  | { type: "SAVE"; correlationId: string; key: string; value: string }
  | { type: "LOG"; message: string };

// 答えの形も、質問した機能が宣言する。サーバが採番したidがここに入って返る。
export type Answer = { id: string };

export type Action =
  | { type: "INCREMENT"; now: string; correlationId: string }
  | { type: "RESET"; now: string }
  // 書き経路の戻り。Coreは両方を処理する必要がある。
  // correlationId が null なのは、答えを求めていないEffect（LOG）の結果。
  | { type: "EFFECT_SUCCEEDED"; correlationId: string | null; data?: Answer }
  | { type: "EFFECT_FAILED";    correlationId: string | null; message: string };
```

**② `core.ts` — 純粋な計算のみ**

```ts
export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      // 楽観的更新：先に反映し、書き込みを実行中として記録する
      const next: State = {
        ...state,
        count: state.count + 1,
        lastTouched: action.now,          // ✅ 時刻はActionから注入される
        pending: [...state.pending, action.correlationId],
      };
      return [next, [{ type: "SAVE", correlationId: action.correlationId,
                       key: "count", value: String(next.count) }]]; // ✅ 実行ではなく宣言
    }

    case "EFFECT_SUCCEEDED": {
      if (action.correlationId === null) return [state, []];   // LOGの答え。書き込みではない
      // このカウンタはサーバのidを格納する場所がないので、実行中の記録を消すだけ。
      // 保存した行を画面に持つ機能は、ここで action.data.id を採用する（下記）。
      return [{ ...state, pending: state.pending.filter(c => c !== action.correlationId) }, []];
    }

    case "EFFECT_FAILED": {
      // 補償。記録した書き込みだけを取り消す
      if (action.correlationId === null) return [state, []];
      if (!state.pending.includes(action.correlationId)) return [state, []];
      return [{ ...state,
                count: state.count - 1,   // ← この補償が意味的に正しいかは verify の管轄外（§1-5）
                pending: state.pending.filter(c => c !== action.correlationId),
                notice: action.message }, []];
    }

    case "RESET":
      return [{ ...state, count: 0, lastTouched: action.now },
              [{ type: "LOG", message: "reset" }]];

    default: {
      const _exhaustive: never = action;  // 分岐を足し忘れるとtscが落ちる
      throw new Error(String(_exhaustive));
    }
  }
}
```

> **`Answer` を実際に採用する機能は、`EFFECT_SUCCEEDED` でこう書きます。**
>
> ```ts
> case "EFFECT_SUCCEEDED": {
>   if (action.correlationId === null) return [state, []];
>   const id = action.data?.id ?? null;
>   const rows = id === null
>     ? state.rows
>     : state.rows.map(r =>
>         r.tempId === action.correlationId
>           ? { ...r, id, tempId: null }        // ← 仮IDをサーバ採番のidに差し替える
>           : r);
>   return [{ ...state, rows,
>             pending: state.pending.filter(c => c !== action.correlationId) }, []];
> }
> ```
>
> **`action.data` を使うべき機能で使わないという不具合が、実際に検出されずに残っていました**（§8-3）。上のカウンタは採用する対象を持たないため消しているだけで、「採用しなくてよい」という例ではありません。

**③ `perform.ts` — この機能のIO**

```ts
import { post } from "@/shared/runEffect";   // post<T>(url, payload): Promise<T | null>
import { assertNever } from "@/shared/types";
import type { Answer, Effect } from "./types";

export async function perform(effect: Effect): Promise<{ data?: Answer } | null> {
  switch (effect.type) {
    case "SAVE": {
      // 戻り値のidはサーバが採番したもの。Coreで生成してはいけない
      const answer = await post<Answer>("/api/sample", { key: effect.key, value: effect.value });
      return answer && { data: answer };   // post は 204 のとき null を返す
    }
    case "LOG":
      console.log(effect.message);
      return null;              // 答えを求めていないEffectには持ち帰る値がない
    default:
      return assertNever(effect);
  }
}
```

**④ `shell.tsx` — JSXの配線のみ**

```tsx
"use client";
import { useSpacta } from "@/shared/spacta/react";
import { CounterActions } from "./components/CounterActions";
import { CounterSummary } from "./components/CounterSummary";
import { init, summarize, update } from "./core";
import { perform } from "./perform";
import type { Action, Answer, Effect, InitData, State } from "./types";

export function SampleShell({ initData }: { initData: InitData }) {
  // 状態はエンジンが保持し、Effectのキューもエンジンが直列に回す。
  // now と id は膜の外側（アダプター）で採取され、Actionの値としてCoreに届く。
  const [state, dispatch] = useSpacta<State, Action, Effect, Answer>({
    init: () => init(initData), update, perform,
  });

  return (
    <section className="space-y-6">
      <CounterSummary
        count={state.count}
        lastTouched={state.lastTouched}
        summary={summarize(state)}      // 表示用の整形も純粋関数（Core）に置く
        pending={state.pending.length}
        notice={state.notice}
      />
      <CounterActions
        onIncrement={() =>
          dispatch((mint) => ({ type: "INCREMENT", now: mint.now, correlationId: mint.id() }))}
        onReset={() => dispatch((mint) => ({ type: "RESET", now: mint.now }))}
      />
    </section>
  );
}
```

`shell.tsx` に `useState` も `new Date()` も `crypto.randomUUID()` もありません。状態保持・非決定性の採取・Effectのループはいずれも機構であり、機能ごとに書き直す対象ではないためです。

> ただし、**shellがこの規律を守っていることは検査されていません。** `verify` の出力にも `Judgement kept out of shell.tsx → not checked` と印字されます。ここはSpactaで数少ない、人間が確認する必要のある場所です。

### 2-4. 標準的なNext.jsとの対比

| 観点 | 標準的なNext.js | Spacta |
|---|---|---|
| **関心の結合** | 状態・fetch・日時・レンダリングがコンポーネント内に混在 | **物理的分離。** `core.ts` は副作用から隔離される |
| **AIとの協働** | 結合したコードベース全体の理解が必要 | **コンテキストの限定。** 1機能のファイルだけで作業できる |
| **ルールの強制** | ドキュメントとチーム慣習（hope-prompt）。AIは無視・忘却しうる | **機械的検証。** AST解析で強制（`verify`） |
| **データフロー** | 状態変化・fetch・副作用が各種フックに分散 | **単一方向のループ。** UI → Action → Core → State & Effect → perform → Action |
| **見た目の保守** | インラインのTailwind値やレイアウト重複を手作業でリファクタ | **検知の自動化。** `garden` が片付け指示書を出す（§5） |

---

## 3. `verify` が保証すること／しないこと

隔離は、それを信頼できて初めて意味を持ちます。Spactaは「境界は守られているはず」と主張するのではなく、TypeScriptの構文木を歩いて確認します。

**Law（掟）は10本**です。以下は代表的な7本で、**L5・L6・L8はここでは省きます**（L6は検証器自身の検査で後述、L8は情報表示のみ）。全10本は [`SPACTA.md`](../../SPACTA.md) にあります。

| | 内容 |
|---|---|
| **L1 隔離** | 機能が他機能の内部をimportしない |
| **L2 純粋性** | `core.ts` にIOと非決定性を書かせない（`fetch` / `new Date` / `Math.random` / `await` …） |
| **L3 注入** | 非決定性は値として渡す。**サーバ採番IDも含む** |
| **L4 網羅性** | `effect.type` のswitchは網羅的に閉じる |
| **L7 逆依存の禁止** | `shared/*` が `features/*` の内部をimportしない |
| **L9 / L10** | `components/` と `shared/ui` でIO禁止・`useState` 禁止。AIに委譲する量が最も多い場所のため |

L4に補足があります。網羅的に閉じる形は2つあります。`assertNever` / `: never` で閉じるのが基本ですが、**Effectを1本しか宣言していない機能ではTypeScriptが1要素unionを潰すため `never` が書けません。** その場合は、`undefined` を戻り型に含まない関数の最後の文にswitchを置きます（メンバを足すとTS2366が出ます）。

**Lawに例外指定（ignore / disable コメント）はありません。** 抜け道を作らないのが設計判断です。`garden` の片付け提案だけは `// garden:keep <理由>` で保留できますが、保留した項目も指示書に残り続けます。

### 実際の出力

`verify` は実行のたびに、何を何件走査したか、この緑が何を保証し何を保証しないかを印字します。

```
  Scanned:
    L1  cross-feature-imports         6 files   ✓ 0
    L2  core-purity                   1 files   ✓ 0
    ...
    —   engine-portability            1 files   ✓ 0
    —   data-layer-import             6 files   ✓ 0

  Tiers: sample T3
    A tier states what this project adopted, not a violation: no tier changes the exit code.

✓ Laws (L1, L2, L3, L4, L5, L7, L9, L10): No violations
✓ Blocking checks that are not Laws (engine-portability, data-layer-import): No violations

  Guaranteed by this green:
    L1  No feature imports another feature's internals  (6 files)
    ...
  NOT guaranteed by this green:
    - Type integrity (props / contracts)              → run `tsc --noEmit` separately
    - Judgement kept out of shell.tsx                 → not checked
    - Effect results actually reaching Core at runtime → partially checked
    - Write-path round trip in features below T3      → not checked
    - Semantic correctness                            → never checked
```

緑を根拠に差分を読まずに済ませる前に、この2つのリストを確認してください。特に次の2点です。

- **型整合は緑に含まれません。** `tsc --noEmit` を別途実行してください（`--tsc` フラグでまとめて実行できます）。
- **shellに判断が溜まっていないことも緑に含まれません。**

実行時間は57ファイルのプロジェクトで0.8秒、starterで0.25秒です。毎イテレーション実行できる速度です。

### 段位（Tier）— 何を採用したかを機能ごとに印字する

Spactaを部分的にしか採用していない機能にも `verify` は緑を出します。それは「その機能について往復が検証された」という意味ではありません。そのため、何を採用したのかを機能ごとに印字します。

| 段位 | 意味 |
|---|---|
| **T1** | `core.ts` はあるが、Effectを宣言しない（読み取り専用の画面など） |
| **T2** | Effectを宣言するが、`correlationId` を運ばない、または戻りのcaseが揃っていない。**書き経路の往復は検証されていない** |
| **T3** | Effectが識別子を運び、Coreが成功・失敗の両方を処理する。**往復が閉じている** |

**段位は `verify` が `core.ts` の形から自動判定します**（Effectが `correlationId` を運ぶか、Coreが `EFFECT_SUCCEEDED` / `EFFECT_FAILED` の両caseを持つか）。自己申告ではありません。

**ただしそれは形の判定であって、往復が意味のある往復になっている保証ではありません。** T3と判定されながら振る舞いのテストが1つもない機能が実際に2つありました（§8-3）。段位は「Spactaのどこまでを採用したか」の表示であって、正しく動くことの保証ではありません。

**段位は違反ではないので、赤にならず終了コードも変えません。** 往復を必要としない機能に往復を強制するのは過剰であり、利用者が警告を無視する習慣をつけることになります。部分的に採用した人が受け取るのは、実際には保証されていない安心感で、これは保証がないことより有害です。

### その他の仕組み

**Lawではないが緑を止める検査。** Lawは10本のままで、それとは別に緑を止める検査が2つあります（エンジンに `react`/`next` を入れない、機能がデータ層をimportしない）。Spactaが普遍的に主張する性質ではないため、11本目のLawにはしていません。

**0件走査は緑ではありません。** 走査したファイル数が0件のとき、`verify` は `INCONCLUSIVE`（終了コード2）を返します。「違反がなかった」と「何も見ていなかった」は区別できなければ同じ意味だからです。

**L6は検証器自身を検証します。** `verify/fixtures/` に植えた既知の違反を必ず弾くこと、正常な検体を誤検出しないこと、レジストリの全globが参照コーパスで最低1ファイルを選ぶこと。3つ目があるのは、globのタイプミスで0件走査になっていた検査が、自己テストを通過したうえで緑を報告していたためです。

**L1が見るのは静的importだけです。** `import ... from "..."` の宣言を歩いています。**動的 `import()`、`require()`、文字列を組み立てたパスは見ていません。** 意図しない違反を検出するためのもので、意図的な回避は防げません。

---

## 4. 実際の作業ループ

### 4-1. 実装はAIが書く。人間の仕事は「凍結」と「順序」

* **実装は全てAIが書きます。** `core.ts` の純粋ロジックも、`shell.tsx` や `components/` のUI構造もです。

* **人間に残る仕事は2つで、これは任意ではありません。**
  1. **契約（`types.ts`）を先に凍結する。** §1-2の「衝突ゼロ」が成立した条件です。AIに書かせてもよいですが、確定させるのは人間です
  2. **上流を実ファイルとして確定させてから、下流を委譲する。** `shared/ui` → `components/` → `shell` → `app/` の順です。**散文によるAPIの説明は契約になりません。コードだけが契約です**（§7-3）

  この2つを飛ばすと、Lawが緑のまま並列作業が衝突します。

* **任意なのはUIの調整です。** AIが得意なのは、学習データに多く含まれる機械的な反復構造 — reducer、バリデーション、状態遷移 — です。逆にAIが扱えないのは、「何が正しく見え、正しく機能するか」という蓄積された感覚です。`shell.tsx` は `core.ts` のロジックに触れないため、UIの調整は構造上安全に行えます。生成物が問題なく動くならそのまま出荷して構いません。

### 4-2. 1機能の進め方

```
1. 人間   features/todo/types.ts に State / Action / Effect / InitData を書いて凍結する
             ↓
2. 人間→AI 「SPACTA.md と features/todo/types.ts を読んで core.ts を実装して」
             ※ 他機能のファイルは渡しません。これがSpactaの本題です
             ↓
3. AI     実装 → verify → 赤なら自分で直す → 緑になるまで繰り返す
             ↓
4. 人間   verify --tsc で型も確認（型整合は verify の緑に含まれないため）
             ↓
5. AI     perform.ts → components/ → shell.tsx を実装（同じループ）
             ※ 上流から順に。並列に投げるなら上流が実ファイルになってから
             ↓
6. 人間   見た目を調整する。または garden で片付け指示書を出す（§5）
```

AIに渡すのは **`SPACTA.md`（79行）とその機能の `types.ts`** だけです。他機能のファイルも、この人間向けガイドも渡しません。

---

## 5. Gardener（`garden`）

速く書き進めると、UIコードに場当たり的なTailwindの値（`bg-[#ff0000]`）や重複したマークアップが溜まります。

**`garden` 自体はLLMを呼びません。** `verify` の info/warn（機械が検出するが、修正の担い手がいなかったもの）を集約し、AIが機械的に処理できる指示書JSON（`garden-report.json`）に変換する決定論的なスクリプトです。検知と修正を分離してあるため、**`garden` を実行してもコードは変更されません。**

- 書いている最中は雑に進めて構いません
- `garden` が指示書を出したら、それをコーディングエージェント（Claude Code等）に渡して実行させます。**その判断と課金は利用者側です**
- `verify` が赤なら、指示書はタスクを出しません（片付けよりLawの修正が先）
- 意図的な保留は対象行に `// garden:keep <理由>` と書けます。保留した項目も指示書に残ります
- 片付け後も `verify` は緑である必要があります。**巻き戻しは git で行ってください**（ツールは巻き戻しません）

*なお、UIの見た目の統一だけは1機能に閉じては保てません。ページ間でデザインを揃えるときは、複数機能のUIを横断して確認しながら整えることを推奨します（importするわけではないので隔離のルールには触れません）。これは調整フェーズの推奨であって、実装時の作業分割の規約ではありません。*

---

## 6. よくある質問

**Q. 既存のNext.jsアプリに後から入れられますか。**
構造上は可能です。`verify` は機能ごとに段位を出すので、移行した機能から順に T1 → T3 と上げられます。ただし既存アプリへの適用例はまだありません。

**Q. 1画面に2つの機能を置きたいときは。**
`app/page.tsx`（サーバ境界）が両方のshellを並べます。**L1が歩くのは `src/features/` の中だけなので、`app/` は複数の機能をimportできます。** ただし2つの機能は状態を共有しません。共有したくなった場合、それは1つの機能である可能性があります。

**Q. 認証状態のような、全機能で使う状態は。**
サーバ境界（`app/**/page.tsx`）で読み、**各機能の `InitData` の一部として配ります。** **Spactaにクライアント側のグローバルストアはありません。** 「ログイン状態が変わる」は新しい `InitData`（＝ナビゲーションかリロード）であって、Effectではありません。

**Q. フォームやルーティングはどこに置きますか。**
フォームの状態は機能の `State`、送信は `Effect`、バリデーションは `core.ts` の純粋関数です。ルーティングは `NAVIGATE` のようなEffectにして `perform.ts` から実行します（`next/navigation` はコンポーネントでは禁止 — L9）。

**Q. Server Actions は使えますか。**
禁止していませんが、推奨もしていません。Spactaの立場は「IOは `perform` から1本の経路で出す」なので、Server Actions はその経路の外にもう1本の道を作ります。§7-2 のとおり、Next.jsの暗黙性はSpactaのLawがほぼ素通しにしている領域です。

**Q. テストはどう書きますか。**
`core.ts` は純粋関数なので、`(state, action)` を渡して返り値を検査するだけです。フレームワークは不要です。Spactaが推奨するのは**振る舞いのassertionを書くこと**です。それがない機能は、壊れていても検出されません（§8-3）。

**Q. Lawに例外指定はありますか。**
ありません（§3）。

---

## 7. Spactaが解決していないこと

この章に挙げるのは、版が上がっても残る構造的な限界です。運用原則は「穴があることは許される。穴を隠すことは許されない」です。

前提として、**Spacta単体はパラダイムシフトではありません。** 「AIが書くコードを、機械が検証可能な構造に閉じ込める」というアプローチの初期実装の一つです。

**構造的に解決できているもの：**

- 機能間のコードレベル結合（L1 / L7）
- ロジックと外界の暗黙接続（L2 / L3）— coreの出力が `(state, action)` だけで決まる
- 分岐の書き忘れ（L4）
- hope-prompt問題 — AI時代固有の問題設定で、Spactaで最も独自性のある部分

以下は解決できていないものです。

### 7-1. データを経由した結合

L1はimportを禁じますが、チェックアウト機能と在庫機能が同じDBテーブル・同じAPIを触れば、遠隔作用はデータ層で復活します。マイクロサービスが学んだ教訓（コード結合を消すと、結合はスキーマとプロトコルに移る）と同型です。**verifyはコードしか見ていません。**

> *参照アプリ（未公開）での実測：機能ゾーンが64ファイル4593行に対し、**データアダプタ層が7ファイル1250行**。契約ファイル（`shared/types.ts`）は37行なので、**データ層は契約の33倍**あります。`TRACE_SELECT` という1つのSQL定数を複数機能の読み経路が共有しており、テーブルに列を1つ足す判断がそれら全部に同時に波及します。**L1は緑のままです。** この結合を生んだのは「読みモデルの組み立てをsource側でやる」という設計判断であり、**10本のLawのどれも賛成も反対もしませんでした。***

`npm run measure` は共有シンボルごとの利用範囲（spread）を出力するので、結合の量は計測できます。防止はできません。

### 7-2. Next.js自身の暗黙性

RSCのキャッシュ意味論、revalidateのタイミング、client/server境界のシリアライズ — Next.jsで最も追跡が難しい部分はここにあり、SpactaのLawはこれをほぼ素通しにしています。加えてNext.js本体はServer Actionsや暗黙のfetchキャッシュなど、暗黙の機構を増やす方向に進化しています。**Spactaはフレームワークの進化方向とは逆を向いています。**

### 7-3. 共有上流の変更

L1は横方向、L7は逆方向を止めますが、**正しい向きの縦の依存**（`components` / `shell` → `shared/ui`）は**どのLawも守っていません**。`shared/ui` の `Button` のprop名を変えれば下流は一斉に壊れますが、検出するのは `verify` ではなく `tsc` です。§4-1 の「上流を先に確定させる」はこのために必要です。

### 7-4. 機能が本当にエンジンを使っているか

L4は「`effect.type` を分岐するswitch」を見つけたときだけ発火します。**エンジンを使わず自前のループを書いたこと自体は `verify` は検出しません。** ループの実装を1つに集約したので構造的には起きにくくなっていますが、検査で閉じてはいません。

### 7-5. 意味的な正しさ

`count + 2` は緑で通ります（§1-5）。verifyは境界を検査するもので、意味は検査しません。

### 7-6. 保証の階段の位置

ソフトウェアの保証には段階があります。

> **構文的な境界検査（リント） → 静的解析 → property-based testing → モデル検査 → 形式的証明**

安全重要システム（MISRA、ISO 26262、SPARK Ada、seL4）は上の段にあります。**Spactaの `verify` は最下段の構文的境界検査です。**

これは意図的な選択です。コストが最も低く、AIの write→run→fix ループに組み込める段はここだけです。毎イテレーション実行してもコストが破綻しない段が他にありません。

上の段への道は構造的に開いています。coreが純粋なステートマシンであることは、property-based testing やモデル検査の入力にそのまま使えることを意味します。

**まとめると、「Next.jsの部分的な問題しか解決しない」は事実です。** ただしその部分は、AIエージェントが並列に安全に書ける単位を作るという目的に対しては要点にあたります。全部を解決していないことと、正しい一部を解決していることは両立します。

---

## 8. 検査自身を検証する仕組み

Spactaが他のアーキテクチャ規約と最も違うのはこの部分です。**検査があることではなく、その検査が実際に機能しているかを検査する工程があることです。**

### 8-1. 主張している定理

純粋なcoreには、Actionログを記録するだけでフライトレコーダーになる性質があります。Spactaが主張している定理は次のとおりです。

> **verifyが緑なら、機能Fのバグは (1) Fの中に閉じ、(2) `(initData, actions[])` だけから再現でき、(3) 隠れた入力を持たない。**

Rustの借用チェッカが価値を持つのは、チェッカ自体ではなく「この構造的性質が成り立つならこのバグのクラス全体が不可能になる」という定理が証明されているためです。Spactaの定理は当初、主張されているだけで検算されていませんでした。

### 8-2. リプレイ照合と、そこで見つかったもの

`replay/` に照合の仕組みがあります。記録するのは `initData` とActionの列だけで、Stateは記録しません（Stateを記録すると照合が自明に成功し、何も検証しません）。照合はその記録から `init` と `update` だけで状態を再導出し、最終状態だけでなく各Action適用後の中間状態でも突き合わせます。

これを実装した結果、**定理の (2) に対する反例が実在したことが分かりました。** Effectのループが同一プロジェクト・同一著者の中で3回手書きされ、うち2つがサーバの答えを捨てていました。非直列なループのため、Actionログをリプレイした最終状態とユーザーが実際に見た画面が一致しません。

この不具合は、**verify緑・tsc 0エラー・E2E通過のまま残っていました。** 3つのゲートが同じ一点で同時に検出できていなかったことになります。

対処は検査ではなく構造で行いました。`shared/spacta/runtime.ts` がループの唯一の実装になり、識別子を持たないEffectにも結果を無条件にActionとして返します。**唯一の実装が正しければ、往復は検証する対象ではなくなります。** ただし §7-4 のとおり、`verify` が配線を追跡するようになったわけではありません。

以降、エンジンで駆動した全シナリオで (2) は成立しています。同じシナリオを以前の手書きループで走らせると発散します。

### 8-3. 変異テスト — 照合装置自体が何も検出していなかった

「穴を植えて、検査が落ちるのを見る」工程を5回行い、**5回とも何かが見つかりました。** 最も重かったのは次の件です。

> `pageview` 機能が**サーバの採番IDを採用しない**という穴を植えたところ、リプレイ照合14チェックも直列化テスト45アサーションも通過した。何も検出しなかった。

往復という機構が存在する唯一の理由が、その機能では一度も検算されていませんでした。仮IDのまま残るデータは決定論的なので、リプレイは自分自身と一致します。

5回試して5回とも見つかったことから手作業を止め、`tools/mutate.mjs` を作りました。T3機能の `core.ts` に往復を壊す変異を植え、行動ゲートを実行し、**生き残った（＝検査されていない）変異を報告します。**

初回結果は **10変異中5つ生存**。2機能は振る舞いのassertionが1つもなく、`verify` はどちらもT3と判定していました（形は満たしているため当然です）。**リプレイ照合は10変異中1つも検出しませんでした** — 再現性しか見ていないという設計上の性質が、実測で確認されたことになります。対処後は 10 killed / 0 survived です。

### 8-4. 検算できないものも印字する

データ層の共有（§7-1）は**プロセス内のActionログには現れません**。したがって定理の「他機能への波及の不在」はこの方法では検証不能であり、照合は毎回そのことを出力に記載します。

副次的に、監査可能性が得られます。障害時の状態遷移を決定的にリプレイでき、「なぜこの状態になったか」に記録付きで答えられます。バグの不在は証明できませんが、事後の追跡可能性は構造で確保できます。

---

## 9. 現時点の未成熟さ

この章の内容は版ごとに変わります。§7 の構造的な限界とは性質が異なります。

- **道具がLawの30倍ある。** `verify.mjs` 2600行超が `SPACTA.md` 79行を守っています。単一実装・単一著者です
- **参照アプリが小さい。** 10機能のうち4つはT1で、往復を一度もしません。往復を実証しているのは5機能です
- **npmパッケージを配布していません。** 現状は `node verify/verify.mjs <projectRoot>` を直接実行します
- **マイナー版で構造が変わります。** 共有 `Effect` union の解体（§2-1）はその例です。**1.0まではこの規模の破壊的変更が起きうると考えてください。** 移行内容はCHANGELOGに記載します
- **中心命題がサンプル1つでしか測られていません。** 「1機能を追加・変更するのに必要な参照範囲は増えない」を、別ドメインのアプリで確かめる必要があります
- **`SPACTA.md` だけを渡されたAIが別ドメインのアプリを作れるか**は未検証です
- **分量の複雑性は減りません。** Spactaの膜が分離するのは振る舞いの複雑性だけです。JSXの行数、CSSのバリエーション、アニメーションの状態数は減りません。この区別も未実測です

---

## 10. 設計の背景

*（ここから先は背景です。使うだけなら読み飛ばして支障ありません。また、この2章の主張は見通しであり、§7〜§8のような実測の裏付けはありません。）*

### 10-1. 取引条件が変わった

FCISもElmも以前から存在していましたが、主流にはなりませんでした。理由は**人間には冗長すぎて割に合わなかった**ためです。網羅的なswitch文、全分岐への明示的な型付け — 検証可能性の対価として人間が支払う記述コストが高すぎました。

生成AIはこの条件を変えました。AIにとって反復的で明示的な構造は、生成コストがほぼゼロであり、かつ正確に再生産できる形式です。**記述コストが消えた結果、検証可能性だけが残ります。**

> **AI時代に、「書くコスト」と引き換えに「検証可能性」を買う取引の条件が変わった。その新しい条件で設計をやり直す。**

同時に、AIは新しい問題も持ち込みました。生成されたステートマシンが正しいかどうか、人間には即座に判断できないという問題です。Spactaは、AIが得意な明示的構造の量産を利用し、AIが保証できない遵守をverifyで塞ぐ、という2点を1つのループに組んだものです。**個々のパターンはすべて既存のものであり、Spactaの中身はこのループの設計です。**

### 10-2. 系譜はElmではなく構造化プログラミング

Redux / Elm と同じパターンだという指摘は正しいです。異なるのは、境界が規約ではなく物理的に強制され機械的に検証される点だけです。

ただし参照すべき系譜はElmではなく**構造化プログラミング**だと考えています。

Dijkstraの「goto有害論」の主張は、gotoを使うと制御フローが追跡不能になり、プログラムの正しさをローカルに推論できなくなる、というものでした。2013年のBookout対Toyota訴訟では、鑑定人がエンジン制御ソフトに約1万個のグローバル変数と多数のMISRA違反を指摘しました。判断の根拠になったのはバグの存在証明ではなく、**このコードは因果を推論できないと示されたこと自体**です。追跡不能性そのものが過失の証拠になりました。

SpactaのL1/L2は、同じ主張をデータフローに適用したものです。「バグを無くすのではなく、バグを局所的・明示的・決定的にする」という定式化は、この系譜に位置づきます。

ただし教訓もあります。構造化プログラミングがパラダイムシフトになったのは、規約集としてではなく**言語仕様に組み込まれたから**です。この基準で見ると、SpactaはNext.jsの上に載せた規約とリンタです。パラダイムシフトになるには、この制約がフレームワーク層・言語層に採用される必要があります。

---

## 11. Next.jsの外へ

Spactaの考え方を他の言語・分野へ持ち出す場合、**「間違いが許されない分野」ほど価値が薄く、「検証文化がないのにAIが大量にコードを書く分野」ほど価値が濃い**という非対称性があります。

### 11-1. 先行例がある領域

- **Java・銀行系**: ArchUnitが「アーキテクチャ境界をASTレベルで検査してビルドを落とす」ことを10年近く行っています（L1/L7相当）。イベントソーシングは「Actionログからの決定的リプレイ」そのもので、勘定系の監査要件から生まれました
- **車載・安全重要**: MISRA、ISO 26262、静的解析、形式証明。Spactaの構文的検査より強い保証が既に義務化されています
- **Rust**: **Rustコンパイラ自体が既にverifyループとして機能しています。** AIにRustを書かせると「borrow checkerが通るまで直す」という、Spactaの「緑になるまで直す」と同型のループが自然に発生します。AIとRustの相性が良いとされる理由はこれだと考えています

これらは設計判断を輸入する対象です。

### 11-2. 適用できそうな領域

1. **AIエージェント / LLMオーケストレーション。** エージェントのコード — ツール呼び出し、リトライ、状態管理、プロンプト合成 — はアーキテクチャ規律のない新興分野です。制御ロジックを純粋なステートマシン（`(state, event) → (nextState, toolCall)`）にし、LLM呼び出しとツール実行をエッジに追い出せば、**エージェントの実行がリプレイ可能になります。** 「なぜあのときこのツールを呼んだのか」にログから決定的に答えられます
2. **レガシー移行（C++→Rust、COBOL→Java）の作業プロトコル。** 難点は「複数のAIエージェントに並行翻訳させたとき、正しさをどう機械判定するか」で、Spactaの初期評価（凍結契約への並行実装）と同じ問題構造です。ただし境界リントだけでは足りず、意味的等価性の検証まで必要になるため、1.よりハードルが高くなります
3. **モバイル（SwiftUI / Jetpack Compose）。** SwiftのTCAはパターンとして普及済みで、欠けているのはverify相当の機械的強制とAIループの設計です

### 11-3. 言語ごとに作るのか、言語をまたぐのか

Spactaを層に分解すると次のようになります。

- **Law（L1〜L10）** — 言語非依存。仕様として書ける
- **Verifier** — 言語ごとに必要（ASTは言語固有）
- **Form（ディレクトリ構成・フレームワーク対応付け）** — フレームワークごとに必要

これは **LSP（Language Server Protocol）と同じ構造**です。LSPは「プロトコルは一つ、サーバーは言語ごと」で全言語に広がりました。Lawを言語中立な仕様として切り出せば、verifierは各言語コミュニティがプラグインとして実装できます。

別の見方として、HaskellやKokaのような効果システムを持つ言語では、L2は型システムが強制します。つまり**verifierは、主流言語に欠けている効果システムとモジュール境界を、リントで後付けするシムです。**

---

## 次のステップ

* **セットアップ：** [setup.md](../setup.md)
* **AI向け実行ルール（79行）：** [`SPACTA.md`](../../SPACTA.md)
* **決着した設計判断と、それを守っている検査：** [`spacta-decisions.md`](../../spacta-decisions.md)
* **決着していないこと：** [`spacta-open-questions.md`](../../spacta-open-questions.md)
* **設計メモ（Attention・認知負荷まわり）：** [α評価](spacta-alpha-evaluation.md)

実行方法（npmパッケージは未配布のため直接実行します）：

```sh
node verify/verify.mjs <projectRoot>          # 境界のみ
node verify/verify.mjs <projectRoot> --tsc    # 境界のあとに型
node metrics/measure.mjs <projectRoot>        # 共有シンボルの利用範囲を測る
node garden/garden.mjs <projectRoot>          # 片付け指示書（JSON）を出す
```

bunでも動作します（`bun verify/verify.mjs <projectRoot>`）。`src/` か `app/` を含むディレクトリを指定してください。それ以外を指すと0件走査になり、緑を名乗らず終了コード2を返します。

**有用なフィードバックは、「ここが分かりにくい」と「この主張はverifyが実際には確かめていないのでは」の2つです。**
