"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleBlockDoneAction, toggleSubtaskAction } from "@/app/actions";
import { MemberSquare } from "@/components/member-square";
import { memberColor } from "@/lib/whiteboard";
import type { WorkItem } from "@/lib/services/periods";
import { cn } from "@/lib/utils";

/** 一覧の1行。盤の積み木と同じ色の決まり(桃=重要 / 若草=完了 / 薄紫=普通)。 */
export function WorkRow({ item, ownerName }: { item: WorkItem; ownerName: string | null }) {
  const [, start] = useTransition();
  const toggle = () =>
    start(() =>
      item.kind === "block"
        ? toggleBlockDoneAction(item.id, !item.done)
        : toggleSubtaskAction(item.id, !item.done),
    );

  const tone = item.done
    ? { face: "var(--color-brick-done-face)", deep: "var(--color-brick-done-deep)", ink: "var(--color-brick-done-ink)" }
    : item.urgent
      ? { face: "var(--color-brick-hot-face)", deep: "var(--color-brick-hot-deep)", ink: "var(--color-brick-hot-ink)" }
      : { face: "var(--color-brick-face)", deep: "var(--color-brick-deep)", ink: "var(--color-brick-ink)" };

  return (
    <div
      className="brick flex items-center gap-2.5 rounded-[11px] px-2.5 py-2"
      style={{ background: tone.face, color: tone.ink, "--depth-color": tone.deep } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "grid size-[17px] shrink-0 place-items-center rounded-[5px] border-2 transition-colors",
          item.done
            ? "border-transparent bg-[var(--color-brick-done-deep)] text-[#1e4d17]"
            : "border-[rgba(20,22,28,0.25)] bg-white hover:border-[var(--color-toy-purple)]",
        )}
        aria-label={item.done ? "やり直す" : "できた"}
      >
        {item.done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </button>

      <MemberSquare id={item.owner_id} name={ownerName} size={18} />

      <span className={cn("min-w-0 flex-1 truncate text-[13px] font-bold", item.done && "line-through opacity-60")}>
        {item.title}
      </span>

      {item.workers.map((w) => (
        <span
          key={w.id}
          className="hidden shrink-0 rounded-[7px] border-2 border-dashed bg-white/75 px-1.5 py-px text-[10px] font-bold sm:block"
          style={{ borderColor: memberColor(w.id), color: memberColor(w.id) }}
          title={`${w.name} が取り組み中`}
        >
          {w.name}
        </span>
      ))}

      {item.block_title && (
        <span className="hidden shrink-0 truncate text-[11px] font-bold opacity-50 sm:block">
          {item.block_title}
        </span>
      )}
      {item.due_date && (
        <span className="num shrink-0 text-[11px] font-bold opacity-60">
          {Number(item.due_date.slice(5, 7))}/{Number(item.due_date.slice(8, 10))}
        </span>
      )}
      {item.period && (
        <Link
          href={`/?p=${item.period.id}`}
          className="shrink-0 rounded-[7px] bg-white/60 px-1.5 py-0.5 text-[10px] font-bold hover:bg-white"
          title="この期間の盤をひらく"
        >
          {item.period.title}
        </Link>
      )}
    </div>
  );
}
