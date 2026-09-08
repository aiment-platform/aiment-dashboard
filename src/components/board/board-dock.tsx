import Link from "next/link";
import { MemberSquare } from "@/components/member-square";

/**
 * 紙の左上に置く小さな操作の島。
 * 「いま誰として書いているか」を常に見せる — 積み木に付く担当者アイコンが
 * この人の色になるので、間違った名前のまま書き込まないための表示。
 */
export function BoardDock({ name, id }: { name: string | null; id: string | null }) {
  const depth = {
    "--depth-x": "0px",
    "--depth-y": "3px",
    "--depth-color": "rgba(20,22,28,0.18)",
  } as React.CSSProperties;
  const chip =
    "brick brick-press grid h-8 place-items-center rounded-[9px] bg-white px-2.5 text-[12px] font-bold";

  return (
    <div className="fixed left-6 top-6 z-40 flex items-center gap-1.5">
      <Link
        href="/who"
        className="brick brick-press flex h-8 items-center gap-2 rounded-[9px] bg-white pl-1.5 pr-2.5"
        style={depth}
        title="押すと書き手を変えられます"
        data-testid="current-account"
      >
        <MemberSquare id={id} name={name} size={20} />
        <span className="text-[12px] font-bold">{name ?? "だれ？"}</span>
      </Link>

      <Link href="/tasks" className={chip} style={depth}>
        一覧
      </Link>
      <Link href="/settings" className={`${chip} !w-8 !px-0`} style={depth} aria-label="設定">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  );
}
