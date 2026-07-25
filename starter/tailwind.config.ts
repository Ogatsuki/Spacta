import type { Config } from "tailwindcss";

/**
 * The single source of primitive presentation values (colors, spacing, border-radius, etc.) (SPACTA.md §2.5).
 * Shell/components use only utilities defined here (e.g., `bg-primary`).
 * Component-specific variant bundles (combinations of tone/size, etc.) are not placed here;
 * they are co-located with each component in `shared/ui` using `tailwind-variants`.
 * Central `tokens.ts` (object bundling class strings) is deprecated.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#020617", // slate-950 : page background
        surface: "#0f172a", // slate-900   : panel background
        "surface-hover": "#1e293b", // slate-800 : secondary button hover background
        foreground: "#f8fafc", // slate-50  : primary text (headings, numbers, etc.)
        "foreground-muted": "#94a3b8", // slate-400 : body text, supporting text
        "foreground-subtle": "#f1f5f9", // slate-100 : secondary button text
        border: "#1e293b", // slate-800     : default border (header/panel)
        "border-strong": "#334155", // slate-700 : secondary button border
        "border-hover": "#475569", // slate-600 : secondary button hover border
        primary: "#38bdf8", // sky-400        : primary button background
        "primary-foreground": "#020617", // slate-950 : primary button text
        accent: "#7dd3fc", // sky-300         : eyebrow text / primary hover background
      },
    },
  },
  plugins: [],
};

export default config;
