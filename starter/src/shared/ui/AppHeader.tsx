export function AppHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-2 border-b border-border pb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">default form</p>
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-foreground-muted">{description}</p>
      </div>
    </header>
  );
}
