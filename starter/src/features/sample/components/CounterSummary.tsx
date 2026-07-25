import { Panel } from "@/shared/ui/Panel";

export function CounterSummary({
  count,
  lastTouched,
  summary,
}: {
  count: number;
  lastTouched: string;
  summary: string;
}) {
  return (
    <Panel>
      <p className="text-sm text-foreground-muted">A feature presentation part that only draws what Core returned.</p>
      <p className="text-4xl font-semibold">{count}</p>
      <p className="text-sm text-foreground-muted">lastTouched: {lastTouched}</p>
      <p className="text-sm text-foreground-muted">{summary}</p>
    </Panel>
  );
}
