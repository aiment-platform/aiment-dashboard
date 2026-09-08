"use client";

import { useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHistory } from "@/components/board/history";
import {
  deleteBlockAction,
  setBlockStatusAction,
  setWorkingOnBlockAction,
  toggleBlockDoneAction,
  updateBlockAction,
} from "@/app/actions";
import type { PeriodBlock } from "@/lib/services/periods";
import { cn } from "@/lib/utils";

/**
 * 選んだ積み木の右に出る道具箱。
 *
 * ボタンを積み木の面に並べると名前が見えなくなるので、面には
 * 「担当者・名前・期限・進捗」だけを置き、操作はここに集めた。
 * 紙の座標に置くので、盤を動かしても選んだ積み木の隣についてくる。
 */

/** 「9/12」 */
function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 次の日曜(=今週の終わり)。今日が日曜ならそのまま今日。 */
function endOfWeek(): string {
  return addDays((7 - new Date().getDay()) % 7);
}

const BTN =
  "grid size-[30px] place-items-center rounded-[9px] text-foreground/75 transition-colors hover:bg-accent hover:text-foreground";

export function BlockToolbar({
  block,
  currentMemberId,
  periodEnd,
  onDuplicate,
}: {
  block: PeriodBlock;
  currentMemberId: string;
  /** 「この期間のおわり」を期限の候補に出すため */
  periodEnd: string | null;
  onDuplicate: () => void;
}) {
  const [, start] = useTransition();
  const { record } = useHistory();
  const [dueOpen, setDueOpen] = useState(false);

  const done = block.status === "achieved";
  const iAmWorking = block.workers.some((w) => w.id === currentMemberId);

  const setDue = (v: string | null) => start(() => updateBlockAction(block.id, { due_date: v }));
  const setFlag = (v: boolean) => start(() => updateBlockAction(block.id, { important: v }));
  const setDone = (v: boolean) => start(() => toggleBlockDoneAction(block.id, v));
  const setWorking = (v: boolean) =>
    start(() => setWorkingOnBlockAction(block.id, v, currentMemberId || undefined));

  const quick: { label: string; value: string }[] = [
    { label: "今日", value: addDays(0) },
    { label: "明日", value: addDays(1) },
    { label: "今週おわり", value: endOfWeek() },
    { label: "来週", value: addDays(7) },
  ];
  if (periodEnd) quick.push({ label: "この期間のおわり", value: periodEnd });

  return (
    <div
      className="brick flex items-center gap-0.5 rounded-[13px] border-2 border-[rgba(20,22,28,0.12)] bg-white p-1"
      style={{ "--depth-x": "0px", "--depth-y": "4px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-testid="block-toolbar"
    >
      {/* 期限 */}
      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(BTN, block.due_date && "text-[var(--color-toy-purple)]")}
            aria-label="期限を決める"
            title="期限を決める"
            data-testid="block-due"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 rounded-[14px] border-2 border-[rgba(20,22,28,0.14)] p-2.5"
          sideOffset={8}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="mb-1.5 px-0.5 text-[10px] font-bold tracking-wider text-muted-foreground">
            いつまでに
          </p>
          <div className="mb-2 flex flex-wrap gap-1">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  const before = block.due_date;
                  setDue(q.value);
                  setDueOpen(false);
                  record({
                    label: `期限を ${q.label} にした`,
                    undo: () => setDue(before),
                    redo: () => setDue(q.value),
                  });
                }}
                className={cn(
                  "brick brick-press rounded-[8px] bg-secondary px-2 py-1 text-[11px] font-bold",
                  block.due_date === q.value && "bg-[var(--color-toy-purple)] text-white",
                )}
                style={{ "--depth-x": "0px", "--depth-y": "2px", "--depth-color": "rgba(20,22,28,0.16)" } as React.CSSProperties}
              >
                {q.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            defaultValue={block.due_date ?? ""}
            onChange={(e) => {
              if (!e.target.value) return;
              const before = block.due_date;
              const value = e.target.value;
              setDue(value);
              setDueOpen(false);
              record({ label: `期限を ${value} にした`, undo: () => setDue(before), redo: () => setDue(value) });
            }}
            className="inset-field num w-full rounded-[9px] px-2 py-1.5 text-[12px] font-bold"
          />
          {block.due_date && (
            <button
              type="button"
              onClick={() => {
                const before = block.due_date;
                setDue(null);
                setDueOpen(false);
                record({ label: "期限をはずした", undo: () => setDue(before), redo: () => setDue(null) });
              }}
              className="mt-2 w-full rounded-[8px] py-1 text-[11px] font-bold text-muted-foreground hover:text-destructive"
              data-testid="due-clear"
            >
              期限をはずす
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* これに取り組む */}
      <button
        type="button"
        onClick={() => {
          const next = !iAmWorking;
          setWorking(next);
          record({
            label: next ? `「${block.title}」に取り組みはじめた` : "取り組みをやめた",
            undo: () => setWorking(!next),
            redo: () => setWorking(next),
          });
        }}
        className={cn(BTN, iAmWorking && "bg-[var(--color-toy-purple-soft)] text-[var(--color-toy-purple)]")}
        aria-pressed={iAmWorking}
        aria-label={iAmWorking ? "取り組みをやめる" : "これに取り組む"}
        title={iAmWorking ? "取り組みをやめる" : "これに取り組む(名前と点線が出ます)"}
        data-testid="block-working"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={iAmWorking ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
        </svg>
      </button>

      {/* 重要 */}
      <button
        type="button"
        onClick={() => {
          const next = !block.important;
          setFlag(next);
          record({
            label: next ? `「${block.title}」を重要にした` : "重要をはずした",
            undo: () => setFlag(!next),
            redo: () => setFlag(next),
          });
        }}
        className={cn(BTN, block.important && "text-[var(--color-brick-hot-ink)]")}
        aria-pressed={block.important}
        aria-label={block.important ? "重要をはずす" : "重要にする"}
        title={block.important ? "重要をはずす" : "重要にする(いつでも桃色になる)"}
        data-testid="block-important"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={block.important ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 21V4.5C7 2.5 11 6.5 14 4.5c2 -1.3 4 -1 6 0v9c-2 -1 -4 -1.3 -6 0C11 15.5 7 11.5 4 13.5" />
        </svg>
      </button>

      {/* 複製 */}
      <button
        type="button"
        onClick={onDuplicate}
        className={BTN}
        aria-label="この積み木を複製する"
        title="複製 (⌘D / ⌥ドラッグ)"
        data-testid="block-duplicate"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M6 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V6" />
        </svg>
      </button>

      <span className="mx-0.5 h-5 w-px bg-border" />

      {/* できた */}
      <button
        type="button"
        onClick={() => {
          const next = !done;
          setDone(next);
          record({
            label: `「${block.title}」を${next ? "できたにした" : "やり直しにした"}`,
            undo: () => setDone(!next),
            redo: () => setDone(next),
          });
        }}
        className={cn(BTN, done && "text-[var(--color-brick-done-ink)]")}
        aria-label={done ? "できてないに戻す" : "できたにする"}
        title={done ? "できてないに戻す" : "できたにする"}
        data-testid="block-done"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </button>

      {/* 片づける */}
      <button
        type="button"
        onClick={() => {
          const before = block.status;
          start(() => deleteBlockAction(block.id));
          record({
            label: `「${block.title}」を片づけた`,
            undo: () => start(() => setBlockStatusAction(block.id, before)),
            redo: () => start(() => deleteBlockAction(block.id)),
          });
        }}
        className={cn(BTN, "hover:text-destructive")}
        aria-label="この積み木を片づける"
        title="この積み木を片づける"
        data-testid="block-delete"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}


/**
 * まとめて選んでいるときの道具箱。
 * 「全部できたにする」「全部重要にする」のように、選んだぶんへ同じことをする。
 * 期限や担当者のように1つずつ決めたいものは、ここには出さない。
 */
export function MultiToolbar({
  blocks,
  currentMemberId,
  onDuplicate,
  onClear,
}: {
  blocks: PeriodBlock[];
  currentMemberId: string;
  onDuplicate: () => void;
  onClear: () => void;
}) {
  const [, start] = useTransition();
  const { record } = useHistory();

  const allDone = blocks.every((b) => b.status === "achieved");
  const allImportant = blocks.every((b) => b.important);
  const allWorking = blocks.every((b) => b.workers.some((w) => w.id === currentMemberId));

  const each = (fn: (b: PeriodBlock) => Promise<void>) =>
    start(async () => {
      for (const b of blocks) await fn(b);
    });

  const setDone = (v: boolean) => each((b) => toggleBlockDoneAction(b.id, v));
  const setFlag = (v: boolean) => each((b) => updateBlockAction(b.id, { important: v }));
  const setWorking = (v: boolean) =>
    each((b) => setWorkingOnBlockAction(b.id, v, currentMemberId || undefined));

  return (
    <div
      className="brick flex items-center gap-0.5 rounded-[13px] border-2 border-[rgba(20,22,28,0.12)] bg-white p-1"
      style={{ "--depth-x": "0px", "--depth-y": "4px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-testid="multi-toolbar"
    >
      <span className="num px-1.5 text-[12px] font-bold text-muted-foreground">{blocks.length}個</span>
      <span className="mx-0.5 h-5 w-px bg-border" />

      <button
        type="button"
        onClick={() => {
          const next = !allWorking;
          setWorking(next);
          record({
            label: next ? `${blocks.length}個に取り組みはじめた` : "取り組みをやめた",
            undo: () => setWorking(!next),
            redo: () => setWorking(next),
          });
        }}
        className={cn(BTN, allWorking && "bg-[var(--color-toy-purple-soft)] text-[var(--color-toy-purple)]")}
        aria-label="まとめて取り組む"
        title="まとめて「これに取り組む」"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={allWorking ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => {
          const next = !allImportant;
          setFlag(next);
          record({
            label: next ? `${blocks.length}個を重要にした` : "重要をはずした",
            undo: () => setFlag(!next),
            redo: () => setFlag(next),
          });
        }}
        className={cn(BTN, allImportant && "text-[var(--color-brick-hot-ink)]")}
        aria-label="まとめて重要にする"
        title="まとめて重要にする"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={allImportant ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 21V4.5C7 2.5 11 6.5 14 4.5c2 -1.3 4 -1 6 0v9c-2 -1 -4 -1.3 -6 0C11 15.5 7 11.5 4 13.5" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onDuplicate}
        className={BTN}
        aria-label="まとめて複製する"
        title="まとめて複製 (⌘D / ⌥ドラッグ)"
        data-testid="multi-duplicate"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M6 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V6" />
        </svg>
      </button>

      <span className="mx-0.5 h-5 w-px bg-border" />

      <button
        type="button"
        onClick={() => {
          const next = !allDone;
          setDone(next);
          record({
            label: `${blocks.length}個を${next ? "できたにした" : "やり直しにした"}`,
            undo: () => setDone(!next),
            redo: () => setDone(next),
          });
        }}
        className={cn(BTN, allDone && "text-[var(--color-brick-done-ink)]")}
        aria-label="まとめてできたにする"
        title="まとめてできたにする"
        data-testid="multi-done"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => {
          const before = blocks.map((b) => ({ id: b.id, status: b.status }));
          each((b) => deleteBlockAction(b.id));
          onClear();
          record({
            label: `${blocks.length}個を片づけた`,
            undo: () =>
              start(async () => {
                for (const b of before) await setBlockStatusAction(b.id, b.status);
              }),
            redo: () => each((b) => deleteBlockAction(b.id)),
          });
        }}
        className={cn(BTN, "hover:text-destructive")}
        aria-label="まとめて片づける"
        title="まとめて片づける"
        data-testid="multi-delete"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
