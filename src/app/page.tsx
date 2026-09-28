import { defaultPeriodId, getPeriodBoard } from "@/lib/services/periods";
import { listMembers } from "@/lib/services/members";
import { getCurrentMember } from "@/lib/current-member";
import { BoardPanes } from "@/components/board/board-panes";
import { BoardDock } from "@/components/board/board-dock";
import { FirstPeriod } from "@/components/board/first-period";

/**
 * 積み木ボード。
 * 画面 = 上のピル(この期間の目標) + 紙の上に散らばった積み木。
 * ?p=<期間ID> でページを行き来する。無ければ「今日を含む期間」を開く。
 * ?p=A&p=B のように並べると、左右に分割して同時に開く(最大3枚)。
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { p } = await searchParams;
  const asked = (Array.isArray(p) ? p : p ? [p] : []).slice(0, 3);
  // どれも互いを待たないので同時に聞く。外のDB(Neon等)では往復の回数がそのまま待ち時間になる。
  const [members, me, fallbackId] = await Promise.all([
    listMembers(),
    getCurrentMember(),
    asked.length ? Promise.resolve(null) : defaultPeriodId(),
  ]);
  const ids = asked.length ? asked : fallbackId ? [fallbackId] : [];
  // 並べた盤も同時に取る
  const boards = (await Promise.all(ids.map((id) => getPeriodBoard(id)))).filter((b) => b !== null);

  if (boards.length === 0) return <FirstPeriod />;

  const active = members.filter((m) => m.is_active).map((m) => ({ id: m.id, name: m.name }));
  return (
    <>
      <BoardPanes
        boards={boards}
        shared={{
          members: active,
          currentMemberId: me?.id ?? "",
          realtime: Boolean(process.env.LIVEBLOCKS_SECRET_KEY),
        }}
      />
      <BoardDock name={me?.name ?? null} id={me?.id ?? null} />
    </>
  );
}
