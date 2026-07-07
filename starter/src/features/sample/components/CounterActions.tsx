import { Button } from "@/shared/ui/Button";
import { Panel } from "@/shared/ui/Panel";

export function CounterActions({
  onIncrement,
  onReset,
}: {
  onIncrement: () => void;
  onReset: () => void;
}) {
  return (
    <Panel>
      <p className="text-sm text-foreground-muted">feature 固有の表示部品は feature 内 components/ に閉じ込める。</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onIncrement}>+1</Button>
        <Button onClick={onReset} tone="secondary">
          reset
        </Button>
      </div>
    </Panel>
  );
}
