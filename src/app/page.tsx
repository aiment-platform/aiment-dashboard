import { defaultPeriodId, getPeriodBoard } from "@/lib/services/periods";
import { listMembers } from "@/lib/services/members";
import { getCurrentMember } from "@/lib/current-member";
import { Whiteboard } from "@/components/board/whiteboard";
import { BoardDock } from "@/components/board/board-dock";
import { FirstPeriod } from "@/components/board/first-period";

/**
 * 積み木ボード。
 * 画面 = 上のピル(この期間の目標) + 紙の上に散らばった積み木。
 * ?p=<期間ID> でページを行き来する。無ければ「今日を含む期間」を開く。
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  // どれも互いを待たないので同時に聞く。外のDB(Neon等)では往復の回数がそのまま待ち時間になる。
  const [members, me, fallbackId] = await Promise.all([
    listMembers(),
    getCurrentMember(),
    p ? Promise.resolve(null) : defaultPeriodId(),
  ]);
  const periodId = p ?? fallbackId;
  const board = periodId ? await getPeriodBoard(periodId) : null;

  if (!board) return <FirstPeriod />;

  const active = members.filter((m) => m.is_active).map((m) => ({ id: m.id, name: m.name }));
  return (
    <>
      <Whiteboard
        key={board.period.id}
        period={board.period}
        siblings={board.siblings}
        blocks={board.blocks}
        members={active}
        currentMemberId={me?.id ?? ""}
        realtime={Boolean(process.env.LIVEBLOCKS_SECRET_KEY)}
      />
      <BoardDock name={me?.name ?? null} id={me?.id ?? null} />
    </>
  );
}
