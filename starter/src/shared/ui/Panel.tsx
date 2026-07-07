import type { ReactNode } from "react";

// バリアントを持たない部品は tv() を挟まず、theme.extend のユーティリティをそのまま使う。
export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface/80 p-6 shadow-sm">
      {children}
    </section>
  );
}
