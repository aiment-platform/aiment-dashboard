"use client";

import { createPortal } from "react-dom";
import type { BlockLink } from "@/lib/services/board-items";
import type { PeriodBoard } from "@/lib/services/periods";
import { cn } from "@/lib/utils";

/**
 * 依存の矢印。「A が終わったら B」。A の右端から B の左端へ曲線で引く。
 *
 * 相手が別の期間にいるときは、盤の端に「→ 期間名: 積み木名」の札だけ出す。
 * ただし分割画面でその期間も並んでいるときは、札は出さない(画面をまたぐ本物の矢印が引かれるので)。
 */

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLOR = "rgba(108,75,244,0.55)";
const DONE = "rgba(76,160,60,0.6)";

/** 右端 → 左端 の曲線。後ろ向き(相手が左)でも、ちゃんと回り込む */
export function arrowPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const k = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M${a.x} ${a.y} C${a.x + k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`;
}

export function LinksLayer({
  links,
  rectOf,
  outside,
  visiblePeriods,
  doneOf,
  selectedLink,
  scale,
  onSelect,
  onDelete,
}: {
  links: BlockLink[];
  /** その積み木がこの盤のどこにあるか(無ければ null) */
  rectOf: (id: string) => RectLike | null;
  outside: PeriodBoard["outside"];
  /** 分割画面で並んでいる期間(その期間の相手は札を出さない) */
  visiblePeriods: Set<string>;
  doneOf: (id: string) => boolean;
  selectedLink: string | null;
  scale: number;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const inv = 1 / scale;
  const here: React.ReactNode[] = [];
  const stubs: React.ReactNode[] = [];

  for (const l of links) {
    const a = rectOf(l.from_id);
    const b = rectOf(l.to_id);
    const on = selectedLink === l.id;
    if (a && b) {
      const p = { x: a.x + a.w, y: a.y + a.h / 2 };
      const q = { x: b.x, y: b.y + b.h / 2 };
      const d = arrowPath(p, q);
      const color = doneOf(l.from_id) ? DONE : COLOR;
      here.push(
        <g key={l.id} data-link={l.id} className="group">
          <path d={d} fill="none" stroke={on ? "var(--color-toy-purple)" : color} strokeWidth={on ? 3.5 : 2.5} className="group-hover:[stroke-width:3.5]" markerEnd={on ? "url(#arrow-on)" : doneOf(l.from_id) ? "url(#arrow-done)" : "url(#arrow)"} />
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            style={{ pointerEvents: "stroke", cursor: "pointer" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(l.id);
            }}
            data-testid="link-path"
          />
        </g>,
      );
      if (on) {
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        stubs.push(
          <button
            key={`x-${l.id}`}
            type="button"
            className="absolute grid size-6 place-items-center rounded-full border-2 border-[var(--color-toy-purple)] bg-white text-[var(--color-toy-purple)]"
            style={{ left: mid.x, top: mid.y, transform: `translate(-50%,-50%) scale(${inv})`, zIndex: 330 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(l.id)}
            aria-label="矢印を消す"
            title="矢印を消す(Backspace でも)"
            data-testid="link-delete"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>,
        );
      }
      continue;
    }
    // 片方が別の期間にいる
    const other = a ? outside[l.to_id] : b ? outside[l.from_id] : undefined;
    if (!other || visiblePeriods.has(other.period_id)) continue;
    const self = (a ?? b)!;
    const going = Boolean(a); // この盤から出ていく
    const at = going ? { x: self.x + self.w, y: self.y + self.h / 2 } : { x: self.x, y: self.y + self.h / 2 };
    here.push(
      <path
        key={l.id}
        d={going ? `M${at.x} ${at.y} h36` : `M${at.x - 36} ${at.y} h36`}
        fill="none"
        stroke={COLOR}
        strokeWidth={2.5}
        strokeDasharray="4 4"
        markerEnd="url(#arrow)"
      />,
    );
    // 札も押せる: 選ぶと × が出て、別の期間とのつながりもここで外せる
    stubs.push(
      <button
        type="button"
        key={`s-${l.id}`}
        className={cn(
          "absolute cursor-pointer whitespace-nowrap rounded-[7px] border-2 border-dashed px-1.5 py-0.5 text-[10.5px] font-bold text-[var(--color-toy-purple)]",
          on ? "border-[var(--color-toy-purple)] bg-white" : "border-[rgba(108,75,244,0.45)] bg-white/90 hover:border-[var(--color-toy-purple)]",
        )}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect(l.id);
        }}
        style={{
          left: going ? at.x + 40 : at.x - 40,
          top: at.y,
          transform: `translate(${going ? "0" : "-100%"}, -50%) scale(${inv})`,
          transformOrigin: going ? "left center" : "right center",
          zIndex: 155,
        }}
        title={`${other.period_title} の「${other.title}」とつながっている(押すと選べる)`}
        data-testid="link-stub"
      >
        {going ? `→ ${other.period_title}: ${other.title}` : `${other.period_title}: ${other.title} →`}
      </button>,
    );
    if (on) {
      stubs.push(
        <button
          key={`sx-${l.id}`}
          type="button"
          className="absolute grid size-6 place-items-center rounded-full border-2 border-[var(--color-toy-purple)] bg-white text-[var(--color-toy-purple)]"
          style={{ left: going ? at.x + 18 : at.x - 18, top: at.y, transform: `translate(-50%,-50%) scale(${inv})`, zIndex: 330 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(l.id)}
          aria-label="矢印を消す"
          title="矢印を消す(Backspace でも)"
          data-testid="link-delete"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>,
      );
    }
  }

  return (
    <>
      <svg className="pointer-events-none absolute left-0 top-0" width={1} height={1} style={{ overflow: "visible", zIndex: 3 }}>
        <defs>
          {[
            ["arrow", COLOR],
            ["arrow-done", DONE],
            ["arrow-on", "var(--color-toy-purple)"],
          ].map(([id, c]) => (
            <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {here}
      </svg>
      {stubs}
    </>
  );
}

/**
 * 矢印を引いている最中の線。画面全体に重ねる(分割画面で隣の盤へ引くときも途切れない)。
 * 画面座標で描くので、盤の拡大縮小とは関係ない。
 */
export function LinkDragLine({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <svg className="pointer-events-none fixed inset-0 z-[1000]" width="100%" height="100%">
      <defs>
        <marker id="arrow-drag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-toy-purple)" />
        </marker>
      </defs>
      <path d={arrowPath(from, to)} fill="none" stroke="var(--color-toy-purple)" strokeWidth={3} strokeDasharray="6 5" markerEnd="url(#arrow-drag)" />
    </svg>,
    document.body,
  );
}
