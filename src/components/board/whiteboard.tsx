"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createBlockAction,
  duplicateBlocksAction,
  setBlockStatusAction,
  setBlocksStatusAction,
  stackBlocksAction,
} from "@/app/actions";
import { ToyBlock } from "@/components/board/toy-block";
import { PeriodPill } from "@/components/board/period-pill";
import { HistoryDock, HistoryProvider, useHistory } from "@/components/board/history";
import { BlockToolbar, MultiToolbar } from "@/components/board/block-toolbar";
import { BoardRoom } from "@/components/board/realtime";
import { RealtimeBridge } from "@/components/board/realtime-bridge";
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
  blocksInRect,
  findDrop,
  isDescendant,
  layoutAll,
  planDrop,
  rectFromPoints,
  topMostOf,
  type Drop,
  type Ground,
  type Move,
  type Rect,
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
 *   ・何もない所をドラッグ → 範囲選択(囲んだ積み木をまとめて選ぶ)
 *   ・スペース + ドラッグ / 中ボタン → 紙を動かす(パン)
 *   ・⌥ドラッグ / ⌘C・⌘V     → 複製(⌥は掴んでいる最中から増えて見える)
 *   ・Backspace / Delete      → 選んだ積み木を片づける
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
  | { kind: "marquee"; from: { x: number; y: number } }
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
      /** ⌥を押しながら掴んだ = 離したところに複製する */
      duplicate: boolean;
      /** 一緒に動かす積み木(複数選択のとき)。掴んだ本人を含む。 */
      movers: string[];
    };

/**
 * サーバーがまだ知らない積み木を、その場ででっちあげる。
 * 本物が届くまでのあいだ画面に出しておくだけのもの。
 */
function newGhost(
  id: string,
  title: string,
  at: { x: number; y: number },
  ownerId: string,
  members: { id: string; name: string }[],
): PeriodBlock {
  const owner = members.find((m) => m.id === ownerId) ?? null;
  return {
    id,
    title,
    parent_id: null,
    sort_order: 0,
    x: at.x,
    y: at.y,
    status: "not_started",
    due_date: null,
    important: false,
    urgent: false,
    owner: owner ? { id: owner.id, name: owner.name } : null,
    workers: [],
    subtasks: [],
    done_subtasks: 0,
    created_at: new Date().toISOString(),
  };
}

export function Whiteboard(props: {
  period: PeriodSummary;
  siblings: PeriodSummary[];
  blocks: PeriodBlock[];
  members: { id: string; name: string }[];
  currentMemberId: string;
  /** リアルタイム共有が設定されているか(LIVEBLOCKS_SECRET_KEY があるか) */
  realtime: boolean;
}) {
  return (
    <BoardRoom roomId={`board:${props.period.id}`} enabled={props.realtime}>
      <HistoryProvider>
        <Board {...props} />
      </HistoryProvider>
    </BoardRoom>
  );
}

function Board({
  period,
  siblings,
  blocks: serverBlocks,
  members,
  currentMemberId,
  realtime,
}: {
  period: PeriodSummary;
  siblings: PeriodSummary[];
  blocks: PeriodBlock[];
  members: { id: string; name: string }[];
  currentMemberId: string;
  realtime: boolean;
}) {
  const [writing, start] = useTransition();
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
  /** いま ⌥ を押している = 元は置いたまま、複製が指についてくる */
  const [duplicating, setDuplicating] = useState(false);
  /** 掴んだ積み木と、その上に載っている積み木ぜんぶ(まとめて動く) */
  const [heldTower, setHeldTower] = useState<Set<string>>(new Set());
  /** 選んでいる積み木。1つなら右に道具箱、2つ以上ならまとめて操作する道具箱が出る。 */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** ドラッグ中の範囲選択の枠(紙座標)。null = 引いていない。 */
  const [marquee, setMarquee] = useState<Rect | null>(null);
  /** スペースを押している間はパン(Figmaと同じ) */
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** 最後にポインタがあった紙の座標。貼り付け先に使う。 */
  const pointerRef = useRef({ x: 60, y: 60 });
  /** 相手へ流すカーソル。紙の外に出たら null。 */
  const sendCursor = useRef<((p: { x: number; y: number } | null) => void) | null>(null);
  const attachCursor = useCallback((send: (p: { x: number; y: number } | null) => void) => {
    sendCursor.current = send;
  }, []);
  /** ⌘C で控えた積み木 */
  const clipboardRef = useRef<string[]>([]);

  /*
   * ---- サーバーの返事を待たずに見せる層 ------------------------------------
   *
   * 書き込みは「DBに入れて、画面を作り直して、また取ってくる」で1往復かかる。
   * 手元のPostgresなら数ミリ秒だが、Neon のような外のDBだと**秒**になる。
   * その間なにも変わらないと、消えたように見えたり、元の場所に戻って見えたりする。
   *
   * そこで「サーバーがまだ知らない変更」を手元に持っておき、画面には先に反映する。
   * **消すのはサーバーの返事が来た時ではなく、届いたデータが追いついた時**。
   * ここを間違えると、返事と再描画のすき間で一瞬だけ元に戻る(今回の不具合)。
   */
  /** まだ props に無い積み木(置いた直後・複製した直後) */
  const [ghosts, setGhosts] = useState<PeriodBlock[]>([]);
  /** 片づけたが、まだ props に居る積み木 */
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  /*
   * 上書きは「消す」のではなく、**描くたびに、まだ必要かを見る**。
   * 本物が届いていれば、その上書きは無かったことにして描く。
   * (useEffect で setState して消すと、届いた瞬間に2回描くことになる)
   */
  const serverIds = useMemo(() => new Set(serverBlocks.map((b) => b.id)), [serverBlocks]);

  /*
   * 幻を引っこめるのは「本物が届いたとき」。
   * ただし**片づけたときは幻も一緒に捨てる**必要がある。
   * 捨てないと、片づけて props から消えた瞬間に「まだ届いていない」と誤解して生き返る。
   * (だから片づけの入口は hide() に集約してある)
   */
  const liveGhosts = useMemo(
    () => ghosts.filter((g) => !serverIds.has(g.id) && !hidden.has(g.id)),
    [ghosts, serverIds, hidden],
  );
  const liveHidden = useMemo(
    () => new Set([...hidden].filter((id) => serverIds.has(id))),
    [hidden, serverIds],
  );

  const blocks = useMemo(
    () => [...serverBlocks.filter((b) => !liveHidden.has(b.id)), ...liveGhosts],
    [serverBlocks, liveHidden, liveGhosts],
  );

  /** 片づけた: 盤から即座に消す(幻も捨てる)。DBへの反映はあとから追いつく。 */
  const hide = useCallback((id: string) => {
    setHidden((h) => new Set(h).add(id));
    setGhosts((g) => g.filter((x) => x.id !== id));
  }, []);
  /** やり直し: 隠していたのをやめる */
  const show = useCallback((id: string) => {
    setHidden((h) => {
      if (!h.has(id)) return h;
      const n = new Set(h);
      n.delete(id);
      return n;
    });
  }, []);

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

  /** 届いたデータが移動を反映していたら、その上書きはもう要らない */
  const livePending = useMemo(() => {
    if (!pending) return null;
    const caughtUp = pending.every((m) => {
      const b = serverBlocks.find((x) => x.id === m.id);
      if (!b) return false;
      return (
        b.parent_id === m.parentId &&
        (b.x ?? null) === (m.x ?? null) &&
        (b.y ?? null) === (m.y ?? null)
      );
    });
    return caughtUp ? null : pending;
  }, [pending, serverBlocks]);

  /** サーバーの状態に、返事待ちの移動を重ねたもの */
  const world = useMemo(
    () => (livePending ? applyMoves(base.nodes, base.ground, livePending) : base),
    [base, livePending],
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
        try {
          await stackBlocksAction(
            moves.map((m) => ({
              id: m.id,
              parent_id: m.parentId,
              sort_order: m.sortOrder,
              x: m.x,
              y: m.y,
            })),
          );
          // ここで setPending(null) はしない。
          // サーバーの返事が返っても、画面用のデータが届くのはもう少しあと。
          // その隙間で上書きを外すと、一瞬だけ元の場所に戻って見える。
        } catch {
          setPending(null);
          toast("動かせませんでした");
        }
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
    if (e.target !== e.currentTarget) return;
    const wantsPan = e.button === 1 || spaceHeld;
    if (e.button !== 0 && !wantsPan) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (wantsPan) {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y };
      setPanning(true);
      return;
    }
    // 何もない所からのドラッグ = 範囲選択
    if (!e.shiftKey) setSelected(new Set());
    const from = toPaper(e.clientX, e.clientY);
    dragRef.current = { kind: "marquee", from };
    setMarquee({ x: from.x, y: from.y, w: 0, h: 0 });
  };

  const onBlockPointerDown = (b: PeriodBlock) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const r = placed.get(b.id);
    if (!r) return;

    // 選んでいないものを掴んだら、その積み木だけの選択に切り替える
    // (選んでいるものを掴んだら、選択はそのまま = まとめて動かす)
    let group = selected;
    if (e.shiftKey) {
      group = new Set(selected);
      if (group.has(b.id)) group.delete(b.id);
      else group.add(b.id);
      setSelected(group);
    } else if (!selected.has(b.id)) {
      group = new Set([b.id]);
      setSelected(group);
    }

    const movers = topMostOf(world.nodes, [...group].filter((id) => placed.has(id)));
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
      duplicate: e.altKey,
      movers: movers.includes(b.id) ? movers : [b.id],
    };
    setDragId(b.id);
    setDuplicating(e.altKey);
    // 動かす積み木と、その上に載っている積み木ぜんぶが一緒についてくる
    const tower = new Set<string>();
    for (const id of dragRef.current.movers) {
      for (const n of world.nodes) if (isDescendant(world.nodes, id, n.id)) tower.add(n.id);
    }
    setHeldTower(tower);
    // ここで setPointerCapture はしない。捕まえると pointerup の宛先が紙に変わり、
    // タイトルなど中のボタンの click が発火しなくなる(紙は画面全体なので捕獲は不要)。
  };

  const onPointerMove = (e: React.PointerEvent) => {
    pointerRef.current = toPaper(e.clientX, e.clientY);
    sendCursor.current?.(pointerRef.current);
    const d = dragRef.current;
    if (!d) return;

    if (d.kind === "marquee") {
      const rect = rectFromPoints(d.from, pointerRef.current);
      setMarquee(rect);
      setSelected(new Set(blocksInRect(placed, rect, BLOCK_DEPTH)));
      return;
    }

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.kind === "pan") {
      setCam((c) => ({ ...c, x: d.camX + dx, y: d.camY + dy }));
      return;
    }
    // ⌥ は掴んでいる途中で押しても離してもよい(Figmaと同じ)
    if (d.duplicate !== e.altKey) {
      d.duplicate = e.altKey;
      setDuplicating(e.altKey);
    }
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    d.lastX = snap(d.baseX + dx / cam.scale);
    d.lastY = snap(d.baseY + dy / cam.scale);
    setHeldPos({ x: d.lastX, y: d.lastY });
    // くっつき先を探すのは「1つだけ動かしていて、複製でもない」ときだけ。
    // まとめて動かしているときに1つだけ吸い付くと、位置関係が崩れる。
    if (d.movers.length === 1 && !d.duplicate) {
      const width = placed.get(d.id)?.width ?? 240;
      const centre = { x: d.lastX + width / 2, y: d.lastY + BLOCK_H / 2 };
      setDrop(findDrop(centre, placed, world.nodes, d.id, { x: d.lastX, y: d.lastY }));
    } else {
      setDrop({ kind: "free", x: d.lastX, y: d.lastY });
    }
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
    setDuplicating(false);
    setMarquee(null);
    if (d?.kind !== "block" || !d.moved || !target) return;

    const dx = d.lastX - d.baseX;
    const dy = d.lastY - d.baseY;

    // ⌥ を押しながら離した = そこに複製を置く(元の積み木は動かさない)
    if (d.duplicate) {
      duplicate(
        d.movers.map((id) => {
          const p = placed.get(id)!;
          return { id, x: snap(p.x + dx), y: snap(p.y + dy) };
        }),
        "⌥ドラッグで複製した",
      );
      return;
    }

    // まとめて動かす: 選んだぶんだけ、同じ距離だけずらして紙に直置きする
    if (d.movers.length > 1) {
      const moves: Move[] = d.movers.map((id) => {
        const p = placed.get(id)!;
        return { id, parentId: null, sortOrder: 0, x: snap(p.x + dx), y: snap(p.y + dy) };
      });
      const before = snapshotOf(moves.map((m) => m.id));
      commit(moves);
      record({
        label: `${moves.length}個の積み木を動かした`,
        undo: () => commit(before),
        redo: () => commit(moves),
      });
      return;
    }

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

  /** 複製して、そのまま選び直す(貼り付けた直後に動かせるように) */
  const duplicate = useCallback(
    (items: { id: string; x: number; y: number }[], label: string) => {
      if (items.length === 0) return;
      let made: string[] = [];
      const make = async () => {
        // 元の積み木をそのまま写して、先に置いて見せる
        const temps = items.map((it) => {
          const src = blocks.find((b) => b.id === it.id);
          const tempId = `tmp_${Math.random().toString(36).slice(2, 10)}`;
          return src
            ? { ...src, id: tempId, parent_id: null, x: it.x, y: it.y }
            : newGhost(tempId, "", { x: it.x, y: it.y }, currentMemberId, members);
        });
        setGhosts((g) => [...g.filter((x) => !serverIds.has(x.id)), ...temps]);
        try {
          made = await duplicateBlocksAction(items);
          const swap = new Map(temps.map((t, i) => [t.id, made[i]]).filter(([, v]) => v) as [string, string][]);
          setGhosts((g) => g.map((x) => (swap.has(x.id) ? { ...x, id: swap.get(x.id)! } : x)));
          setPending((ps) => ps?.map((m) => (swap.has(m.id) ? { ...m, id: swap.get(m.id)! } : m)) ?? null);
          setSelected(new Set(made));
        } catch {
          const ids = new Set(temps.map((t) => t.id));
          setGhosts((g) => g.filter((x) => !ids.has(x.id)));
          toast("複製できませんでした");
        }
      };
      start(async () => {
        await make();
        record({
          label,
          undo: async () => {
            made.forEach((id) => hide(id));
            await setBlocksStatusAction(made.map((id) => ({ id, status: "dropped" })));
            setSelected(new Set());
          },
          redo: make,
        });
      });
    },
    [start, record, setSelected, blocks, currentMemberId, members, serverIds, hide],
  );

  /** ⌘C: いま選んでいる積み木を控える / ⌘V: ポインタの位置に貼る */
  const copySelected = useCallback(() => {
    const ids = topMostOf(world.nodes, [...selected].filter((id) => placed.has(id)));
    if (ids.length === 0) return;
    clipboardRef.current = ids;
    toast(`${ids.length}個を控えました（⌘Vで貼り付け）`);
  }, [selected, world.nodes, placed]);

  const pasteClipboard = useCallback(() => {
    const ids = clipboardRef.current.filter((id) => placed.has(id));
    if (ids.length === 0) return;
    // 控えたかたまりの左上を、いまのポインタ位置に合わせる(位置関係は保つ)
    const rects = ids.map((id) => placed.get(id)!);
    const left = Math.min(...rects.map((r) => r.x));
    const top = Math.min(...rects.map((r) => r.y));
    const at = pointerRef.current;
    duplicate(
      ids.map((id) => {
        const r = placed.get(id)!;
        return { id, x: snap(at.x + (r.x - left)), y: snap(at.y + (r.y - top)) };
      }),
      `${ids.length}個を貼り付けた`,
    );
  }, [placed, duplicate]);

  /** 選んだ積み木をまとめて片づける(Backspace / Delete) */
  const deleteSelected = useCallback(() => {
    const targets = blocks.filter((b) => selected.has(b.id));
    if (targets.length === 0) return;
    const before = targets.map((b) => ({ id: b.id, status: b.status }));
    const remove = () => {
      // 先に画面から消す。DBへの書き込みはそのあと追いつく。
      before.forEach((b) => hide(b.id));
      // まとめて1回で渡す(1個ずつだと選んだ数だけ往復する)
      start(() => setBlocksStatusAction(before.map((b) => ({ id: b.id, status: "dropped" }))));
    };
    remove();
    setSelected(new Set());
    record({
      label: targets.length === 1 ? `「${targets[0].title}」を片づけた` : `${targets.length}個を片づけた`,
      undo: () => {
        before.forEach((b) => show(b.id));
        start(async () => {
          await setBlocksStatusAction(before);
          setSelected(new Set(before.map((b) => b.id)));
        });
      },
      redo: remove,
    });
  }, [blocks, selected, start, record, setSelected, hide, show]);

  const createBlock = (title: string, at: { x: number; y: number }) => {
    // redo で作り直すと新しいIDになるので、いまのIDを覚えておいて差し替える
    let id: string | null = null;
    const make = async () => {
      // サーバーの返事を待つ前に、仮のIDで画面へ出しておく。
      // 本物のIDが返ったら差し替え、props に本物が届いたら引っこめる。
      const tempId = `tmp_${Math.random().toString(36).slice(2, 10)}`;
      setGhosts((g) => [...g, newGhost(tempId, title, at, currentMemberId, members)]);
      try {
        id = await createBlockAction({
          period_id: period.id,
          title,
          x: at.x,
          y: at.y,
          owner_id: currentMemberId || undefined,
        });
        const realId = id;
        // 仮のIDを本物に差し替える。
        // 置いた直後に動かした場合、その移動も仮のIDを指しているので一緒に付け替える
        // (でないと、本物が届いた瞬間に元の位置へ戻って見える)。
        setGhosts((g) => g.map((x) => (x.id === tempId ? { ...x, id: realId } : x)));
        setPending((ps) => ps?.map((m) => (m.id === tempId ? { ...m, id: realId } : m)) ?? null);
        setSelected((sel) => {
          if (!sel.has(tempId)) return sel;
          const n = new Set(sel);
          n.delete(tempId);
          n.add(realId);
          return n;
        });
      } catch {
        setGhosts((g) => g.filter((x) => x.id !== tempId));
        toast("置けませんでした");
      }
    };
    start(async () => {
      await make();
      record({
        label: `「${title}」を置いた`,
        undo: async () => {
          if (!id) return;
          const gone = id;
          hide(gone);
          await setBlockStatusAction(gone, "dropped");
        },
        redo: make,
      });
    });
  };

  useEffect(() => {
    const typing = () => {
      const el = document.activeElement;
      return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing()) return;
      if (e.key === "Escape") setSelected(new Set());
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelected();
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        copySelected();
        pasteClipboard();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(blocks.map((b) => b.id)));
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [copySelected, pasteClipboard, deleteSelected, blocks]);

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
        data-space={spaceHeld}
        onPointerLeave={() => sendCursor.current?.(null)}
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
            const shift =
              heldTower.has(b.id) && heldPos && !duplicating ? dragShift : { x: 0, y: 0 };
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
            // 掴んだ積み木のズレを、上に載っている積み木にもそのまま足す。
            // ⌥(複製)のときは元を置いたままにして、増えるほうを別に描く。
            const rides = heldTower.has(b.id) && heldPos !== null && !duplicating;
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
                onSelect={(additive) =>
                  setSelected((cur) => {
                    if (!additive) return new Set([b.id]);
                    const next = new Set(cur);
                    if (next.has(b.id)) next.delete(b.id);
                    else next.add(b.id);
                    return next;
                  })
                }
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
            const shift =
              heldTower.has(b.id) && heldPos && !duplicating ? dragShift : { x: 0, y: 0 };
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
                {selected.has(b.id) && (
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

          {/*
            ⌥ドラッグの複製プレビュー。
            **離してから増えるのではなく、掴んでいる最中からもう1つ見えている**ようにする。
            本物と同じ ToyBlock を描くので、置いたときの見た目とずれない。
            触れないように pointer-events は殺してある。
          */}
          {duplicating &&
            heldPos &&
            blocks
              .filter((b) => heldTower.has(b.id) && placed.has(b.id))
              .map((b) => {
                const p = placed.get(b.id)!;
                return (
                  <div key={`ghost-${b.id}`} className="pointer-events-none">
                    <ToyBlock
                      block={b}
                      x={p.x + dragShift.x}
                      y={p.y + dragShift.y}
                      width={p.width}
                      expanded={expanded.has(b.id)}
                      dragging
                      lifted={dragId === b.id}
                      depth={p.depth}
                      members={members}
                      currentMemberId={currentMemberId}
                      onToggleExpand={() => {}}
                      onPointerDown={() => {}}
                      onSelect={() => {}}
                    />
                  </div>
                );
              })}

          {/* 複製中の合図 */}
          {duplicating && heldPos && (
            <div
              className="brick pointer-events-none absolute grid size-6 place-items-center rounded-full bg-[var(--color-toy-purple)] text-[14px] font-bold leading-none text-white"
              style={{
                left: heldPos.x - 10,
                top: heldPos.y - 10,
                zIndex: 320,
                "--depth-x": "0px",
                "--depth-y": "2px",
                "--depth-color": "#4a2fc4",
              } as React.CSSProperties}
              data-testid="duplicate-badge"
            >
              +
            </div>
          )}

          {/* 相手のカーソル。紙の中に置くので、拡大しても位置がずれない */}
          {realtime && (
            <RealtimeBridge pending={writing} onReady={attachCursor} />
          )}

          {/* 範囲選択の枠 */}
          {marquee && (
            <div
              className="pointer-events-none absolute rounded-[10px] border-2 border-dashed border-[var(--color-toy-purple)] bg-[rgba(108,75,244,0.08)]"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, zIndex: 250 }}
              data-testid="marquee"
            />
          )}

          {/* 道具箱: 1つなら積み木の右、2つ以上ならまとめて操作する箱 */}
          {(() => {
            if (marquee || dragId || selected.size === 0) return null;
            const chosen = blocks.filter((b) => selected.has(b.id) && placed.has(b.id));
            if (chosen.length === 0) return null;
            if (chosen.length === 1) {
              const b = chosen[0];
              const p = placed.get(b.id)!;
              return (
                <div
                  className="absolute"
                  style={{ left: p.x + p.width + 14, top: p.y - 4, zIndex: 300 }}
                >
                  <BlockToolbar
                    block={b}
                    currentMemberId={currentMemberId}
                    periodEnd={period.end_date}
                    onDuplicate={() =>
                      duplicate([{ id: b.id, x: snap(p.x + 24), y: snap(p.y + 24) }], "積み木を複製した")
                    }
                    onHide={hide}
                    onShow={show}
                  />
                </div>
              );
            }

            // まとめて選んでいるとき: かたまりの右上に出す
            const rects = chosen.map((b) => {
              const p = placed.get(b.id)!;
              return { x: p.x, y: p.y, w: p.width };
            });
            const right = Math.max(...rects.map((r) => r.x + r.w));
            const top = Math.min(...rects.map((r) => r.y));
            return (
              <div className="absolute" style={{ left: right + 14, top: top - 4, zIndex: 300 }}>
                <MultiToolbar
                  blocks={chosen}
                  currentMemberId={currentMemberId}
                  onDuplicate={() =>
                    duplicate(
                      topMostOf(world.nodes, chosen.map((b) => b.id)).map((id) => {
                        const p = placed.get(id)!;
                        return { id, x: snap(p.x + 24), y: snap(p.y + 24) };
                      }),
                      `${chosen.length}個を複製した`,
                    )
                  }
                  onClear={() => setSelected(new Set())}
                  onHide={hide}
                  onShow={show}
                />
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
