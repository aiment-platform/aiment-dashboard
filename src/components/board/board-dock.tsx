import Link from "next/link";
import { MemberSquare } from "@/components/member-square";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * 紙の左上に置く小さな操作の島。
 * 「いま誰として書いているか」を常に見せる — 積み木に付く担当者アイコンが
 * この人の色になるので、間違った名前のまま書き込まないための表示。
 */
export function BoardDock({ name, id }: { name: string | null; id: string | null }) {
  const depth = {
    "--depth-x": "0px",
    "--depth-y": "3px",
    "--depth-color": "rgba(var(--shade),0.18)",
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
      <Link href="/contacts" className={chip} style={depth}>
        連絡先
      </Link>
      <ThemeToggle className={`${chip} !w-8 !px-0`} style={depth} />
      <Link href="/settings" className={`${chip} !w-8 !px-0`} style={depth} aria-label="設定">
        {/* 歯車(太陽の絵と見分けがつくよう、歯のある輪郭にする) */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M10.3 2.6h3.4l.5 2.6a7.4 7.4 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a7.4 7.4 0 0 1 0 2.2l2 1.7-1.7 2.9-2.5-.9a7.4 7.4 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.4 7.4 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a7.4 7.4 0 0 1 0-2.2l-2-1.7 1.7-2.9 2.5.9a7.4 7.4 0 0 1 1.9-1.1z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Link>
    </div>
  );
}
