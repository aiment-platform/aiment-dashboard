"use client";

import { useRef } from "react";
import type { BoardItem } from "@/lib/services/board-items";
import { boundsOf } from "@/lib/board-geometry";
import { cn, isComposing } from "@/lib/utils";

/**
 * 盤の上の「積み木ではないもの」を描く。
 *   ・SectionsLayer … セクション(囲い)。積み木より奥に描く
 *   ・StrokesLayer  … 直線とペンの線。積み木より手前に描く
 *
 * どちらも「描くだけ」。掴む・動かすの判断は盤(whiteboard.tsx)がやる。
 * 当たり判定は線そのものだけ(線の間の余白を押しても、下の積み木や紙に届く)。
 */

export const INK = "#14161c";
export const ITEM_COLORS = [
  "#14161c",
  "#6c4bf4",
  "#e8467c",
  "#22c7b8",
  "#ffb020",
];

type Shift = (id: string) => { x: number; y: number };

export function SectionsLayer({
  items,
  selected,
  shiftOf,
  scale,
  editingId,
  onPointerDown,
  onEditTitle,
  onTitle,
}: {
  items: BoardItem[];
  selected: Set<string>;
  shiftOf: Shift;
  scale: number;
  editingId: string | null;
  onPointerDown: (
    item: BoardItem,
    e: React.PointerEvent,
    part: "move" | "resize",
  ) => void;
  onEditTitle: (id: string | null) => void;
  onTitle: (id: string, title: string) => void;
}) {
  const inv = 1 / scale; // 見出しなど「画面基準の大きさ」にしたいもの
  return (
    <>
      {items
        .filter((i) => i.type === "section")
        .map((s) => {
          const sh = shiftOf(s.id);
          const on = selected.has(s.id);
          return (
            <div
              key={s.id}
              className="pointer-events-none absolute"
              style={{
                left: s.x + sh.x,
                top: s.y + sh.y,
                width: s.w,
                height: s.h,
                zIndex: 1,
              }}
              data-item={s.id}
              data-item-type="section"
            >
              {/* 面。中は押しても紙に届く(範囲選択やダブルクリックができるように) */}
              <div
                className={cn(
                  "absolute inset-0 rounded-[18px] border-2",
                  on
                    ? "border-[var(--color-toy-purple)]"
                    : "border-[rgba(108,75,244,0.3)]",
                )}
                style={{ background: "rgba(108,75,244,0.045)" }}
              />
              {/* 縁: ここを掴むと中身ごと動く */}
              {(["top", "bottom", "left", "right"] as const).map((side) => (
                <div
                  key={side}
                  className="pointer-events-auto absolute cursor-move"
                  style={{
                    ...(side === "top" || side === "bottom"
                      ? {
                          left: 0,
                          right: 0,
                          height: 10 * inv,
                          [side]: -5 * inv,
                        }
                      : {
                          top: 0,
                          bottom: 0,
                          width: 10 * inv,
                          [side]: -5 * inv,
                        }),
                  }}
                  onPointerDown={(e) => onPointerDown(s, e, "move")}
                />
              ))}
              {/* 大きさを変える角(選んでいるときだけ) */}
              {on && (
                <div
                  className="pointer-events-auto absolute cursor-nwse-resize rounded-[4px] border-2 border-[var(--color-toy-purple)] bg-white"
                  style={{
                    right: -7 * inv,
                    bottom: -7 * inv,
                    width: 14 * inv,
                    height: 14 * inv,
                  }}
                  onPointerDown={(e) => onPointerDown(s, e, "resize")}
                  data-testid="section-resize"
                />
              )}
            </div>
          );
        })}
      {/*
        見出しは別の層に出す。面と同じ層だと、すぐ上に置いた積み木の下に潜って押せなくなる。
        (画面基準の大きさ。押すと選ぶ/動かす、ダブルクリックで書きかえ)
      */}
      {items
        .filter((i) => i.type === "section")
        .map((s) => {
          const sh = shiftOf(s.id);
          const on = selected.has(s.id);
          return (
            <div
              key={`h-${s.id}`}
              className="pointer-events-auto absolute origin-top-left"
              style={{
                left: s.x + sh.x,
                top: s.y + sh.y - 6 * inv,
                transform: `scale(${inv}) translateY(-100%)`,
                zIndex: 150,
              }}
            >
              {editingId === s.id ? (
                <TitleInput
                  value={s.title ?? ""}
                  onDone={(v) => {
                    onEditTitle(null);
                    if (v !== (s.title ?? "")) onTitle(s.id, v);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={cn(
                    "cursor-move whitespace-nowrap rounded-[8px] px-2 py-0.5 text-[12px] font-bold",
                    on
                      ? "bg-[var(--color-toy-purple)] text-white"
                      : "bg-[rgba(108,75,244,0.14)] text-[var(--color-toy-purple)]",
                  )}
                  onPointerDown={(e) => onPointerDown(s, e, "move")}
                  onDoubleClick={() => onEditTitle(s.id)}
                  title="ドラッグで中身ごと動かす / ダブルクリックで名前を変える"
                  data-testid="section-title"
                >
                  {s.title || "セクション"}
                </button>
              )}
            </div>
          );
        })}
    </>
  );
}

function TitleInput({
  value,
  onDone,
}: {
  value: string;
  onDone: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      autoFocus
      defaultValue={value}
      // 開いたときは全部選んでおく(打つとそのまま置きかわる)
      onFocus={(e) => e.currentTarget.select()}
      className="w-[200px] rounded-[8px] border-2 border-[var(--color-toy-purple)] bg-white px-2 py-0.5 text-[12px] font-bold outline-none"
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.target.value.trim())}
      onKeyDown={(e) => {
        if (isComposing(e)) return;
        if (e.key === "Enter") ref.current?.blur();
        if (e.key === "Escape") {
          if (ref.current) ref.current.value = value;
          ref.current?.blur();
        }
      }}
      data-testid="section-title-input"
    />
  );
}

/** 点列 → SVG の線 */
function pathOf(points: [number, number][]): string {
  if (points.length === 0) return "";
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

export function StrokesLayer({
  items,
  selected,
  shiftOf,
  interactive,
  onPointerDown,
}: {
  items: BoardItem[];
  selected: Set<string>;
  shiftOf: Shift;
  /** 選ぶ道具のときだけ線を掴める(描いている最中に既存の線を掴まないため) */
  interactive: boolean;
  onPointerDown: (item: BoardItem, e: React.PointerEvent) => void;
}) {
  return (
    <>
      {items
        .filter((i) => i.type === "line" || i.type === "pen")
        .map((it) => {
          const sh = shiftOf(it.id);
          const b = boundsOf(0, 0, it.points);
          const on = selected.has(it.id);
          const d = pathOf(it.points);
          return (
            <svg
              key={it.id}
              className="pointer-events-none absolute"
              style={{
                left: it.x + sh.x,
                top: it.y + sh.y,
                overflow: "visible",
                zIndex: 160,
              }}
              width={1}
              height={1}
              data-item={it.id}
              data-item-type={it.type}
            >
              {on && (
                <rect
                  x={b.x - 8}
                  y={b.y - 8}
                  width={b.w + 16}
                  height={b.h + 16}
                  rx={8}
                  fill="none"
                  stroke="var(--color-toy-purple)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={it.color ?? INK}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* 当たり判定: 線より太い透明な線。線の上だけで反応する */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  pointerEvents: interactive ? "stroke" : "none",
                  cursor: "move",
                }}
                onPointerDown={(e) => onPointerDown(it, e)}
                data-testid={`stroke-${it.type}`}
              />
            </svg>
          );
        })}
    </>
  );
}

/** 描いている最中の線・枠(まだ保存していないもの) */
export function DraftShape({
  draft,
}: {
  draft:
    | { type: "line" | "pen"; x: number; y: number; points: [number, number][] }
    | { type: "section"; x: number; y: number; w: number; h: number }
    | null;
}) {
  if (!draft) return null;
  if (draft.type === "section") {
    return (
      <div
        className="pointer-events-none absolute rounded-[18px] border-2 border-dashed border-[var(--color-toy-purple)]"
        style={{
          left: draft.x,
          top: draft.y,
          width: draft.w,
          height: draft.h,
          background: "rgba(108,75,244,0.06)",
          zIndex: 170,
        }}
        data-testid="draft-section"
      />
    );
  }
  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: draft.x, top: draft.y, overflow: "visible", zIndex: 170 }}
      width={1}
      height={1}
    >
      <path
        d={pathOf(draft.points)}
        fill="none"
        stroke={INK}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
    </svg>
  );
}
