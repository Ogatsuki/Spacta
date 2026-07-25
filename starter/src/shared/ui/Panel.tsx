import type { ReactNode } from "react";

// For parts without variants, don't wrap tv(); use theme.extend utilities directly.
export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface/80 p-6 shadow-sm">
      {children}
    </section>
  );
}
