import Link from "next/link";
import { listMembers } from "@/lib/services/members";
import { getCurrentMember } from "@/lib/current-member";
import { MemberSquare } from "@/components/member-square";

/**
 * 一覧・設定ページの上の帯。積み木ボードには出ない。
 * 見た目は盤と同じ「積み木」— 白いブロックが紙に並んでいるだけ。
 */
export async function Topbar() {
  const [members, current] = await Promise.all([listMembers(), getCurrentMember()]);
  const depth = { "--depth-x": "0px", "--depth-y": "3px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties;
  const chip = "brick brick-press flex h-9 items-center gap-2 rounded-[11px] bg-white px-3 text-[13px] font-bold";

  return (
    <header className="mx-auto flex max-w-[900px] items-center gap-2 px-6 pt-7">
      <Link href="/" className={chip} style={depth}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        ボード
      </Link>
      <Link href="/tasks" className={chip} style={depth}>
        一覧
      </Link>
      <Link href="/settings" className={chip} style={depth}>
        設定
      </Link>
      <div className="flex-1" />
      <span className={chip} style={depth}>
        <MemberSquare id={current?.id ?? null} name={current?.name} size={20} />
        {current?.name ?? "メンバー"}
      </span>
      <span className="text-[11px] font-bold text-muted-foreground">
        {members.filter((m) => m.is_active).length}人
      </span>
    </header>
  );
}
