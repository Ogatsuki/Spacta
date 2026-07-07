// clone(B3): clone-a と「同じUI」の検体。className の記述順を入れ替えてあるが、
// 集合正規化により Tailwind 順不同でも同一と判定される（Jaccard=1.0）＝検知されるべき。
import { Button } from "@/shared/ui/Button";
import { Panel } from "@/shared/ui/Panel";

export function BetaCard({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <Panel>
      <p className="text-foreground-muted text-sm">操作パネル</p>
      <div className="gap-3 flex mt-2 flex-wrap">
        <Button onClick={onSave}>save</Button>
        <Button onClick={onCancel} tone="secondary">
          cancel
        </Button>
      </div>
    </Panel>
  );
}
