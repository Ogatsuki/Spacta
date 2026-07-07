/**
 * L8 提示純度の「わざと壊した検体」。
 * ①生色(#hex) ②arbitrary値(bg-[...]) ③無彩色パレット(gray/slate/white)
 * ④色名＋透過度の隠れハードコード(fuchsia-400/10 等) を shell に直書き → L8 が info で拾うべき。
 */
export function BadPresentation() {
  return (
    <div className="bg-[#ff0000] text-[13px] bg-gray-50" style={{ color: "#ffffff" }}>
      <span className="w-[42px] bg-slate-950 text-white">x</span>
      <div className="bg-fuchsia-400/10 border border-violet-300/15">y</div>
      <div className="bg-white/[0.06]">z</div>
    </div>
  );
}
