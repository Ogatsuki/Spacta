import type { Config } from "tailwindcss";

/**
 * 提示の原始値（色・余白・角丸など）の唯一のソース（MEMBRAIN.md §2.5）。
 * shell/components はここで定義したユーティリティ（例: `bg-primary`）だけを使う。
 * コンポーネント固有のバリアント束（tone/size 等の組み合わせ）はここに置かず、
 * `shared/ui` の各コンポーネントに `tailwind-variants` で co-locate する。
 * 中央 `tokens.ts`（クラス文字列を束ねたオブジェクト）は廃止方針。
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#020617", // slate-950 : ページ全体の背景
        surface: "#0f172a", // slate-900   : パネル背景
        "surface-hover": "#1e293b", // slate-800 : secondary ボタンの hover 背景
        foreground: "#f8fafc", // slate-50  : 見出し・数値などの主要文字
        "foreground-muted": "#94a3b8", // slate-400 : 本文・補足文字
        "foreground-subtle": "#f1f5f9", // slate-100 : secondary ボタンの文字
        border: "#1e293b", // slate-800     : 既定の境界線（header/panel）
        "border-strong": "#334155", // slate-700 : secondary ボタンの境界線
        "border-hover": "#475569", // slate-600 : secondary ボタンの hover 境界線
        primary: "#38bdf8", // sky-400        : primary ボタン背景
        "primary-foreground": "#020617", // slate-950 : primary ボタン文字
        accent: "#7dd3fc", // sky-300         : eyebrow 文字 / primary hover 背景
      },
    },
  },
  plugins: [],
};

export default config;
