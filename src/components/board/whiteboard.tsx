"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createBlockAction, setBlockStatusAction, stackBlocksAction } from "@/app/actions";
import { ToyBlock } from "@/components/board/toy-block";
import { PeriodPill } from "@/components/board/period-pill";
import { HistoryDock, HistoryProvider, useHistory } from "@/components/board/history";
import { BlockToolbar } from "@/components/board/block-toolbar";
import {
  BLOCK_DEPTH,
  BLOCK_H,
  HANDLE_W,
  blockExtrasWidth,
  blockWidth,
  memberColor,
  defaultBlockPosition,
  expandedHeight,
  snap,
  DOT_GAP,
} from "@/lib/whiteboard";
import {
  applyMoves,
  findDrop,
  isDescendant,
  layoutAll,
  planDrop,
  type Drop,
  type Ground,
  type Move,
  type StackNode,
} from "@/lib/stack-layout";
import type { PeriodBlock, PeriodSummary } from "@/lib/services/periods";
import { isComposing } from "@/lib/utils";

/**
 * 積み木を置く紙。
 *
 * できること:
 *   ・何もない所をドラッグ → 紙ごと動かす(パン)
 *   ・積み木をドラッグ     → その積み木を動かす(離した時だけ保存)
 *   ・何もない所をダブルクリック → そこに新しい積み木を置く
 *   ・⌘/Ctrl + ホイール    → 拡大縮小
 *   ・⌘Z / ⇧⌘Z            → もどす / やり直す
 *   ・積み木の上/下/横へ寄せる → Scratchのようにくっつく(点線が出る)
 *
 * ★積み木の座標は「地面に直置きしたものだけ」が持つ。上に載っている積み木の
 *   位置は、土台の座標と親子関係から毎回計算する(src/lib/stack-layout.ts)。
 *   だから土台を動かせば塔ごと動くし、幅の辻褄がずれることもない。
 *
 * ★カメラは {x, y, scale} の1つの状態にまとめてある。
 *   画面 = 紙 * scale + (x, y)      紙 = (画面 - (x, y)) / scale
 *   1つにしてあるのは、ホイール拡大が「今の値」を必要とするから。
 *   別々の state だと古い値を掴んでしまい、拡大の中心がずれる。
 *
 * ★水玉は紙の模様。カメラと一緒に動き、一緒に伸び縮みする(Figmaと同じ)。
 *   画面に貼り付けたままだと、紙を動かしても模様だけ付いてきて気持ち悪い。
 */

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.6;
const HOME = { x: 40, y: 175, scale: 1 };

interface Cam {
  x: number;
  y: number;
  scale: number;
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; camX: number; camY: number }
  | {
      kind: "block";
      id: string;
      /** 掴んだ瞬間のポインタ位置(画面座標) */
      startX: number;
      startY: number;
      /** 掴んだ瞬間の積み木の左上(紙座標) */
      baseX: number;
      baseY: number;
      /** 積み木の左上とポインタのずれ(紙座標) */
      grabX: number;
      grabY: number;
      moved: boolean;
      lastX: number;
      lastY: number;
    };

export function Whiteboard(props: {
  period: PeriodSummary;
  siblings: PeriodSummary[];
  blocks: PeriodBlock[];
  members: { id: string; name: string }[];
  currentMemberId: string;
}) {
  return (
    <HistoryProvider>
      <Board {...props} />
    </HistoryProvider>
  );
}

function Board({
  period,
  siblings,
  blocks,
  members,
  currentMemberId,
}: {
  period: PeriodSummary;
  siblings: PeriodSummary[];
  blocks: PeriodBlock[];
  members: { id: string; name: string }[];
  currentMemberId: string;
}) {
  const [, start] = useTransition();
  const { record } = useHistory();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const [cam, setCam] = useState<Cam>(HOME);
  const [panning, setPanning] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  /** サーバーの答えを待たずに動かして見せるための上書き(ドラッグ中と直後だけ) */
  const [pending, setPending] = useState<Move[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  /** いま離したらどこにくっつくか */
  const [drop, setDrop] = useState<Drop | null>(null);
  /** 掴んでいる積み木が、いま指についてきている位置(紙座標) */
  const [heldPos, setHeldPos] = useState<{ x: number; y: number } | null>(null);
  /** 掴んだ積み木と、その上に載っている積み木ぜんぶ(まとめて動く) */
  const [heldTower, setHeldTower] = useState<Set<string>>(new Set());
  /** 選んでいる積み木。右に道具箱が出る。 */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /*
   * 盤の状態は「木(だれの上にだれが載っているか)」と
   * 「地面に直置きした積み木の座標」の2つだけ。あとは全部そこから計算する。
   */
  const base = useMemo(() => {
    const nodes: StackNode[] = blocks.map((b) => ({
      id: b.id,
      parentId: b.parent_id,
      sortOrder: b.sort_order,
      intrinsicWidth: blockWidth(
        b.title,
        blockExtrasWidth(Boolean(b.due_date), b.done_subtasks > 0),
      ),
      height: expanded.has(b.id) ? expandedHeight(b.subtasks.length + 1) : BLOCK_H,
    }));
    const ground: Ground = {};
    blocks.forEach((b, i) => {
      if (b.parent_id !== null) return;
      const d = defaultBlockPosition(i);
      ground[b.id] = { x: b.x ?? d.x, y: b.y ?? d.y };
    });
    return { nodes, ground };
  }, [blocks, expanded]);

  /** サーバーの状態に、返事待ちの移動を重ねたもの */
  const world = useMemo(
    () => (pending ? applyMoves(base.nodes, base.ground, pending) : base),
    [base, pending],
  );
  const placed = useMemo(() => layoutAll(world.nodes, world.ground), [world]);

  /** 上の段から順に描く = 下の積み木があとから手前に乗る(z-index と DOM 順をそろえる) */
  const ordered = useMemo(
    () => [...blocks].sort((a, b) => (placed.get(b.id)?.depth ?? 0) - (placed.get(a.id)?.depth ?? 0)),
    [blocks, placed],
  );

  /** 掴んだ積み木が、置かれていた場所からどれだけズレているか */
  const dragShift = useMemo(() => {
    if (!dragId || !heldPos) return { x: 0, y: 0 };
    const home = placed.get(dragId);
    if (!home) return { x: 0, y: 0 };
    return { x: heldPos.x - home.x, y: heldPos.y - home.y };
  }, [dragId, heldPos, placed]);

  /**
   * ある輪に「他の積み木が被っている」場所を、その輪の座標系で返す。
   * 輪は積み木より外に出るので、隣や上に載った積み木を横切る。
   * その部分だけ薄くするために使う(全部くっきりだと線が交差して読めなくなる)。
   */
  const coversOf = useCallback(
    (selfId: string, ring: { x: number; y: number; w: number; h: number }) => {
      const out: { x: number; y: number; w: number; h: number }[] = [];
      for (const other of blocks) {
        if (other.id === selfId) continue;
        const q = placed.get(other.id);
        if (!q) continue;
        const sh = heldTower.has(other.id) && heldPos ? dragShift : { x: 0, y: 0 };
        const r = { x: q.x + sh.x, y: q.y + sh.y, w: q.width, h: BLOCK_H + BLOCK_DEPTH };
        if (r.x + r.w <= ring.x || r.x >= ring.x + ring.w) continue;
        if (r.y + r.h <= ring.y || r.y >= ring.y + ring.h) continue;
        out.push({ x: r.x - ring.x, y: r.y - ring.y, w: r.w, h: r.h });
      }
      return out;
    },
    [blocks, placed, heldTower, heldPos, dragShift],
  );

  /** くっつく先の点線プレビュー: その移動を当てはめたら、どこに収まるか */
  const preview = useMemo(() => {
    if (!drop || !dragId) return null;
    const moves = planDrop(world.nodes, world.ground, drop, dragId);
    if (moves.length === 0) return null;
    const next = applyMoves(world.nodes, world.ground, moves);
    return layoutAll(next.nodes, next.ground).get(dragId) ?? null;
  }, [drop, dragId, world]);

  /** 移動を「見た目に反映 → サーバーへ保存」。やり直しはこの逆を積む。 */
  const commit = useCallback(
    (moves: Move[]) => {
      setPending(moves);
      start(async () => {
        await stackBlocksAction(
          moves.map((m) => ({
            id: m.id,
            parent_id: m.parentId,
            sort_order: m.sortOrder,
            x: m.x,
            y: m.y,
          })),
        );
        setPending(null);
      });
    },
    [start],
  );

  /** いまの状態を、あとで戻せる形(Move[])で写し取る */
  const snapshotOf = useCallback(
    (ids: string[]): Move[] =>
      ids.map((id) => {
        const nd = world.nodes.find((x) => x.id === id);
        const g = world.ground[id];
        return {
          id,
          parentId: nd?.parentId ?? null,
          sortOrder: nd?.sortOrder ?? 0,
          x: g?.x ?? null,
          y: g?.y ?? null,
        };
      }),
    [world],
  );

  const toPaper = useCallback(
    (clientX: number, clientY: number) => {
      const r = surfaceRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (clientX - r.left - cam.x) / cam.scale, y: (clientY - r.top - cam.y) / cam.scale };
    },
    [cam],
  );

  /*
   * ホイールは React の onWheel ではなく素のリスナーで受ける。
   * React の onWheel は passive(=preventDefault が効かない)ため、
   * ⌘+ホイールがブラウザのページ拡大に持っていかれてしまう。
   * setCam を「前の値を受け取る形」で書いてあるので、この関数は一度登録すれば足りる。
   */
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // ページ拡大・横スワイプの戻るを止める
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) {
        setCam((c) => {
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale * (1 - e.deltaY / 400)));
          // カーソルの下にある紙の点が動かないように原点をずらす
          const wx = (cx - c.x) / c.scale;
          const wy = (cy - c.y) / c.scale;
          return { scale: next, x: cx - wx * next, y: cy - wy * next };
        });
        return;
      }
      setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onSurfacePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    setSelectedId(null);
    dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onBlockPointerDown = (b: PeriodBlock) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const r = placed.get(b.id);
    if (!r) return;
    const paper = toPaper(e.clientX, e.clientY);
    dragRef.current = {
      kind: "block",
      id: b.id,
      startX: e.clientX,
      startY: e.clientY,
      baseX: r.x,
      baseY: r.y,
      grabX: paper.x - r.x,
      grabY: paper.y - r.y,
      moved: false,
      lastX: r.x,
      lastY: r.y,
    };
    setDragId(b.id);
    // 上に載っている積み木も一緒についてくる(塔ごと持ち上げる)
    setHeldTower(new Set(world.nodes.filter((n) => isDescendant(world.nodes, b.id, n.id)).map((n) => n.id)));
    // ここで setPointerCapture はしない。捕まえると pointerup の宛先が紙に変わり、
    // タイトルなど中のボタンの click が発火しなくなる(紙は画面全体なので捕獲は不要)。
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.kind === "pan") {
      setCam((c) => ({ ...c, x: d.camX + dx, y: d.camY + dy }));
      return;
    }
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    d.lastX = snap(d.baseX + dx / cam.scale);
    d.lastY = snap(d.baseY + dy / cam.scale);
    setHeldPos({ x: d.lastX, y: d.lastY });
    // 掴んでいる積み木の「頭の中心」がどこに近いかで、くっつき方が決まる
    const width = placed.get(d.id)?.width ?? 240;
    const centre = { x: d.lastX + width / 2, y: d.lastY + BLOCK_H / 2 };
    setDrop(findDrop(centre, placed, world.nodes, d.id, { x: d.lastX, y: d.lastY }));
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    const target = drop;
    dragRef.current = null;
    setPanning(false);
    setDragId(null);
    setDrop(null);
    setHeldPos(null);
    setHeldTower(new Set());
    if (d?.kind !== "block" || !d.moved || !target) return;

    const moves = planDrop(world.nodes, world.ground, target, d.id);
    if (moves.length === 0) return;
    const before = snapshotOf(moves.map((m) => m.id));
    commit(moves);
    record({
      label:
        target.kind === "free"
          ? "積み木を動かした"
          : target.kind === "under"
            ? "積み木を下に敷いた"
            : target.kind === "beside"
              ? "積み木を横に足した"
              : "積み木を上に載せた",
      undo: () => commit(before),
      redo: () => commit(moves),
    });
  };

  const createBlock = (title: string, at: { x: number; y: number }) => {
    // redo で作り直すと新しいIDになるので、いまのIDを覚えておいて差し替える
    let id: string | null = null;
    const make = async () => {
      id = await createBlockAction({
        period_id: period.id,
        title,
        x: at.x,
        y: at.y,
        owner_id: currentMemberId || undefined,
      });
    };
    start(async () => {
      await make();
      record({
        label: `「${title}」を置いた`,
        undo: async () => {
          if (id) await setBlockStatusAction(id, "dropped");
        },
        redo: make,
      });
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PeriodPill period={period} siblings={siblings} />

      <div
        ref={surfaceRef}
        className="board-surface fixed inset-0 overflow-hidden bg-paper"
        data-panning={panning}
        data-testid="whiteboard"
        // 水玉は紙の模様。カメラと同じだけずらし、同じだけ伸び縮みさせる。
        style={{
          backgroundImage:
            "radial-gradient(circle at center, var(--color-paper-dot) 1.2px, transparent 0)",
          backgroundSize: `${DOT_GAP * cam.scale}px ${DOT_GAP * cam.scale}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
        }}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const p = toPaper(e.clientX, e.clientY);
          setDraft({ x: snap(p.x), y: snap(p.y) });
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}
        >
          {preview && (
            <div
              className="pointer-events-none absolute rounded-[13px] border-[3px] border-dashed border-[var(--color-toy-purple)] bg-[rgba(108,75,244,0.08)]"
              style={{ left: preview.x, top: preview.y, width: preview.width, height: BLOCK_H, zIndex: 5 }}
              data-testid="drop-preview"
            />
          )}

          {/*
            取り組み中の薄い色。**積み木より奥**に敷く(手前だと面の色が濁る)。
            点線と名札は手前の層(下の map)で描く — 奥に置くと、
            ぴったり重なった隣の積み木に隠れて欠けるため。
          */}
          {blocks.map((b) => {
            const p = placed.get(b.id);
            if (!p || b.workers.length === 0) return null;
            const shift = heldTower.has(b.id) && heldPos ? dragShift : { x: 0, y: 0 };
            const pad = 7 + (Math.min(b.workers.length, 3) - 1) * 6;
            return (
              <div
                key={`tint-${b.id}`}
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  left: p.x + shift.x - pad,
                  top: p.y + shift.y - pad,
                  width: p.width + pad * 2,
                  height: BLOCK_H + BLOCK_DEPTH + pad * 2,
                  borderRadius: 13 + pad,
                  background: `color-mix(in srgb, ${memberColor(b.workers[0].id)} 13%, transparent)`,
                  zIndex: 2,
                }}
              />
            );
          })}

          {ordered.map((b) => {
            const p = placed.get(b.id);
            if (!p) return null;
            const held = dragId === b.id;
            // 掴んだ積み木のズレを、上に載っている積み木にもそのまま足す
            const rides = heldTower.has(b.id) && heldPos !== null;
            return (
              <ToyBlock
                key={b.id}
                block={b}
                x={rides ? p.x + dragShift.x : p.x}
                y={rides ? p.y + dragShift.y : p.y}
                width={p.width}
                expanded={expanded.has(b.id)}
                dragging={rides}
                lifted={held}
                depth={p.depth}
                members={members}
                currentMemberId={currentMemberId}
                onToggleExpand={() => toggle(b.id)}
                onPointerDown={onBlockPointerDown(b)}
                onSelect={() => setSelectedId(b.id)}
              />
            );
          })}

          {/*
            印は積み木より手前の1枚にまとめて描く。
            積み木の中に入れると、ぴったり重なった隣の積み木に隠れて欠けてしまう。
          */}
          {blocks.map((b) => {
            const p = placed.get(b.id);
            if (!p) return null;
            const shift = heldTower.has(b.id) && heldPos ? dragShift : { x: 0, y: 0 };
            const x = p.x + shift.x;
            const y = p.y + shift.y;
            return (
              // 積み木とぴったり同じ大きさの透明な枠。名札の「右上」がここを基準に決まる。
              <div
                key={`mark-${b.id}`}
                className="pointer-events-none absolute"
                style={{ left: x, top: y, width: p.width, height: BLOCK_H, zIndex: 150 }}
              >
                {/*
                  取り組み中の印。その人の色の点線でゆったり囲い、中を薄くその色に塗る。
                  高さは **厚み(影)まで含めた見た目の高さ** を使う — 面だけで測ると
                  輪が上にずれて見える。
                  点線は SVG の stroke-dashoffset で流す(CSS の border-dashed は動かせない)。
                  外側の輪から先に描く: あとから描く内側の塗りが外側の線を消さないように。
                */}
                {b.workers
                  .slice(0, 3)
                  .map((w, i) => ({ w, pad: 7 + i * 6 }))
                  .reverse()
                  .map(({ w, pad }) => {
                    const rw = p.width + pad * 2;
                    const rh = BLOCK_H + BLOCK_DEPTH + pad * 2;
                    const color = memberColor(w.id);
                    const maskId = `ring-${b.id}-${pad}`;
                    const covers = coversOf(b.id, { x: x - pad, y: y - pad, w: rw, h: rh });
                    const ring = {
                      x: 1.5,
                      y: 1.5,
                      width: rw - 3,
                      height: rh - 3,
                      rx: 11 + pad,
                      fill: "none",
                      stroke: color,
                      strokeWidth: 2.5,
                    };
                    return (
                      <svg
                        key={w.id}
                        className="absolute"
                        width={rw}
                        height={rh}
                        style={{ left: -pad, top: -pad, overflow: "visible" }}
                        aria-hidden
                      >
                        <defs>
                          {/* 白=はっきり見せる / 黒=隠す。被っている積み木を黒で抜く。 */}
                          <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={rw} height={rh}>
                            <rect x={0} y={0} width={rw} height={rh} fill="#fff" />
                            {covers.map((c, k) => (
                              <rect key={k} x={c.x} y={c.y} width={c.w} height={c.h} rx={13} fill="#000" />
                            ))}
                          </mask>
                        </defs>
                        {/* 下敷き: 全周をうっすら(被っている所はこれだけが残る) */}
                        <rect className="ants" {...ring} opacity={0.28} />
                        {/* 被っていない所だけ、はっきり */}
                        <rect className="ants" {...ring} mask={`url(#${maskId})`} />
                      </svg>
                    );
                  })}

                {/* 選んでいる印 */}
                {selectedId === b.id && (
                  <span
                    className="absolute"
                    style={{
                      left: -3,
                      top: -3,
                      width: p.width + 6,
                      height: BLOCK_H + BLOCK_DEPTH + 6,
                      border: "2.5px solid var(--color-toy-purple)",
                      borderRadius: 16,
                    }}
                  />
                )}
                {/* 名札は積み木の右上に乗せる(点線の上に重ねて、白地で線を切る) */}
                {b.workers.length > 0 && (
                  <span className="absolute flex gap-1" style={{ right: 8, top: -11 }}>
                    {b.workers.map((w) => (
                      <span
                        key={w.id}
                        data-testid="worker-plate"
                        className="brick whitespace-nowrap rounded-[8px] border-2 border-dashed bg-white px-1.5 py-px text-[10px] font-bold"
                        style={
                          {
                            borderColor: memberColor(w.id),
                            color: memberColor(w.id),
                            "--depth-x": "0px",
                            "--depth-y": "2px",
                            "--depth-color": "rgba(20,22,28,0.12)",
                          } as React.CSSProperties
                        }
                      >
                        {w.name}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}

          {/* 道具箱: 選んだ積み木の右に出る */}
          {(() => {
            const b = blocks.find((x) => x.id === selectedId);
            const p = b ? placed.get(b.id) : null;
            if (!b || !p) return null;
            const shift = heldTower.has(b.id) && heldPos ? dragShift : { x: 0, y: 0 };
            return (
              <div
                className="absolute"
                style={{ left: p.x + shift.x + p.width + 14, top: p.y + shift.y - 4, zIndex: 300 }}
              >
                <BlockToolbar block={b} currentMemberId={currentMemberId} periodEnd={period.end_date} />
              </div>
            );
          })()}

          {draft && (
            <div className="absolute" style={{ left: draft.x, top: draft.y, zIndex: 70 }}>
              <div className="flex items-stretch" style={{ height: BLOCK_H }}>
                <div
                  className="brick shrink-0 rounded-l-[13px]"
                  style={
                    { width: HANDLE_W, background: "var(--color-grip-face)", "--depth-color": "var(--color-grip-deep)" } as React.CSSProperties
                  }
                />
                <div
                  className="brick flex items-center rounded-r-[13px] px-2.5"
                  style={
                    {
                      width: blockWidth("あたらしいタスク") - HANDLE_W,
                      background: "var(--color-brick-face)",
                      "--depth-color": "var(--color-brick-deep)",
                    } as React.CSSProperties
                  }
                >
                  <input
                    autoFocus
                    placeholder="なにをする？"
                    className="inset-field w-full rounded-[8px] px-2 py-1 text-[13.5px] font-bold"
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={() => setDraft(null)}
                    onKeyDown={(e) => {
                      if (isComposing(e)) return; // 変換中の Enter は確定に使わせる
                      if (e.key === "Escape") setDraft(null);
                      if (e.key === "Enter") {
                        const v = e.currentTarget.value.trim();
                        setDraft(null);
                        if (v) createBlock(v, draft);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {blocks.length === 0 && !draft && (
          <p className="pointer-events-none absolute inset-x-0 top-[46%] text-center text-[14px] font-bold text-muted-foreground">
            なにもない所をダブルクリックすると、積み木を置けます
          </p>
        )}

        <div
          className="absolute bottom-6 right-6 flex items-center gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HistoryDock />
          <span className="w-2" />
          <ZoomDock
            onZoom={(d) =>
              setCam((c) => ({ ...c, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale + d)) }))
            }
            onHome={() => setCam(HOME)}
          />
        </div>
      </div>
    </>
  );
}

function ZoomDock({ onZoom, onHome }: { onZoom: (delta: number) => void; onHome: () => void }) {
  const btn =
    "brick brick-press grid size-8 place-items-center rounded-[9px] bg-white text-[15px] font-bold leading-none";
  const style = {
    "--depth-x": "0px",
    "--depth-y": "3px",
    "--depth-color": "rgba(20,22,28,0.18)",
  } as React.CSSProperties;
  return (
    <>
      <button type="button" className={btn} style={style} onClick={() => onZoom(-0.15)} aria-label="小さく" data-testid="zoom-out">
        −
      </button>
      <button type="button" className={btn} style={style} onClick={() => onZoom(0.15)} aria-label="大きく" data-testid="zoom-in">
        ＋
      </button>
      <button
        type="button"
        className="brick brick-press grid h-8 place-items-center rounded-[9px] bg-white px-2.5 text-[11px] font-bold"
        style={style}
        onClick={onHome}
        aria-label="はじめの位置にもどす"
      >
        もどす
      </button>
    </>
  );
}
