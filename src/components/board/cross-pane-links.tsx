"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { arrowPath } from "@/components/board/links-layer";
import { useHistory } from "@/components/board/history";
import { createLinkAction, deleteLinkAction } from "@/app/actions";
import type { PeriodBoard } from "@/lib/services/periods";

/**
 * 分割画面で、**枠をまたぐ**依存の矢印を描く層。
 *
 * 各枠は自分のカメラで自由に動くので、矢印の両端の位置は紙の座標では決められない。
 * そこで毎フレーム、画面に実際に出ている積み木の位置(getBoundingClientRect)を測って、
 * 画面の座標で線を引く。たとえるなら「2枚の地図を並べて、上に透明なシートを重ね、
 * そこに定規で線を引き直し続ける」。
 *
 * 片方の積み木が枠の外へスクロールしたら、線は引かない。見えている側の端に
 * 「向こうへ続く」短い点線の矢印だけを出す(画面を横切る線が、別の積み木を指して見えないように)。
 *
 * 押すと選べて、× か Backspace で外せる(⌘Z で戻る)。
 */

interface Seg {
  id: string;
  d: string;
  /** 片方が見えていない = 短い印だけ */
  partial: boolean;
  done: boolean;
  mid: { x: number; y: number };
}

const STUB = 44;

export function CrossPaneLinks({ boards }: { boards: PeriodBoard[] }) {
  const [segs, setSegs] = useState<Seg[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  /** 外したけれど、まだ盤の読み直しが届いていない矢印 */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const { record } = useHistory();
  const lastRef = useRef("");

  // どの積み木がどの期間か、と「またいでいる矢印」を先に作っておく
  const { home, done, crossing, order } = useMemo(() => {
    const home = new Map<string, string>();
    const done = new Map<string, boolean>();
    for (const b of boards) {
      for (const bl of b.blocks) {
        home.set(bl.id, b.period.id);
        done.set(bl.id, bl.status === "achieved");
      }
    }
    const seen = new Set<string>();
    const crossing = boards
      .flatMap((b) => b.links)
      .filter((l) => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        const a = home.get(l.from_id);
        const z = home.get(l.to_id);
        return a && z && a !== z;
      });
    const order = new Map(boards.map((b, i) => [b.period.id, i]));
    return { home, done, crossing, order };
  }, [boards]);

  const shown = useMemo(() => crossing.filter((l) => !hidden.has(l.id)), [crossing, hidden]);

  useEffect(() => {
    if (shown.length === 0) return;
    lastRef.current = "";
    let raf = 0;
    const find = (id: string) => {
      const pane = document.querySelector<HTMLElement>(`[data-pane="${CSS.escape(home.get(id)!)}"]`);
      const el = pane?.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`);
      if (!pane || !el) return null;
      const r = el.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      return { r, p, visible: r.right > p.left && r.left < p.right && r.bottom > p.top && r.top < p.bottom };
    };
    const tick = () => {
      const out: Seg[] = [];
      for (const l of shown) {
        const a = find(l.from_id);
        const z = find(l.to_id);
        if (!a || !z) continue;
        const from = { x: a.r.right, y: a.r.top + a.r.height / 2 };
        const to = { x: z.r.left, y: z.r.top + z.r.height / 2 };
        const isDone = done.get(l.from_id) ?? false;
        if (a.visible && z.visible) {
          out.push({ id: l.id, d: arrowPath(from, to), partial: false, done: isDone, mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } });
          continue;
        }
        if (!a.visible && !z.visible) continue;
        // 見えている側から、相手の枠のほうへ短い印を出す
        const toRight = (order.get(home.get(l.to_id)!) ?? 0) > (order.get(home.get(l.from_id)!) ?? 0);
        if (a.visible) {
          const dir = toRight ? 1 : -1;
          const s = toRight ? from : { x: a.r.left, y: from.y };
          const e = { x: s.x + dir * STUB, y: s.y };
          out.push({ id: l.id, d: `M${s.x} ${s.y} L${e.x} ${e.y}`, partial: true, done: isDone, mid: e });
        } else {
          const dir = toRight ? -1 : 1;
          const e = toRight ? to : { x: z.r.right, y: to.y };
          const s = { x: e.x + dir * STUB, y: e.y };
          out.push({ id: l.id, d: `M${s.x} ${s.y} L${e.x} ${e.y}`, partial: true, done: isDone, mid: s });
        }
      }
      // 変わった時だけ描き直す(毎フレーム setState すると重い)
      const key = out.map((s) => s.d + s.partial).join("|");
      if (key !== lastRef.current) {
        lastRef.current = key;
        setSegs(out);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [home, done, shown, order]);

  const remove = (id: string) => {
    const l = crossing.find((x) => x.id === id);
    if (!l) return;
    const drop = () => {
      setHidden((h) => new Set(h).add(id));
      start(() => deleteLinkAction(id));
    };
    drop();
    setSelected(null);
    record({
      label: "矢印を外した",
      undo: () => {
        setHidden((h) => {
          const n = new Set(h);
          n.delete(id);
          return n;
        });
        start(async () => {
          await createLinkAction(l.from_id, l.to_id, id);
        });
      },
      redo: drop,
    });
  };

  // 選んでいる間だけ: Backspace で外す / Esc・ほかを押すと選択を外す
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        e.stopImmediatePropagation();
        remove(selected);
      }
      if (e.key === "Escape") setSelected(null);
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-cross-link]")) setSelected(null);
    };
    // 盤のキー操作より先に受ける(盤の Backspace が積み木を消さないように)
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("pointerdown", onDown, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (shown.length === 0 || segs.length === 0) return null;
  const sel = segs.find((s) => s.id === selected);
  return (
    <>
      <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full" data-testid="cross-links">
        <defs>
          {[
            ["xarrow", "#6c4bf4"],
            ["xarrow-done", "#1f9d55"],
          ].map(([id, c]) => (
            <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={c} />
            </marker>
          ))}
        </defs>
        {segs.map((s) => {
          const on = s.id === selected;
          return (
            <g key={s.id} className="group" data-cross-link={s.id}>
              <path
                d={s.d}
                fill="none"
                stroke={on ? "#6c4bf4" : s.done ? "#1f9d55" : "#6c4bf4"}
                strokeWidth={on ? 3.5 : 2.5}
                strokeDasharray={s.partial ? "5 4" : undefined}
                opacity={on ? 1 : s.partial ? 0.6 : 0.85}
                className="transition-[stroke-width] group-hover:[stroke-width:3.5]"
                markerEnd={s.done ? "url(#xarrow-done)" : "url(#xarrow)"}
                data-testid="cross-link"
              />
              {/* 押しやすい太い透明な線 */}
              <path
                d={s.d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelected(s.id);
                }}
                data-testid="cross-link-hit"
              />
            </g>
          );
        })}
      </svg>
      {sel && (
        <button
          type="button"
          className="fixed z-30 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[var(--color-toy-purple)] bg-white text-[var(--color-toy-purple)]"
          style={{ left: sel.mid.x, top: sel.mid.y }}
          onClick={() => remove(sel.id)}
          aria-label="矢印を外す"
          title="矢印を外す(Backspace でも)"
          data-cross-link={sel.id}
          data-testid="cross-link-delete"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </>
  );
}
