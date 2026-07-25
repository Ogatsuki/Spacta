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
      <p className="text-sm text-foreground-muted">Feature-specific presentation parts stay inside that feature&apos;s own components/.</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onIncrement}>+1</Button>
        <Button onClick={onReset} tone="secondary">
          reset
        </Button>
      </div>
    </Panel>
  );
}
