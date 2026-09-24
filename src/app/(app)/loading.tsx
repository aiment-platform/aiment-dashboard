/**
 * 一覧・連絡先・設定を開いたとき、データが届くまでに出す仮の画面。
 *
 * これが無いと Next.js は「次のページのデータが揃うまで前の画面のまま」になるので、
 * 押しても何も起きていないように見える(遠い DB だと1秒以上固まって見える)。
 * 置いておくと、押した瞬間に画面が切り替わり、中身だけあとから埋まる。
 */
export default function Loading() {
  const bar = "brick rounded-[11px] bg-white/70";
  const depth = { "--depth-x": "0px", "--depth-y": "3px", "--depth-color": "rgba(20,22,28,0.08)" } as React.CSSProperties;
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="読み込み中">
      <div className="h-8 w-40 rounded-[10px] bg-[rgba(20,22,28,0.08)]" />
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${bar} h-[38px]`} style={depth} />
        ))}
      </div>
    </div>
  );
}
