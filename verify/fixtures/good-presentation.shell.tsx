/**
 * L8 提示純度の「正しい検体」。
 * セマンティックトークン(theme由来)・透過度付きトークン・ステータス色(escape hatch)だけを使う。
 * 生色/arbitrary値/無彩色パレット/色名＋透過度の直書きは無い → L8 は誤検出しない。
 */
export function GoodPresentation() {
  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-6">
      <span className="text-sm text-foreground-muted">x</span>
      <div className="bg-primary/10 text-primary">semantic + 透過度</div>
      <div className="bg-blue-50 text-blue-800 border border-amber-200">status color (許容)</div>
    </div>
  );
}
