import type { ReactNode } from "react";
import { AppShell } from "@/shared/ui/AppShell";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AppShell
          title="Membrain starter"
          description="共通の枠は app/layout.tsx と shared/ui に上げ、feature は中身だけを描く。"
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
