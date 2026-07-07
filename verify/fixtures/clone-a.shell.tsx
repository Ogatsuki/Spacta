// clone(B3): UI重複検知の検体（片方）。clone-b と className の記述順だけが違う＝同じUI。
import { Button } from "@/shared/ui/Button";
import { Panel } from "@/shared/ui/Panel";

export function AlphaCard({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <Panel>
      <p className="text-sm text-foreground-muted">操作パネル</p>
      <div className="flex flex-wrap gap-3 mt-2">
        <Button onClick={onSave}>save</Button>
        <Button onClick={onCancel} tone="secondary">
          cancel
        </Button>
      </div>
    </Panel>
  );
}
