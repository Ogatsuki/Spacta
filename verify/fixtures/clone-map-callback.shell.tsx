/**
 * clone(B3) の「誤検出されない検体」。
 * 親 <ul> と .map() コールバックが返す子 <li> は、構文木上は別ルートでも
 * 意味上は親の子孫（親子入れ子）。clone は片方だけを候補にし、重複と誤報しないべき。
 */
export function HistoryList({ items }: { items: { id: string; label: string }[] }) {
  return (
    <ul className="flex flex-col gap-2 rounded-card-sm border border-border bg-card p-4">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-2 rounded-card-sm border border-border bg-card p-4">
          <span className="text-sm text-foreground">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
