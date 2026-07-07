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
      <p className="text-sm text-foreground-muted">Core が返したデータを描くだけの feature 表示部品。</p>
      <p className="text-4xl font-semibold">{count}</p>
      <p className="text-sm text-foreground-muted">lastTouched: {lastTouched}</p>
      <p className="text-sm text-foreground-muted">{summary}</p>
    </Panel>
  );
}
