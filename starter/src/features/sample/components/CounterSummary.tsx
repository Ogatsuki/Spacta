import { Panel } from "@/shared/ui/Panel";

export function CounterSummary({
  count,
  lastTouched,
  summary,
  pending,
  notice,
}: {
  count: number;
  lastTouched: string;
  summary: string;
  pending: number;
  notice: string | null;
}) {
  return (
    <Panel>
      <p className="text-sm text-foreground-muted">A feature presentation part that only draws what Core returned.</p>
      <p className="text-4xl font-semibold">{count}</p>
      <p className="text-sm text-foreground-muted">lastTouched: {lastTouched}</p>
      <p className="text-sm text-foreground-muted">{summary}</p>
      {/* In-flight writes and failures are state Core computed, not something decided here. */}
      <p className="text-sm text-foreground-muted">writes in flight: {pending}</p>
      {notice ? <p className="text-sm text-accent">{notice}</p> : null}
    </Panel>
  );
}
