import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

// Variant bundles are co-located with the component (SPACTA.md §2.5 "Two-layer presentation vocabulary").
// Do not centralize in tokens.ts. Primitive values (colors) refer to tailwind.config.ts theme.extend.
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
