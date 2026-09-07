"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { switchMemberAction } from "@/app/actions";
import { initial, memberColor } from "@/lib/whiteboard";
import { cn } from "@/lib/utils";

/**
 * 紙の左下に置く小さな操作の島。画像には無いが、
 * 「いま誰として書いているか」だけは常に見えている必要がある
 * (積み木に付く担当者アイコンの色が、この人の色になるため)。
 */
export function BoardDock({
  members,
  currentId,
}: {
  members: { id: string; name: string }[];
  currentId: string;
}) {
  const [, start] = useTransition();
  const me = members.find((m) => m.id === currentId) ?? null;
  const depth = { "--depth-x": "0px", "--depth-y": "3px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties;

  return (
    <div className="fixed left-6 top-6 z-40 flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="brick brick-press flex h-8 items-center gap-2 rounded-[9px] bg-white pl-1.5 pr-2.5"
            style={depth}
            title="いま操作している人。積み木の担当者アイコンはこの色になります"
          >
            <span
              className="grid size-[20px] place-items-center rounded-[6px] text-[9px] font-bold text-white"
              style={{ background: memberColor(me?.id ?? null) }}
            >
              {initial(me?.name)}
            </span>
            <span className="text-[12px] font-bold">{me?.name ?? "メンバー"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 rounded-[14px] border-2 border-[rgba(20,22,28,0.14)] p-2" side="bottom" align="start">
          <p className="mb-1.5 px-1 text-[10px] font-bold tracking-wider text-muted-foreground">
            いま だれ？
          </p>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => start(() => switchMemberAction(m.id))}
              className={cn(
                "flex w-full items-center gap-2 rounded-[9px] px-1.5 py-1.5 text-left text-[13px] hover:bg-accent",
                m.id === currentId && "font-bold",
              )}
            >
              <span className="size-[18px] shrink-0 rounded-[5px]" style={{ background: memberColor(m.id) }} />
              {m.name}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Link
        href="/tasks"
        className="brick brick-press grid h-8 place-items-center rounded-[9px] bg-white px-2.5 text-[12px] font-bold"
        style={depth}
      >
        一覧
      </Link>
      <Link
        href="/settings"
        className="brick brick-press grid size-8 place-items-center rounded-[9px] bg-white"
        style={depth}
        aria-label="設定"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  );
}
