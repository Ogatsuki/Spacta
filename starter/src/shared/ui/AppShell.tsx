import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";

export function AppShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-8">
        <AppHeader title={title} description={description} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
