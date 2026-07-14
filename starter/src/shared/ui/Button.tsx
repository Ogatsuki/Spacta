import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

// バリアント束はコンポーネントに co-locate する（SPACTA.md §2.5「提示語彙の2層化」）。
// 中央 tokens.ts には集めない。原始値（色）は tailwind.config.ts theme.extend を参照する。
const button = tv({
  base: "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition",
  variants: {
    tone: {
      primary: "bg-primary text-primary-foreground hover:bg-accent",
      secondary:
        "border border-border-strong text-foreground-subtle hover:border-border-hover hover:bg-surface-hover",
    },
  },
  defaultVariants: {
    tone: "primary",
  },
});

export function Button({
  children,
  onClick,
  tone = "primary",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "primary" | "secondary";
}) {
  return (
    <button className={button({ tone })} onClick={onClick} type="button">
      {children}
    </button>
  );
}
