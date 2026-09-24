/**
 * 盤を開いたとき・期間を切り替えたときに、データが届くまで出す仮の画面。
 * 同じ紙(水玉)だけ先に敷いておくので、押した瞬間に「盤に来た」と分かる。
 */
export default function Loading() {
  return (
    <div className="paper-dots fixed inset-0 grid place-items-center" aria-busy="true" aria-label="読み込み中">
      <div className="h-[70px] w-[520px] animate-pulse rounded-[40px] border-[4px] border-[rgba(108,75,244,0.25)] bg-white/70" />
    </div>
  );
}
