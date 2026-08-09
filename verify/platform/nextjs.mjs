/**
 * Next.js (App Router) のファイル規約を Spacta の「役割」に翻訳する表。
 *
 * なぜ分離するか。CHECKS は掟のレジストリであって、フレームワークの命名規約の置き場ではない。
 * v0.9.3 で見つかった穴がその代償だった —— L5 が `app/` を直書きしていたため、Next.js が公式に
 * サポートする `src/app/` レイアウトでは L5 が 0 ファイル走査のまま緑になり、しかも信頼境界は
 * 「保証した」と印字していた。パッチは当てたが、`layout.tsx` / `error.tsx` / `middleware.ts` は
 * 依然どの err 検査にも掛からない。**名前を列挙する設計は、フレームワークが進化するたびに
 * 静かに穴を開ける。**
 *
 * 処方は「もっと多くの名前を列挙する」ことではない。掟が **役割** を語り、この表が
 * **名前 → 役割** を引き受け、**役割が引けなかったファイルは黙って無視せず申告する** ことである。
 * 未知の規約は緑でも赤でもなく INCONCLUSIVE —— 「違反が無い」と「見ていない」は別の主張である。
 *
 * この表は Law ではなく Form である。プロジェクトが Form を変えたなら、この表も更新する
 * (docs_HUMAN-ONLY/setup.md step 5)。ただし **利用者の設定ファイルからは差し替えられない**:
 * 検証器が何を見るかを利用者が実行時に変えられると、L6 が自己言及的に空洞化する。
 */

// 役割 → その役割が実際に受けている施行。`what` と `unchecked` は印字されるので英語で書く
// (verify.mjs ヘッダーの comment language boundary を参照)。
//
// `laws: []` は穴ではなく **宣言された弱さ** である。役割が名指しされていれば、何が検査されて
// いないかを印字できる。名指しできないファイルだけが本当の穴である。
export const ROLES = {
  source: {
    laws: ["L5"],
    what: "Server boundary — performs IO, invents no time/random/id of its own",
  },
  core: {
    laws: ["L2", "L3"],
    what: "Pure state machine — (state, action) => [state, effects]",
  },
  shell: {
    laws: ["L1", "L4"],
    what: "Client edge — state wiring and Action transformation",
    unchecked: "that judgement has not accumulated here (L10 covers components, not shells)",
  },
  component: {
    laws: ["L9", "L10"],
    what: "Pure function of its props",
  },
  "shared-ui": {
    laws: ["L9", "L7"],
    what: "Presentation primitive, decoupled from feature concepts",
    unchecked: "that widget-local state stays non-domain — by design, see L10's scope",
  },
  runtime: {
    laws: ["L4", "L7"],
    what: "The single place an Effect becomes IO",
  },
  contract: {
    laws: [],
    what: "Frozen membrane vocabulary (State / Action / Effect / InitData)",
    unchecked: "everything — types.ts is enforced by tsc and by export-ownership (info), not by a Law",
  },
  shared: {
    laws: ["L7"],
    what: "Non-isolated shared budget",
  },
  edge: {
    laws: ["L7"],
    what: "Designated entry point for non-determinism (time, ids, queries)",
    unchecked:
      "purity — this is the one layer allowed to read the world, so L2/L5 deliberately do not apply. Coupling through the data it returns is the project's largest known gap",
  },
  frame: {
    laws: ["L5"],
    what: "Application frame — may read the world, draws chrome around features",
  },
  boundary: {
    laws: [],
    what: "App-router UI boundary (error / loading / not-found)",
    unchecked:
      "IO and local state — L9/L10 are scoped to src/ by SPACTA.md and do not reach app/. An error boundary is a client component and idiomatically holds hooks",
  },
  "feature-internal": {
    laws: ["L1", "L4"],
    what: "Feature-internal code with no specialised role (labels, constants, local helpers)",
    unchecked:
      "purity and statelessness — only core.ts and components/ carry those Laws. Logic that deserves them belongs in core.ts",
  },
  test: {
    laws: [],
    what: "Test code",
    unchecked: "everything — tests are not application code and no Law is aimed at them",
  },
  unscoped: {
    laws: [],
    what: "Code outside the Form's named layers",
    unchecked:
      "almost everything — this file sits in no layer a Law is aimed at. Moving it into a feature or shared/ is what brings it under one",
  },
  ignored: {
    laws: [],
    what: "Not code Spacta governs (config, styles, generated metadata)",
  },
};

// テストはどこに置かれても役割が同じなので、場所ではなく名前で先に引く。
const TESTS = [/(^|\/)__(tests|mocks)__\//, /\.(test|spec)\.tsx?$/];

// 名前 → 役割。**上から順に最初に一致したものを採る**ので、具体的なものを先に置く。
//
// 「知らない規約は黙って無視するのではなく申告する」を成立させるため、この表に
// **推測で穴埋めしない**こと。分類が自明でない新しい Next.js 規約が出たら、
// 適当な役割に押し込めるより INCONCLUSIVE を出させる方が正しい。
const RULES = [
  // --- Spacta が名前を所有する側 (src/) -----------------------------------
  [/^src\/features\/[^/]+\/core\.ts$/, "core"],
  [/^src\/features\/[^/]+\/types\.ts$/, "contract"],
  [/^src\/features\/[^/]+\/shell\.tsx$/, "shell"],
  [/^src\/features\/[^/]+\/components\/.+\.tsx$/, "component"],
  [/^src\/features\/[^/]+\/source(\/.+|\.ts)$/, "edge"],
  [/^src\/shared\/ui\/.+\.tsx$/, "shared-ui"],
  [/^src\/shared\/runEffect\.ts$/, "runtime"],
  [/^src\/shared\/types\.ts$/, "contract"],
  [/^src\/shared\/source(\/.+|\.ts)$/, "edge"],
  [/^src\/shared\/.+\.tsx?$/, "shared"],
  // 受け皿。**専用の役割が無いこと**と**どこにいるか分からないこと**は違う。feature の中に
  // いると分かっているファイルは未知ではない —— 弱い役割として申告できる。INCONCLUSIVE は
  // 前者のためだけに取っておく。でないとコロケートしたテスト1つで走行が止まり、利用者は
  // IGNORED に手を伸ばす訓練を受ける (= 穴より悪い)。
  [/^src\/features\/[^/]+\/.+\.tsx?$/, "feature-internal"],
  // `src/app/` は APP_ROOTS の一つなので、受け皿が先に飲み込んではならない。飲み込むと
  // src/app レイアウトで page/route が unscoped を名乗り、v0.9.3 の穴がそのまま再発する。
  [/^src\/(?!app\/).+\.tsx?$/, "unscoped"],

  // --- フレームワークが名前を所有する側 (app/ または src/app/) -------------
  // 接頭辞は APP_ROOTS で剥がしてから照合する。
  [/^(.+\/)?page\.tsx?$/, "source"],
  [/^(.+\/)?route\.tsx?$/, "source"],
  [/^(.+\/)?default\.tsx?$/, "source"], // parallel routes のフォールバック。page と同格
  [/^(.+\/)?layout\.tsx?$/, "frame"],
  [/^(.+\/)?template\.tsx?$/, "frame"],
  // app router の UI 境界は `component` ではない。SPACTA.md は L9/L10 の適用範囲を `src/` と
  // **パスで**書いているので、app/ 配下のこれらに component を名乗らせると表が到達しない掟を
  // 主張し続けることになる (role-claim テストが恒久的な ⚠ を出す)。掟の文面を黙って広げるより、
  // 別の役割として「何が検査されていないか」を印字する方が正しい。
  [/^(.+\/)?(loading|not-found)\.tsx?$/, "boundary"],
  [/^(.+\/)?(error|global-error)\.tsx?$/, "boundary"],
  [/^(.+\/)?(sitemap|robots|manifest)\.tsx?$/, "source"], // 動的メタデータ生成は IO しうる
  [/^(.+\/)?(icon|apple-icon|opengraph-image|twitter-image)\.tsx?$/, "source"],
  // `_` 始まりのフォルダはルーティングから除外される Next.js の公式規約 (private folder)。
  // ルートではない同居コードなので、app router 配下だが役割は「層の外」である。
  [/^_[^/]+\/.+\.tsx?$/, "unscoped"],
];

// app router がどちらのレイアウトにあってもよい。順序は探索の優先順。
export const APP_ROOTS = ["app", "src/app"];

// プロジェクト直下の設定ファイル等。ここに書くのは「Spacta の対象外」であることが
// 自明なものだけにする —— 判断に迷うものを入れ始めた瞬間、この配列が穴の隠し場所になる。
const IGNORED = [
  /^(src\/)?middleware\.tsx?$/, // 役割は source 相当だが Next.js の実行モデルが特殊。未分類として扱わず、
  //                              かといって L5 を当てるのも早い。現時点では明示的に対象外と申告する
  /^instrumentation(-client)?\.tsx?$/,
  /(^|\/)[^/]*\.config\.[mc]?[jt]sx?$/, // next / tailwind / postcss / open-next ...
  /\.d\.ts$/,
];

/**
 * posix 相対パス (projectRoot から) を役割に翻訳する。
 * 引けなければ null —— 呼び出し側はこれを INCONCLUSIVE にすること。黙って捨てないこと。
 */
export function classifyPath(rel) {
  const q = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  if (IGNORED.some((re) => re.test(q))) return "ignored";
  if (TESTS.some((re) => re.test(q))) return "test";

  for (const [re, role] of RULES) {
    if (re.source.startsWith("^src\\/") && re.test(q)) return role;
  }

  // app router 配下は接頭辞を剥がしてから framework 規約に照合する。
  for (const root of APP_ROOTS) {
    if (q === root || q.startsWith(root + "/")) {
      const inApp = q.slice(root.length + 1);
      for (const [re, role] of RULES) {
        if (!re.source.startsWith("^src\\/") && re.test(inApp)) return role;
      }
      return null; // app router 配下だが規約が分からない = 申告すべき未知
    }
  }

  // ここに来るのは src/ でも app router 配下でもないパスだけであるべき。src/ を通すと
  // `src/features/x/route.ts` が source を名乗って L5 を浴び、`src/features/x/error.ts` が
  // component を名乗る —— app router の規約名は app router の中にしか存在しないので、これは
  // 分類ではなく推測である。この表の方針は「推測で穴埋めしない・分からなければ申告する」。
  if (q.startsWith("src/")) return null;

  for (const [re, role] of RULES) {
    if (!re.source.startsWith("^src\\/") && re.test(q)) return role;
  }
  return null;
}

export const platform = { name: "Next.js App Router", ROLES, APP_ROOTS, classifyPath };
