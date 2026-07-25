import type { ReactNode } from "react";
import { AppShell } from "@/shared/ui/AppShell";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AppShell
          title="Spacta starter"
          description="Common frame is moved to app/layout.tsx and shared/ui; feature draws only the content."
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
