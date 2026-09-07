"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addSubtaskAction,
  deleteSubtaskAction,
  toggleSubtaskAction,
  updateBlockAction,
  updateSubtaskAction,
} from "@/app/actions";
import { useHistory } from "@/components/board/history";
import {
  BLOCK_H,
  HANDLE_W,
  MIN_FACE_W,
  SUBTASK_H,
  TRUNK_TOP,
  blockTone,
  initial,
  memberColor,
  type Tone,
} from "@/lib/whiteboard";
import type { PeriodBlock } from "@/lib/services/periods";
import { cn, isComposing } from "@/lib/utils";

/**
 * 積み木ひとつ = マイルストーン1件。
 *
 * 見た目の決まりは3つだけ:
 *   ・左のグレーは「持ち手」= 開閉。触ると中のサブタスクが枝で降りてくる。
 *   ・面の色は状態。薄紫=普通 / 桃=重要(期限が近い・詰まっている) / 若草=完了。
 *   ・小さい四角は担当者。色 = 人。
 */

const TONE: Record<Tone, { face: string; deep: string; ink: string }> = {
  normal: {
    face: "var(--color-brick-face)",
    deep: "var(--color-brick-deep)",
    ink: "var(--color-brick-ink)",
  },
  urgent: {
    face: "var(--color-brick-hot-face)",
    deep: "var(--color-brick-hot-deep)",
    ink: "var(--color-brick-hot-ink)",
  },
  done: {
    face: "var(--color-brick-done-face)",
    deep: "var(--color-brick-done-deep)",
    ink: "var(--color-brick-done-ink)",
  },
};

const TRUNK_X = 13; // 幹の左位置 = 持ち手の中心
const BRANCH_W = 36; // 枝の長さ

function shade(color: string, pct = 74): string {
  return `color-mix(in srgb, ${color} ${pct}%, #000)`;
}

/** 担当者アイコン: 色つきの小さな四角。押すと担当者を変えられる。 */
function OwnerChip({
  ownerId,
  ownerName,
  members,
  onPick,
  size = 26,
}: {
  ownerId: string | null;
  ownerName: string | null;
  members: { id: string; name: string }[];
  onPick: (id: string) => void;
  size?: number;
}) {
  const color = memberColor(ownerId);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="brick brick-press shrink-0 rounded-[7px] font-bold text-white"
          style={
            {
              width: size,
              height: size,
              background: color,
              fontSize: size * 0.42,
              "--depth-x": "0px",
              "--depth-y": "2px",
              "--depth-color": shade(color),
            } as React.CSSProperties
          }
          onPointerDown={(e) => e.stopPropagation()}
          title={ownerName ? `担当: ${ownerName}` : "担当者を決める"}
          aria-label={ownerName ? `担当 ${ownerName}` : "担当者を決める"}
        >
          {ownerName ? initial(ownerName) : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 rounded-[14px] border-2 border-[rgba(20,22,28,0.14)] p-2"
        sideOffset={8}
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1.5 px-1 text-[10px] font-bold tracking-wider text-muted-foreground">
          たんとうしゃ
        </p>
        <div className="flex flex-col gap-0.5">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m.id)}
              className={cn(
                "flex items-center gap-2 rounded-[9px] px-1.5 py-1.5 text-left text-[13px] hover:bg-accent",
                m.id === ownerId && "font-bold",
              )}
            >
              <span
                className="size-[18px] shrink-0 rounded-[5px]"
                style={{ background: memberColor(m.id) }}
              />
              {m.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 「9/12」 */
function shortDue(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: up ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}
    >
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}

function SubtaskRow({
  task,
  members,
}: {
  task: PeriodBlock["subtasks"][number];
  members: { id: string; name: string }[];
}) {
  const [, start] = useTransition();
  const { record } = useHistory();
  const [editing, setEditing] = useState(false);
  const owner = members.find((m) => m.id === task.owner_id) ?? null;

  const setDone = (done: boolean) => start(() => toggleSubtaskAction(task.id, done));
  return (
    <div className="branch flex items-center" style={{ height: SUBTASK_H }}>
      <div
        className="shrink-0 rounded-full"
        style={{
          width: BRANCH_W,
          height: 3,
          marginLeft: TRUNK_X,
          background: task.done ? "rgba(20,22,28,0.2)" : "var(--color-toy-purple)",
        }}
      />
      <div className="group/row ml-2 flex items-center gap-1.5">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const next = !task.done;
            setDone(next);
            record({
              label: `${task.title}を${next ? "できたにした" : "やり直しにした"}`,
              undo: () => setDone(!next),
              redo: () => setDone(next),
            });
          }}
          className={cn(
            "grid size-[15px] shrink-0 place-items-center rounded-[4px] border-2 transition-colors",
            task.done
              ? "border-transparent bg-[var(--color-brick-done-deep)] text-[#1e4d17]"
              : "border-[rgba(20,22,28,0.25)] bg-white hover:border-[var(--color-toy-purple)]",
          )}
          aria-label={task.done ? "やり直す" : "できた"}
        >
          {task.done && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </button>

        {editing ? (
          <input
            autoFocus
            defaultValue={task.title}
            className="inset-field w-44 rounded-[7px] px-1.5 py-0.5 text-[12px] font-bold"
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              const before = task.title;
              setEditing(false);
              if (!v || v === before) return;
              const rename = (title: string) => start(() => updateSubtaskAction(task.id, { title }));
              rename(v);
              record({
                label: "サブタスクの名前を変えた",
                undo: () => rename(before),
                redo: () => rename(v),
              });
            }}
            onKeyDown={(e) => {
              if (isComposing(e)) return; // 変換中の Enter は確定に使わせる
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setEditing(true)}
            className={cn(
              "whitespace-nowrap text-left text-[12px] font-bold",
              task.done ? "text-muted-foreground line-through" : "text-foreground",
            )}
          >
            {task.title}
          </button>
        )}

        <span
          className="size-[11px] shrink-0 rounded-[3px] opacity-0 transition-opacity group-hover/row:opacity-100"
          style={{ background: memberColor(task.owner_id) }}
          title={owner ? `担当: ${owner.name}` : undefined}
        />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const wasDone = task.done;
            start(() => deleteSubtaskAction(task.id));
            record({
              label: `「${task.title}」を消した`,
              undo: () => setDone(wasDone), // dropped → todo/done に戻す
              redo: () => start(() => deleteSubtaskAction(task.id)),
            });
          }}
          className="shrink-0 px-1 text-[13px] leading-none text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
          aria-label="このサブタスクを消す"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ToyBlock({
  block,
  x,
  y,
  width,
  expanded,
  dragging,
  lifted,
  depth,
  members,
  currentMemberId,
  onToggleExpand,
  onPointerDown,
  onSelect,
}: {
  block: PeriodBlock;
  x: number;
  y: number;
  /** 名前の長さで決まる幅(計算は src/lib/whiteboard.ts の blockWidth) */
  width: number;
  expanded: boolean;
  /** 指と一緒に動いている(掴んだ積み木と、その上に載っているもの) */
  dragging: boolean;
  /** 実際に掴まれている本人。浮いている影はこれにだけ付ける。 */
  lifted?: boolean;
  /** 地面から何段目か。上の段ほど「奥」に描く(手前に来ると重なって見えない)。 */
  depth: number;
  members: { id: string; name: string }[];
  currentMemberId: string;
  onToggleExpand: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  /** 面をクリックした = この積み木を選ぶ(右に道具箱が出る) */
  onSelect: () => void;
}) {
  const [, start] = useTransition();
  const { record } = useHistory();
  const [editingTitle, setEditingTitle] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  // 押した場所を覚えておき、指が動いていたら「ドラッグだった」とみなす。
  // これが無いと、タイトルを掴んで動かそうとしただけで編集欄が開いてしまう。
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const wasClick = (e: React.MouseEvent) =>
    !downAt.current ||
    (Math.abs(e.clientX - downAt.current.x) < 4 && Math.abs(e.clientY - downAt.current.y) < 4);
  const tone = blockTone(block);
  const c = TONE[tone];
  const done = block.status === "achieved";

  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  const rows = block.subtasks.length + (adding ? 1 : 0);
  const trunkH = rows > 0 ? (rows - 1) * SUBTASK_H + SUBTASK_H / 2 : 0;

  return (
    <div
      className={cn("absolute select-none", dragging && "brick-raised", lifted && "brick-lifted")}
      /*
       * 描画順は「段」で決める。**上に載っている積み木ほど奥**。
       * 下の積み木が手前に来て、上の積み木の下端(厚み)を隠すことで、
       * 「奥から手前へ積み上がっている」ように見える。逆にすると平らに見える。
       */
      style={{
        left: x,
        top: y,
        zIndex: Math.max(6, (dragging ? 200 : 40) - depth * 2) + (expanded ? 1 : 0),
      }}
      data-block={block.id}
      data-tone={tone}
    >
      {/* ---- 積み木本体 ---- */}
      <div
        className="block-grab relative flex items-stretch"
        data-dragging={dragging}
        style={{ height: BLOCK_H }}
        onPointerDown={(e) => {
          downAt.current = { x: e.clientX, y: e.clientY };
          onPointerDown(e);
        }}
        onClick={(e) => wasClick(e) && onSelect()}
      >
        {/* 左の持ち手: 開閉 */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleExpand}
          className="brick brick-press grid shrink-0 place-items-center rounded-l-[13px] text-[#5b5b5b]"
          style={
            {
              width: HANDLE_W,
              background: "var(--color-grip-face)",
              "--depth-color": "var(--color-grip-deep)",
            } as React.CSSProperties
          }
          aria-expanded={expanded}
          aria-label={expanded ? "サブタスクを閉じる" : "サブタスクを開く"}
          data-testid="block-handle"
        >
          <Chevron up={expanded} />
        </button>

        {/* 面: 担当者アイコン + タイトル */}
        <div
          className="brick group/face flex items-center gap-2.5 rounded-r-[13px] pl-2.5 pr-2"
          style={
            {
              width: Math.max(MIN_FACE_W, width - HANDLE_W),
              background: c.face,
              color: c.ink,
              "--depth-color": c.deep,
            } as React.CSSProperties
          }
        >
          <OwnerChip
            ownerId={block.owner?.id ?? null}
            ownerName={block.owner?.name ?? null}
            members={members}
            onPick={(id) => {
              const before = block.owner?.id ?? null;
              const setOwner = (owner_id: string | null) =>
                start(() => updateBlockAction(block.id, { owner_id }));
              setOwner(id);
              record({
                label: "担当者を変えた",
                undo: () => setOwner(before),
                redo: () => setOwner(id),
              });
            }}
          />

          {editingTitle ? (
            <input
              autoFocus
              defaultValue={block.title}
              style={{ width: Math.max(160, block.title.length * 15) }}
              className="inset-field rounded-[8px] px-2 py-1 text-[13.5px] font-bold text-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                const before = block.title;
                setEditingTitle(false);
                if (!v || v === before) return;
                const rename = (title: string) => start(() => updateBlockAction(block.id, { title }));
                rename(v);
                record({
                  label: "積み木の名前を変えた",
                  undo: () => rename(before),
                  redo: () => rename(v),
                });
              }}
              onKeyDown={(e) => {
                if (isComposing(e)) return; // 変換中の Enter は確定に使わせる
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={(e) => wasClick(e) && setEditingTitle(true)}
              className={cn(
                "max-w-[420px] truncate text-left text-[13.5px] font-bold",
                done && "line-through opacity-60",
              )}
              title="クリックで書きかえ"
            >
              {block.title}
            </button>
          )}

          {block.due_date && (
            <span className="num shrink-0 text-[11px] font-bold opacity-65" data-testid="block-due-label">
              {shortDue(block.due_date)}
            </span>
          )}
          {block.done_subtasks > 0 && (
            <span className="num shrink-0 text-[11px] font-bold opacity-45">
              {block.done_subtasks}/{block.subtasks.length}
            </span>
          )}

          <span className="flex-1" />
        </div>

      </div>

      {/* ---- 枝: サブタスク ---- */}
      {expanded && (
        <div className="relative" style={{ paddingTop: TRUNK_TOP }}>
          {rows > 0 && (
            <div
              className="absolute rounded-full"
              style={{
                left: TRUNK_X,
                top: 0,
                width: 3,
                height: TRUNK_TOP + trunkH,
                background: "var(--color-toy-purple)",
              }}
            />
          )}
          {block.subtasks.map((t, i) => (
            <div key={t.id} style={{ animationDelay: `${i * 28}ms` }}>
              <SubtaskRow task={t} members={members} />
            </div>
          ))}

          {adding ? (
            <div className="branch flex items-center" style={{ height: SUBTASK_H }}>
              <div
                className="shrink-0 rounded-full"
                style={{ width: BRANCH_W, height: 3, marginLeft: TRUNK_X, background: "var(--color-toy-purple)" }}
              />
              <input
                ref={addRef}
                placeholder="サブタスク"
                className="inset-field ml-2 w-48 rounded-[8px] px-2 py-1 text-[12px] font-bold"
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={() => setAdding(false)}
                onKeyDown={(e) => {
                  if (isComposing(e)) return; // 変換中の Enter は確定に使わせる
                  if (e.key === "Escape") setAdding(false);
                  if (e.key === "Enter") {
                    const v = e.currentTarget.value.trim();
                    if (!v) return setAdding(false);
                    e.currentTarget.value = "";
                    // redo で作り直すと新しいIDになるので、そのつど覚えなおす
                    let id: string | null = null;
                    const add = async () => {
                      id = await addSubtaskAction(block.id, v, currentMemberId);
                    };
                    start(async () => {
                      await add();
                      record({
                        label: `「${v}」を足した`,
                        undo: async () => {
                          if (id) await deleteSubtaskAction(id);
                        },
                        redo: add,
                      });
                    });
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setAdding(true)}
              className="branch flex items-center text-muted-foreground hover:text-[var(--color-toy-purple)]"
              style={{ height: SUBTASK_H }}
              data-testid="add-subtask"
            >
              <div
                className="shrink-0 rounded-full opacity-30"
                style={{ width: BRANCH_W, height: 3, marginLeft: TRUNK_X, background: "currentColor" }}
              />
              <span className="ml-2 text-[12px] font-bold">＋ サブタスク</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
