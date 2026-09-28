"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createBlockAction,
  createItemAction,
  createLinkAction,
  deleteItemsAction,
  deleteLinkAction,
  duplicateBlocksAction,
  setBlockStatusAction,
  setBlocksStatusAction,
  stackBlocksAction,
  updateItemsAction,
} from "@/app/actions";
import { setActivePane, isActivePane } from "@/components/board/active-pane";
import { ToolPalette, type Tool } from "@/components/board/tool-palette";
import { DraftShape, ITEM_COLORS, SectionsLayer, StrokesLayer } from "@/components/board/items-layer";
import { LinkDragLine, LinksLayer } from "@/components/board/links-layer";
import { alignBox, boundsOf, centerInside, simplify, unionBox, type Box, type Guide } from "@/lib/board-geometry";
import { wouldCycle } from "@/lib/board-geometry";
import type { BlockLink, BoardItem } from "@/lib/services/board-items";
import { NoteTextarea, ToyBlock } from "@/components/board/toy-block";
import { PeriodPill } from "@/components/board/period-pill";
import { HistoryDock, HistoryProvider, useHistory } from "@/components/board/history";
import { BlockToolbar, MultiToolbar, NoteToolbar } from "@/components/board/block-toolbar";
import { BoardRoom } from "@/components/board/realtime";
import { RealtimeBridge, RealtimeCursors } from "@/components/board/realtime-bridge";
import {
  BLOCK_DEPTH,
  BLOCK_H,
  HANDLE_W,
  blockExtrasWidth,
  blockWidth,
  noteSize,
  NOTE_FONT_DEFAULT,
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
import type { PeriodBlock, PeriodBoard, PeriodSummary } from "@/lib/services/periods";
import { cn, isComposing } from "@/lib/utils";

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

// 使える範囲を広く: 0.1倍まで引いて全体を見渡せる / 3倍まで寄れる
const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
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
      /** 線・セクションを動かす。セクションなら中身(積み木・線)も一緒に */
      kind: "items";
      startX: number;
      startY: number;
      ids: string[];
      blocks: string[];
      moved: boolean;
      dx: number;
      dy: number;
    }
  | { kind: "resize"; id: string; startX: number; startY: number; w: number; h: number; nw: number; nh: number }
  | { kind: "draw"; tool: "line" | "pen" | "section"; from: { x: number; y: number }; points: [number, number][] }
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
  kind: "task" | "note" = "task",
): PeriodBlock {
  const owner = kind === "note" ? null : (members.find((m) => m.id === ownerId) ?? null);
  return {
    kind,
    id,
    title,
    parent_id: null,
    sort_order: 0,
    x: at.x,
    y: at.y,
    status: "not_started",
    due_date: null,
    font_size: null,
    important: false,
    urgent: false,
    owner: owner ? { id: owner.id, name: owner.name } : null,
    workers: [],
    subtasks: [],
    done_subtasks: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * 一時メモリの1件。
 *   seq       … いつの記録か(同じ積み木を続けて動かしたとき、古い回の後片づけで新しい記録を消さないため)
 *   writtenAt … DB に書けた時刻(サーバーが返す updated_at)。まだ書いている途中なら null
 */
type OverlayEntry = Move & { seq: number; writtenAt: string | null };

/** 一時メモリの中の仮IDを本物のIDに付け替える(置いた直後に動かした分を失わないため) */
function rekey<T extends Move>(prev: Map<string, T>, swap: Map<string, string>): Map<string, T> {
  if (![...swap.keys()].some((k) => prev.has(k))) return prev;
  const next = new Map<string, T>();
  for (const [id, m] of prev) {
    const to = swap.get(id) ?? id;
    next.set(to, { ...m, id: to });
  }
  return next;
}

/** 画面側で先に決めるID。サーバーにも同じIDで保存するので、後で付け替えなくてよい */
function clientId(prefix: "bi" | "lk"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

/** 分割画面で並べるときの情報。1画面なら undefined */
export interface PaneInfo {
  id: string;
  index: number;
  count: number;
  /** 並んでいる期間の id(その期間の相手へは、札ではなく本物の矢印を引く) */
  periods: string[];
  onNavigate: (periodId: string) => void;
  onClose?: () => void;
}

export interface WhiteboardProps {
  period: PeriodSummary;
  siblings: PeriodSummary[];
  blocks: PeriodBlock[];
  items: BoardItem[];
  links: BlockLink[];
  outside: PeriodBoard["outside"];
  members: { id: string; name: string }[];
  currentMemberId: string;
  /** リアルタイム共有が設定されているか(LIVEBLOCKS_SECRET_KEY があるか) */
  realtime: boolean;
  pane?: PaneInfo;
  /** 分割画面ボタン(1画面のときだけ) */
  onSplit?: () => void;
}

/**
 * 盤。1画面のときは自分で「もどす/やり直す」の山を持つ。
 * 分割画面のときは山を画面の外(ページ)で1つ共有する — ⌘Z が「最後にやったこと」を戻すように。
 */
export function Whiteboard(props: WhiteboardProps) {
  const board = (
    <BoardRoom roomId={`board:${props.period.id}`} enabled={props.realtime}>
      <Board {...props} />
    </BoardRoom>
  );
  return props.pane ? board : <HistoryProvider>{board}</HistoryProvider>;
}

export { HistoryProvider as SharedHistory };

function Board({
  period,
  siblings,
  blocks: serverBlocks,
  items: serverItems,
  links: serverLinks,
  outside,
  members,
  currentMemberId,
  realtime,
  pane,
  onSplit,
}: WhiteboardProps) {
  const paneId = pane?.id ?? "main";
  const [writing, start] = useTransition();
  const { record } = useHistory();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const [cam, setCam] = useState<Cam>(HOME);
  const [panning, setPanning] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  /** サーバーの答えを待たずに動かして見せるための上書き(ドラッグ中と直後だけ) */
  /*
   * 動かした結果の「一時メモリ」。積み木ID → そこに置いたという記録。
   *
   * 以前は「最後に動かした1回分」しか持っていなかったので、1つ目の書き込みがDBに届く前に
   * 2つ目を動かすと1つ目の記録が上書きで消え、DBの古い位置へワープしていた。
   * いまは**積み木ごとに**覚えておき、それぞれ DB が追いついた時点で1つずつ忘れる。
   * seq は「いつの記録か」の番号。古い書き込みの後片づけが新しい記録を消さないために使う。
   */
  const [overlay, setOverlay] = useState<Map<string, OverlayEntry>>(new Map());
  const seqRef = useRef(0);
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

  // ---- 道具・形・矢印 -----------------------------------------------------------
  const [tool, setTool] = useState<Tool>("select");
  /** 置く前の入力欄が、タスクかメモか */
  const [draftKind, setDraftKind] = useState<"task" | "note">("task");
  /** 選んでいる形(線・セクション) */
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  /** 描いている最中の線・枠 */
  const [drawDraft, setDrawDraft] = useState<
    | { type: "line" | "pen"; x: number; y: number; points: [number, number][] }
    | { type: "section"; x: number; y: number; w: number; h: number }
    | null
  >(null);
  /** 形を掴んで動かしている最中のずれ(中身の積み木にも同じだけ足す) */
  const [itemDrag, setItemDrag] = useState<{ ids: Set<string>; blocks: Set<string>; dx: number; dy: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; w: number; h: number } | null>(null);
  /** スナップのガイド線 */
  const [guides, setGuides] = useState<Guide[]>([]);
  /** ポインタが乗っている積み木(矢印の持ち手を出す) */
  const [hovered, setHovered] = useState<string | null>(null);
  /** 矢印を引いている最中(画面座標) */
  const [linkDrag, setLinkDrag] = useState<{ fromId: string; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);

  /*
   * 形と矢印も、積み木と同じく「サーバーの返事を待たずに見せる」。
   * id は画面で先に決めてサーバーに渡すので、仮の id を付け替える手間が無い。
   *   itemEdits … id → そうなっているはずの形(null = 消した)。書けた時刻より新しいデータが届いたら忘れる
   *   linkEdits … id → そうなっているはずの矢印(null = 消した)
   */
  const [itemEdits, setItemEdits] = useState<Map<string, { item: BoardItem | null; writtenAt: string | null }>>(new Map());
  const [linkEdits, setLinkEdits] = useState<Map<string, BlockLink | null>>(new Map());

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
  /** メモの大きさ(改行・文字の大きさで変わる)。タスクは名前の長さで幅だけ変わる */
  const noteBox = useMemo(() => {
    const m = new Map<string, { width: number; height: number }>();
    for (const b of blocks) if (b.kind === "note") m.set(b.id, noteSize(b.title, b.font_size));
    return m;
  }, [blocks]);
  /** 積み木の面の高さ(タスクは一定、メモは行数しだい) */
  const faceH = useCallback((id: string) => noteBox.get(id)?.height ?? BLOCK_H, [noteBox]);

  const base = useMemo(() => {
    const nodes: StackNode[] = blocks.map((b) => {
      const note = noteBox.get(b.id);
      return {
        id: b.id,
        parentId: b.parent_id,
        sortOrder: b.sort_order,
        intrinsicWidth:
          note?.width ?? blockWidth(b.title, blockExtrasWidth(Boolean(b.due_date), b.done_subtasks > 0)),
        height: note?.height ?? (expanded.has(b.id) ? expandedHeight(b.subtasks.length + 1) : BLOCK_H),
      };
    });
    const ground: Ground = {};
    blocks.forEach((b, i) => {
      if (b.parent_id !== null) return;
      const d = defaultBlockPosition(i);
      ground[b.id] = { x: b.x ?? d.x, y: b.y ?? d.y };
    });
    return { nodes, ground };
  }, [blocks, expanded, noteBox]);

  /** 届いたデータが移動を反映していたら、その上書きはもう要らない */
  /**
   * 一時メモリのうち、まだ画面に重ねる必要があるものだけ。
   *
   * 捨てる(=DB の値をそのまま描く)のは次のどちらかのときだけ。**時間では捨てない。**
   *   1. 届いたデータが、動かした位置と一致した(DB が追いついた)
   *   2. 届いたデータが、自分が書いたより**後の**別の書き込みを示している(相方が動かした)
   * 以前は「書けてから5秒で捨てる」だったが、遠い DB ではその間にデータが届かず、
   * 捨てた瞬間だけ古い位置が描かれていた(本番で約7秒後に一瞬戻る症状)。
   */
  const livePending = useMemo(() => {
    const serverById = new Map(serverBlocks.map((b) => [b.id, b]));
    const live: Move[] = [];
    for (const m of overlay.values()) {
      const b = serverById.get(m.id);
      if (b) {
        // 上に載っている積み木は座標を持たない(親から計算する)ので、座標は比べない
        const samePlace =
          b.parent_id === m.parentId &&
          b.sort_order === m.sortOrder &&
          (m.x === null || b.x === m.x) &&
          (m.y === null || b.y === m.y);
        if (samePlace) continue;
        if (m.writtenAt && b.updated_at > m.writtenAt) continue; // 自分より後に誰かが書いた
      }
      live.push(m);
    }
    return live.length ? live : null;
  }, [overlay, serverBlocks]);

  /** サーバーの状態に、返事待ちの移動を重ねたもの */
  const world = useMemo(
    () => (livePending ? applyMoves(base.nodes, base.ground, livePending) : base),
    [base, livePending],
  );
  const placed = useMemo(() => layoutAll(world.nodes, world.ground), [world]);

  // ---- 形・矢印の「いま見えているはずの姿」 --------------------------------------
  const items = useMemo(() => {
    const byId = new Map(serverItems.map((i) => [i.id, i]));
    for (const [id, e] of itemEdits) {
      const server = byId.get(id);
      // 書けた時刻より新しいデータが届いていれば、この記録はもう要らない
      if (e.writtenAt && (e.item ? server && server.updated_at >= e.writtenAt : !server)) continue;
      if (e.item) byId.set(id, e.item);
      else byId.delete(id);
    }
    const list = [...byId.values()];
    return list.sort((a, b) => Number(a.type !== "section") - Number(b.type !== "section"));
  }, [serverItems, itemEdits]);

  const links = useMemo(() => {
    const byId = new Map(serverLinks.map((l) => [l.id, l]));
    for (const [id, l] of linkEdits) {
      if (l) byId.set(id, l);
      else byId.delete(id);
    }
    return [...byId.values()];
  }, [serverLinks, linkEdits]);

  /** 形をその場で書きかえて見せ、DB に保存する(null = 消す)。書けたら時刻を覚える */
  const saveItems = useCallback(
    (next: { id: string; item: BoardItem | null }[], persist: () => Promise<string | void>) => {
      setItemEdits((prev) => {
        const m = new Map(prev);
        for (const n of next) m.set(n.id, { item: n.item, writtenAt: null });
        return m;
      });
      start(async () => {
        try {
          const at = (await persist()) ?? new Date().toISOString();
          setItemEdits((prev) => {
            const m = new Map(prev);
            for (const n of next) {
              const e = m.get(n.id);
              if (e && e.writtenAt === null && e.item === n.item) m.set(n.id, { ...e, writtenAt: at });
            }
            return m;
          });
        } catch {
          setItemEdits((prev) => {
            const m = new Map(prev);
            for (const n of next) m.delete(n.id);
            return m;
          });
          toast("保存できませんでした");
        }
      });
    },
    [start],
  );

  /** 形を作る(undo は消す、redo は同じ id で作り直す) */
  const addItem = useCallback(
    (item: BoardItem, label: string) => {
      const make = () =>
        saveItems([{ id: item.id, item }], async () => {
          const made = await createItemAction({
            id: item.id,
            period_id: item.period_id,
            type: item.type,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            color: item.color,
            points: item.points,
            title: item.title,
          });
          return made.updated_at;
        });
      const remove = () => saveItems([{ id: item.id, item: null }], () => deleteItemsAction([item.id]));
      make();
      record({ label, undo: remove, redo: make });
    },
    [saveItems, record],
  );

  /** 形を消す(undo は同じ id・同じ中身で作り直す) */
  const removeItems = useCallback(
    (ids: string[]) => {
      const gone = items.filter((i) => ids.includes(i.id));
      if (gone.length === 0) return;
      const remove = () => saveItems(gone.map((g) => ({ id: g.id, item: null })), () => deleteItemsAction(gone.map((g) => g.id)));
      const restore = () =>
        saveItems(gone.map((g) => ({ id: g.id, item: g })), async () => {
          let at = "";
          for (const g of gone) {
            const made = await createItemAction({ ...g, period_id: g.period_id });
            at = made.updated_at;
          }
          return at;
        });
      remove();
      record({ label: gone.length === 1 ? "形を消した" : `${gone.length}個の形を消した`, undo: restore, redo: remove });
    },
    [items, saveItems, record],
  );

  /** 形を動かす・大きさや名前を変える */
  const patchItems = useCallback(
    (patches: { id: string; x?: number; y?: number; w?: number; h?: number; title?: string | null; color?: string | null }[]) => {
      const next = patches
        .map((pt) => {
          const cur = items.find((i) => i.id === pt.id);
          return cur ? { id: pt.id, item: { ...cur, ...pt } as BoardItem } : null;
        })
        .filter(Boolean) as { id: string; item: BoardItem }[];
      saveItems(next, async () => (await updateItemsAction(patches)).written_at);
    },
    [items, saveItems],
  );

  /** 矢印を引く / 消す(id は画面で決める) */
  const addLink = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      if (links.some((l) => l.from_id === fromId && l.to_id === toId)) return;
      if (wouldCycle(links, fromId, toId)) {
        toast("輪になるのでつなげません(お互いが「相手が先」になってしまいます)");
        return;
      }
      const id = clientId("lk");
      const link = { id, from_id: fromId, to_id: toId };
      const make = () => {
        setLinkEdits((m) => new Map(m).set(id, link));
        start(async () => {
          try {
            await createLinkAction(fromId, toId, id);
          } catch {
            setLinkEdits((m) => {
              const n = new Map(m);
              n.delete(id);
              return n;
            });
            toast("矢印を引けませんでした");
          }
        });
      };
      const remove = () => {
        setLinkEdits((m) => new Map(m).set(id, null));
        start(() => deleteLinkAction(id));
      };
      make();
      record({ label: "矢印でつないだ", undo: remove, redo: make });
    },
    [links, start, record],
  );

  const removeLink = useCallback(
    (id: string) => {
      const l = links.find((x) => x.id === id);
      if (!l) return;
      const remove = () => {
        setLinkEdits((m) => new Map(m).set(id, null));
        start(() => deleteLinkAction(id));
      };
      const restore = () => {
        setLinkEdits((m) => new Map(m).set(id, l));
        start(async () => {
          await createLinkAction(l.from_id, l.to_id, id);
        });
      };
      remove();
      setSelectedLink(null);
      record({ label: "矢印を消した", undo: restore, redo: remove });
    },
    [links, start, record],
  );

  /** 上の段から順に描く = 下の積み木があとから手前に乗る(z-index と DOM 順をそろえる) */
  const ordered = useMemo(
    () => [...blocks].sort((a, b) => (placed.get(b.id)?.depth ?? 0) - (placed.get(a.id)?.depth ?? 0)),
    [blocks, placed],
  );

  /**
   * 「画面基準の大きさ」にしたいものに付ける。
   * 紙は cam.scale 倍に拡大されているので、その中で 1/scale 倍すれば画面上では元の大きさに戻る。
   * カーソル・道具箱・合図のような「紙の上の物ではなく操作のためのUI」に使う(Figma と同じ扱い)。
   */
  const screenSized = useMemo(
    () => ({ transform: `scale(${1 / cam.scale})`, transformOrigin: "0 0" as const }),
    [cam.scale],
  );

  /** 水玉の間隔の倍率。引いて1目が9px未満になったら、4目おきにする */
  const dotStep = DOT_GAP * cam.scale < 9 ? 4 : 1;

  /** 掴んだ積み木が、置かれていた場所からどれだけズレているか */
  const dragShift = useMemo(() => {
    if (!dragId || !heldPos) return { x: 0, y: 0 };
    const home = placed.get(dragId);
    if (!home) return { x: 0, y: 0 };
    return { x: heldPos.x - home.x, y: heldPos.y - home.y };
  }, [dragId, heldPos, placed]);

  /** その積み木が、いま見た目上どれだけずれているか(掴んでいる / セクションごと運ばれている) */
  const blockShift = useCallback(
    (id: string) => {
      if (heldTower.has(id) && heldPos && !duplicating) return dragShift;
      if (itemDrag?.blocks.has(id)) return { x: itemDrag.dx, y: itemDrag.dy };
      return { x: 0, y: 0 };
    },
    [heldTower, heldPos, duplicating, dragShift, itemDrag],
  );
  const itemShift = useCallback(
    (id: string) => (itemDrag?.ids.has(id) ? { x: itemDrag.dx, y: itemDrag.dy } : { x: 0, y: 0 }),
    [itemDrag],
  );
  /** 大きさを変えている最中のセクションは、その大きさで描く */
  const shownItems = useMemo(
    () => (resizing ? items.map((i) => (i.id === resizing.id ? { ...i, w: resizing.w, h: resizing.h } : i)) : items),
    [items, resizing],
  );

  /** 積み木の見た目の箱(紙の座標)。矢印・スナップ・セクション判定に使う */
  const blockBox = useCallback(
    (id: string): Box | null => {
      const p = placed.get(id);
      if (!p) return null;
      const sh = blockShift(id);
      return { x: p.x + sh.x, y: p.y + sh.y, w: p.width, h: faceH(id) };
    },
    [placed, blockShift, faceH],
  );

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
        const r = { x: q.x + sh.x, y: q.y + sh.y, w: q.width, h: faceH(other.id) + BLOCK_DEPTH };
        if (r.x + r.w <= ring.x || r.x >= ring.x + ring.w) continue;
        if (r.y + r.h <= ring.y || r.y >= ring.y + ring.h) continue;
        out.push({ x: r.x - ring.x, y: r.y - ring.y, w: r.w, h: r.h });
      }
      return out;
    },
    [blocks, placed, heldTower, heldPos, dragShift, faceH],
  );

  /** くっつく先の点線プレビュー: その移動を当てはめたら、どこに収まるか */
  const preview = useMemo(() => {
    if (!drop || !dragId) return null;
    const moves = planDrop(world.nodes, world.ground, drop, dragId);
    if (moves.length === 0) return null;
    const next = applyMoves(world.nodes, world.ground, moves);
    return layoutAll(next.nodes, next.ground).get(dragId) ?? null;
  }, [drop, dragId, world]);

  /** この回(seq)の記録だけを忘れる。あとから同じ積み木を動かした記録は残す。 */
  const forget = useCallback((moves: Move[], seq: number) => {
    setOverlay((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const m of moves) {
        if (next.get(m.id)?.seq === seq) {
          next.delete(m.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  /** 移動を「見た目に反映 → サーバーへ保存」。やり直しはこの逆を積む。 */
  const commit = useCallback(
    (moves: Move[]) => {
      const seq = ++seqRef.current;
      // 1. 一時メモリに書く(積み木ごと。前の記録は、同じ積み木のものだけ新しいものに置きかわる)
      setOverlay((prev) => {
        const next = new Map(prev);
        for (const m of moves) next.set(m.id, { ...m, seq, writtenAt: null });
        return next;
      });
      // 2. DB へ。返事を待たずに画面はもう動いている
      start(async () => {
        let writtenAt: string;
        try {
          ({ written_at: writtenAt } = await stackBlocksAction(
            moves.map((m) => ({
              id: m.id,
              parent_id: m.parentId,
              sort_order: m.sortOrder,
              x: m.x,
              y: m.y,
            })),
          ));
        } catch {
          forget(moves, seq);
          toast("動かせませんでした");
          return;
        }
        // 3. DB に書けた時刻を覚える。これより後の書き込みが届いたら、この記録は古い
        setOverlay((prev) => {
          let changed = false;
          const next = new Map(prev);
          for (const m of moves) {
            const e = next.get(m.id);
            if (e?.seq === seq) {
              next.set(m.id, { ...e, writtenAt });
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      });
    },
    [start, forget],
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
          const next = clampScale(c.scale * (1 - e.deltaY / 400));
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

  /** その道具で紙を押したとき(選ぶ道具以外)。積み木の上でも描けるよう、上に敷いた透明な板で受ける */
  const startDrawing = (e: React.PointerEvent) => {
    setActivePane(paneId);
    if (e.button !== 0) return;
    const at = toPaper(e.clientX, e.clientY);
    if (tool === "note") {
      // 押した直後にブラウザが「押した所へフォーカスを移す」ので、出したばかりの入力欄が閉じてしまう。止める
      e.preventDefault();
      setDraftKind("note");
      setDraft({ x: snap(at.x), y: snap(at.y) });
      setTool("select");
      return;
    }
    if (tool === "select") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind: "draw", tool, from: at, points: [[0, 0]] };
    if (tool === "section") setDrawDraft({ type: "section", x: at.x, y: at.y, w: 0, h: 0 });
    else setDrawDraft({ type: tool, x: at.x, y: at.y, points: [[0, 0]] });
  };

  const onSurfacePointerDown = (e: React.PointerEvent) => {
    setActivePane(paneId);
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
    if (!e.shiftKey) {
      setSelected(new Set());
      setSelectedItems(new Set());
    }
    setSelectedLink(null);
    const from = toPaper(e.clientX, e.clientY);
    dragRef.current = { kind: "marquee", from };
    setMarquee({ x: from.x, y: from.y, w: 0, h: 0 });
  };

  /** 線・セクションを押した: 選んで、そのまま動かせるようにする */
  const onItemPointerDown = (item: BoardItem, e: React.PointerEvent, part: "move" | "resize" = "move") => {
    setActivePane(paneId);
    if (e.button !== 0 || tool !== "select") return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSelectedLink(null);
    if (part === "resize") {
      dragRef.current = { kind: "resize", id: item.id, startX: e.clientX, startY: e.clientY, w: item.w, h: item.h, nw: item.w, nh: item.h };
      return;
    }
    let group = selectedItems;
    if (e.shiftKey) {
      group = new Set(selectedItems);
      if (group.has(item.id)) group.delete(item.id);
      else group.add(item.id);
    } else if (!selectedItems.has(item.id)) {
      group = new Set([item.id]);
      setSelected(new Set());
    }
    setSelectedItems(group);

    // セクションなら、中に入っている積み木・線・セクションも一緒に運ぶ
    const ids = new Set(group);
    const carried = new Set<string>();
    for (const id of group) {
      const sec = items.find((i) => i.id === id && i.type === "section");
      if (!sec) continue;
      const box = { x: sec.x, y: sec.y, w: sec.w, h: sec.h };
      for (const other of items) {
        if (other.id === sec.id) continue;
        const ob = other.type === "section" ? { x: other.x, y: other.y, w: other.w, h: other.h } : boundsOf(other.x, other.y, other.points);
        if (centerInside(ob, box)) ids.add(other.id);
      }
      for (const node of world.nodes) {
        if (node.parentId !== null) continue; // 塔は土台だけ動かせば一緒に来る
        const bb = blockBox(node.id);
        if (bb && centerInside(bb, box)) carried.add(node.id);
      }
    }
    // 積み木の塔ごと(上に載っている積み木も見た目を一緒にずらす)
    const riding = new Set<string>();
    for (const id of carried) for (const n of world.nodes) if (isDescendant(world.nodes, id, n.id)) riding.add(n.id);
    dragRef.current = { kind: "items", startX: e.clientX, startY: e.clientY, ids: [...ids], blocks: [...carried], moved: false, dx: 0, dy: 0 };
    setItemDrag({ ids, blocks: riding, dx: 0, dy: 0 });
  };

  const onBlockPointerDown = (b: PeriodBlock) => (e: React.PointerEvent) => {
    setActivePane(paneId);
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedLink(null);
    if (!e.shiftKey) setSelectedItems(new Set());
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
    // 矢印の持ち手を出すため、いまどの積み木の上にいるかを覚える
    // 持ち手は積み木の右端からはみ出しているので、持ち手の上にいる間は「まだ乗っている」扱い
    const target = e.target as HTMLElement;
    if (!dragRef.current && !target.closest?.("[data-testid='link-handle']")) {
      const over = target.closest?.("[data-block]")?.getAttribute("data-block") ?? null;
      if (over !== hovered) setHovered(over);
    }
    const d = dragRef.current;
    if (!d) return;

    if (d.kind === "marquee") {
      const rect = rectFromPoints(d.from, pointerRef.current);
      setMarquee(rect);
      setSelected(new Set(blocksInRect(placed, rect, BLOCK_DEPTH)));
      // 線は触れていれば、セクションはすっぽり囲めば選ぶ
      setSelectedItems(
        new Set(
          items
            .filter((i) => {
              if (i.type === "section") return i.x >= rect.x && i.y >= rect.y && i.x + i.w <= rect.x + rect.w && i.y + i.h <= rect.y + rect.h;
              const bb = boundsOf(i.x, i.y, i.points);
              return bb.x < rect.x + rect.w && bb.x + bb.w > rect.x && bb.y < rect.y + rect.h && bb.y + bb.h > rect.y;
            })
            .map((i) => i.id),
        ),
      );
      return;
    }

    if (d.kind === "draw") {
      const at = pointerRef.current;
      if (d.tool === "section") {
        const r = rectFromPoints(d.from, at);
        setDrawDraft({ type: "section", x: r.x, y: r.y, w: r.w, h: r.h });
        return;
      }
      let rel: [number, number] = [at.x - d.from.x, at.y - d.from.y];
      if (d.tool === "line") {
        // Shift で 45° ずつに
        if (e.shiftKey) {
          const ang = Math.round(Math.atan2(rel[1], rel[0]) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(rel[0], rel[1]);
          rel = [Math.cos(ang) * len, Math.sin(ang) * len];
        }
        d.points = [[0, 0], rel];
      } else {
        d.points.push(rel);
      }
      setDrawDraft({ type: d.tool, x: d.from.x, y: d.from.y, points: [...d.points] });
      return;
    }

    if (d.kind === "resize") {
      d.nw = Math.max(80, snap(d.w + (e.clientX - d.startX) / cam.scale));
      d.nh = Math.max(60, snap(d.h + (e.clientY - d.startY) / cam.scale));
      setResizing({ id: d.id, w: d.nw, h: d.nh });
      return;
    }

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.kind === "pan") {
      setCam((c) => ({ ...c, x: d.camX + dx, y: d.camY + dy }));
      return;
    }
    if (d.kind === "items") {
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      if (!d.moved) return;
      d.dx = snap(dx / cam.scale);
      d.dy = snap(dy / cam.scale);
      setItemDrag((cur) => (cur ? { ...cur, dx: d.dx, dy: d.dy } : cur));
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
    // くっつき先を探すのは「1つだけ動かしていて、複製でもない」ときだけ。
    // まとめて動かしているときに1つだけ吸い付くと、位置関係が崩れる。
    if (d.movers.length === 1 && !d.duplicate) {
      const width = placed.get(d.id)?.width ?? 240;
      const hh = faceH(d.id);
      const centre = { x: d.lastX + width / 2, y: d.lastY + Math.min(hh, BLOCK_H) / 2 };
      // メモは塔に積まない・積ませない(タスクの塔に吸い込まれると、塔と一緒に勝手に動いてしまう)
      const isNote = (id: string) => blocks.find((b) => b.id === id)?.kind === "note";
      let found = findDrop(centre, placed, world.nodes, d.id, { x: d.lastX, y: d.lastY });
      if (found.kind !== "free" && (isNote(d.id) || isNote(found.targetId))) {
        found = { kind: "free", x: d.lastX, y: d.lastY };
      }
      if (found.kind === "free") {
        // 紙に置くときは、ほかの積み木の端・中心にそろえる(ガイド線が出る)
        const others: Box[] = [];
        for (const n of world.nodes) {
          if (n.id === d.id || heldTower.has(n.id)) continue;
          const bb = placed.get(n.id);
          if (bb) others.push({ x: bb.x, y: bb.y, w: bb.width, h: faceH(n.id) });
        }
        const al = alignBox({ x: d.lastX, y: d.lastY, w: width, h: hh }, others, 8 / cam.scale);
        d.lastX = al.x;
        d.lastY = al.y;
        setGuides(al.guides);
        setDrop({ kind: "free", x: al.x, y: al.y });
      } else {
        setGuides([]);
        setDrop(found);
      }
    } else {
      setGuides([]);
      setDrop({ kind: "free", x: d.lastX, y: d.lastY });
    }
    setHeldPos({ x: d.lastX, y: d.lastY });
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
    setGuides([]);

    if (d?.kind === "draw") {
      setDrawDraft(null);
      const now = new Date().toISOString();
      const base = { id: clientId("bi"), period_id: period.id, color: null, created_by: currentMemberId || null, updated_at: now, w: 0, h: 0, title: null };
      if (d.tool === "section") {
        const r = rectFromPoints(d.from, pointerRef.current);
        if (r.w < 30 || r.h < 30) return; // 押しただけ
        const sec: BoardItem = { ...base, type: "section", x: snap(r.x), y: snap(r.y), w: snap(r.w), h: snap(r.h), points: [], title: "セクション" };
        addItem(sec, "セクションで囲った");
        setSelectedItems(new Set([sec.id]));
        setEditingSection(sec.id); // すぐ名前を付けられるように
        setTool("select");
        return;
      }
      const pts = d.tool === "pen" ? simplify(d.points) : d.points;
      const bb = boundsOf(0, 0, pts);
      if (bb.w < 4 && bb.h < 4) return; // 押しただけ
      addItem({ ...base, type: d.tool, x: d.from.x, y: d.from.y, points: pts }, d.tool === "line" ? "直線を引いた" : "ペンで描いた");
      if (d.tool === "line") setTool("select"); // ペンは続けて描けるよう、そのまま
      return;
    }

    if (d?.kind === "resize") {
      setResizing(null);
      const cur = items.find((i) => i.id === d.id);
      if (!cur || (cur.w === d.nw && cur.h === d.nh)) return;
      const before = { id: d.id, w: cur.w, h: cur.h };
      const after = { id: d.id, w: d.nw, h: d.nh };
      patchItems([after]);
      record({ label: "セクションの大きさを変えた", undo: () => patchItems([before]), redo: () => patchItems([after]) });
      return;
    }

    if (d?.kind === "items") {
      setItemDrag(null);
      if (!d.moved || (d.dx === 0 && d.dy === 0)) return;
      const moveBy = (sx: number) => {
        const patches = d.ids
          .map((id) => items.find((i) => i.id === id))
          .filter(Boolean)
          .map((i) => ({ id: i!.id, x: i!.x + d.dx * sx, y: i!.y + d.dy * sx }));
        patchItems(patches);
        if (d.blocks.length) {
          commit(
            d.blocks.map((id) => {
              const g = world.ground[id];
              return { id, parentId: null, sortOrder: 0, x: snap((g?.x ?? 0) + d.dx * sx), y: snap((g?.y ?? 0) + d.dy * sx) };
            }),
          );
        }
      };
      // undo は「元の位置へ」なので、いまの位置を覚えておいて戻す
      const beforeItems = d.ids.map((id) => items.find((i) => i.id === id)).filter(Boolean).map((i) => ({ id: i!.id, x: i!.x, y: i!.y }));
      const beforeBlocks = snapshotOf(d.blocks);
      const afterItems = beforeItems.map((b) => ({ ...b, x: b.x + d.dx, y: b.y + d.dy }));
      const afterBlocks: Move[] = beforeBlocks.map((m) => ({ ...m, x: snap((m.x ?? 0) + d.dx), y: snap((m.y ?? 0) + d.dy) }));
      moveBy(1);
      record({
        label: d.blocks.length ? "セクションごと動かした" : "形を動かした",
        undo: () => {
          patchItems(beforeItems);
          if (beforeBlocks.length) commit(beforeBlocks);
        },
        redo: () => {
          patchItems(afterItems);
          if (afterBlocks.length) commit(afterBlocks);
        },
      });
      return;
    }

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
          setOverlay((prev) => rekey(prev, swap));
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

  const createBlock = (title: string, at: { x: number; y: number }, kind: "task" | "note" = "task") => {
    // redo で作り直すと新しいIDになるので、いまのIDを覚えておいて差し替える
    let id: string | null = null;
    const make = async () => {
      // サーバーの返事を待つ前に、仮のIDで画面へ出しておく。
      // 本物のIDが返ったら差し替え、props に本物が届いたら引っこめる。
      const tempId = `tmp_${Math.random().toString(36).slice(2, 10)}`;
      setGhosts((g) => [...g, newGhost(tempId, title, at, currentMemberId, members, kind)]);
      try {
        id = await createBlockAction({
          period_id: period.id,
          title,
          x: at.x,
          y: at.y,
          owner_id: kind === "note" ? undefined : currentMemberId || undefined,
          kind,
        });
        const realId = id;
        // 仮のIDを本物に差し替える。
        // 置いた直後に動かした場合、その移動も仮のIDを指しているので一緒に付け替える
        // (でないと、本物が届いた瞬間に元の位置へ戻って見える)。
        setGhosts((g) => g.map((x) => (x.id === tempId ? { ...x, id: realId } : x)));
        setOverlay((prev) => rekey(prev, new Map([[tempId, realId]])));
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
        label: kind === "note" ? `メモ「${title}」を置いた` : `「${title}」を置いた`,
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

  /**
   * 矢印の持ち手を掴んだ。画面全体に線を描きながら追いかけ、離した所にある積み木へつなぐ。
   * 離した所は document.elementFromPoint で探すので、分割画面の隣の盤の積み木にもつなげる。
   */
  const onLinkHandleDown = (fromId: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActivePane(paneId);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const r = (e.currentTarget as Element).getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    setLinkDrag({ fromId, from, to: { x: e.clientX, y: e.clientY } });
  };
  /** 矢印を引いている最中に、離したらつながる積み木(枠をまたいでも探せるよう画面の座標で) */
  const linkTargetAt = (x: number, y: number, fromId: string) =>
    document
      .elementsFromPoint(x, y)
      .map((el) => el.closest<HTMLElement>("[data-block]"))
      .find((el) => el && el.getAttribute("data-block") !== fromId) ?? null;
  /** 光らせている積み木。DOM に目印を付けるだけ(別の枠の積み木も光らせられるように) */
  const litRef = useRef<HTMLElement | null>(null);
  const light = (el: HTMLElement | null) => {
    if (litRef.current === el) return;
    litRef.current?.removeAttribute("data-link-target");
    el?.setAttribute("data-link-target", "");
    litRef.current = el;
  };
  const onLinkHandleMove = (e: React.PointerEvent) => {
    if (!linkDrag) return;
    setLinkDrag({ ...linkDrag, to: { x: e.clientX, y: e.clientY } });
    light(linkTargetAt(e.clientX, e.clientY, linkDrag.fromId));
  };
  const onLinkHandleUp = (e: React.PointerEvent) => {
    const drag = linkDrag;
    setLinkDrag(null);
    light(null);
    if (!drag) return;
    const target = linkTargetAt(e.clientX, e.clientY, drag.fromId)?.getAttribute("data-block");
    if (target) addLink(drag.fromId, target);
  };

  /** 置いてあるもの全部が画面に収まるように寄る(「全体」ボタン) */
  const fitAll = () => {
    const boxes: Box[] = [];
    for (const b of blocks) {
      const bb = blockBox(b.id);
      if (bb) boxes.push(bb);
    }
    for (const i of items) boxes.push(i.type === "section" ? { x: i.x, y: i.y, w: i.w, h: i.h } : boundsOf(i.x, i.y, i.points));
    const all = unionBox(boxes);
    const el = surfaceRef.current;
    if (!all || !el) return setCam(HOME);
    const r = el.getBoundingClientRect();
    const pad = 120;
    const scale = clampScale(Math.min((r.width - pad * 2) / Math.max(all.w, 1), (r.height - pad * 2 - 80) / Math.max(all.h, 1), 1.2));
    setCam({ scale, x: (r.width - all.w * scale) / 2 - all.x * scale, y: (r.height - all.h * scale) / 2 - all.y * scale + 40 });
  };
  // キー操作(⇧1)からは、いつも最新の fitAll を呼ぶ
  const fitRef = useRef(fitAll);
  useEffect(() => {
    fitRef.current = fitAll;
  });

  useEffect(() => {
    const typing = () => {
      const el = document.activeElement;
      return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing()) return;
      // スペース(押しながらドラッグでパン)は、どの盤も受けてよい。実際に動くのはドラッグした盤だけ
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (!isActivePane(pane?.id)) return; // 分割画面では、最後に触った盤だけが反応する
      if (e.key === "Escape") {
        setSelected(new Set());
        setSelectedItems(new Set());
        setSelectedLink(null);
        setTool("select");
      }
      // 道具の切り替え(Figma と同じ1文字。メモはコメントの C)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        const pick = ({ v: "select", c: "note", l: "line", p: "pen", s: "section" } as Record<string, Tool>)[k];
        if (pick) setTool(pick);
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (selectedLink) removeLink(selectedLink);
        if (selectedItems.size) {
          removeItems([...selectedItems]);
          setSelectedItems(new Set());
        }
        deleteSelected();
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
        setSelectedItems(new Set(items.map((i) => i.id)));
      }
      // ⇧1 = 全体を見る(Figma と同じ)
      if (e.shiftKey && e.code === "Digit1") {
        e.preventDefault();
        fitRef.current();
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
  }, [copySelected, pasteClipboard, deleteSelected, blocks, items, selectedItems, selectedLink, removeItems, removeLink, pane?.id]);

  // 分割画面を開いた直後は、左の盤がキーを受ける(どこも押していないうちに Backspace 等が効かないと戸惑う)
  useEffect(() => {
    if (pane?.index === 0) setActivePane(pane.id);
  }, [pane?.index, pane?.id]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PeriodPill period={period} siblings={siblings} pane={pane} />

      <div
        ref={surfaceRef}
        className={cn("board-surface inset-0 overflow-hidden bg-paper", pane ? "absolute" : "fixed")}
        data-panning={panning}
        data-space={spaceHeld}
        // 盤の外に出てもカーソルは消さない。「最後にどこを見ていたか」は残っていたほうが役に立つし、
        // 消すと「タブを切り替えるためにマウスをタブバーへ持っていく」だけで相手から見えなくなる。
        data-testid="whiteboard"
        // 水玉は紙の模様。カメラと同じだけずらし、同じだけ伸び縮みさせる。
        style={{
          backgroundImage:
            "radial-gradient(circle at center, var(--color-paper-dot) 1.2px, transparent 0)",
          backgroundSize: `${DOT_GAP * cam.scale * dotStep}px ${DOT_GAP * cam.scale * dotStep}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
        }}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const p = toPaper(e.clientX, e.clientY);
          setDraftKind("task");
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

          {/* セクション(囲い)。いちばん奥 */}
          <SectionsLayer
            items={shownItems}
            selected={selectedItems}
            shiftOf={itemShift}
            scale={cam.scale}
            editingId={editingSection}
            onPointerDown={onItemPointerDown}
            onEditTitle={setEditingSection}
            onTitle={(id, title) => {
              const before = items.find((i) => i.id === id)?.title ?? null;
              patchItems([{ id, title: title || "セクション" }]);
              record({ label: "セクションの名前を変えた", undo: () => patchItems([{ id, title: before }]), redo: () => patchItems([{ id, title: title || "セクション" }]) });
            }}
          />

          {/* 依存の矢印。積み木より奥(端から端へ引くので、積み木の上を横切らない) */}
          <LinksLayer
            links={links}
            rectOf={blockBox}
            outside={outside}
            visiblePeriods={new Set(pane?.periods ?? [])}
            doneOf={(id) => blocks.find((b) => b.id === id)?.status === "achieved" || Boolean(outside[id]?.done)}
            selectedLink={selectedLink}
            scale={cam.scale}
            onSelect={(id) => {
              setActivePane(paneId);
              setSelectedLink(id);
              setSelected(new Set());
              setSelectedItems(new Set());
            }}
            onDelete={removeLink}
          />

          {/*
            取り組み中の薄い色。**積み木より奥**に敷く(手前だと面の色が濁る)。
            点線と名札は手前の層(下の map)で描く — 奥に置くと、
            ぴったり重なった隣の積み木に隠れて欠けるため。
          */}
          {blocks.map((b) => {
            const p = placed.get(b.id);
            if (!p || b.workers.length === 0) return null;
            const shift = blockShift(b.id);
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
            // 掴んだ積み木のズレを、上に載っている積み木にもそのまま足す(セクションごと運ぶときも)。
            // ⌥(複製)のときは元を置いたままにして、増えるほうを別に描く。
            const sh = blockShift(b.id);
            const rides = sh.x !== 0 || sh.y !== 0 || (heldTower.has(b.id) && heldPos !== null && !duplicating);
            return (
              <ToyBlock
                key={b.id}
                block={b}
                x={p.x + sh.x}
                y={p.y + sh.y}
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
          {/* 直線・ペンの線。積み木より手前 */}
          <StrokesLayer items={shownItems} selected={selectedItems} shiftOf={itemShift} interactive={tool === "select"} onPointerDown={(it, e) => onItemPointerDown(it, e)} />
          <DraftShape draft={drawDraft} />

          {/* スナップのガイド線(ピンク)。画面基準の太さ */}
          {guides.map((g, i) => (
            <div
              key={i}
              className="pointer-events-none absolute bg-[#ff3d8b]"
              style={
                g.axis === "v"
                  ? { left: g.at, top: g.from, width: 1.5 / cam.scale, height: g.to - g.from, zIndex: 340 }
                  : { left: g.from, top: g.at, width: g.to - g.from, height: 1.5 / cam.scale, zIndex: 340 }
              }
              data-testid="snap-guide"
            />
          ))}

          {blocks.map((b) => {
            const p = placed.get(b.id);
            if (!p) return null;
            const shift = blockShift(b.id);
            const x = p.x + shift.x;
            const y = p.y + shift.y;
            return (
              // 積み木とぴったり同じ大きさの透明な枠。名札の「右上」がここを基準に決まる。
              <div
                key={`mark-${b.id}`}
                className="pointer-events-none absolute"
                style={{ left: x, top: y, width: p.width, height: faceH(b.id), zIndex: 150 }}
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
                    const rr = 11 + pad;
                    /*
                     * 点線(9px 線 + 7px 隙間 = 16px 周期)は、左上の角の近くから一周して描かれる。
                     * 一周の長さが 16 の倍数でないと、戻ってきた所(左上)で半端な線と隙間がくっついて
                     * 切れ目ができる。そこで「一周 = 16 × 整数」とみなすよう pathLength を指定し、
                     * 点線の目盛りを枠ごとにわずかに伸び縮みさせて、継ぎ目なく一周させる。
                     */
                    const perimeter = 2 * (rw - 3 + rh - 3) - 8 * rr + 2 * Math.PI * rr;
                    const ring = {
                      x: 1.5,
                      y: 1.5,
                      width: rw - 3,
                      height: rh - 3,
                      rx: rr,
                      fill: "none",
                      stroke: color,
                      strokeWidth: 2.5,
                      pathLength: Math.max(1, Math.round(perimeter / 16)) * 16,
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
                      height: faceH(b.id) + BLOCK_DEPTH + 6,
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
                ...screenSized,
                "--depth-x": "0px",
                "--depth-y": "2px",
                "--depth-color": "#4a2fc4",
              } as React.CSSProperties}
              data-testid="duplicate-badge"
            >
              +
            </div>
          )}

          {/* 矢印の持ち手。積み木の右端の丸をドラッグして、別の積み木へ離すとつながる */}
          {(() => {
            if (tool !== "select" || dragId || itemDrag) return null;
            const id = linkDrag?.fromId ?? hovered ?? (selected.size === 1 ? [...selected][0] : null);
            const bb = id ? blockBox(id) : null;
            if (!id || !bb) return null;
            return (
              <div
                className="absolute grid size-5 cursor-crosshair place-items-center rounded-full border-2 border-[var(--color-toy-purple)] bg-white shadow-sm hover:scale-110"
                style={{ left: bb.x + bb.w, top: bb.y + bb.h / 2, transform: `translate(-50%,-50%) scale(${1 / cam.scale})`, zIndex: 320 }}
                onPointerDown={onLinkHandleDown(id)}
                onPointerMove={onLinkHandleMove}
                onPointerUp={onLinkHandleUp}
                onPointerEnter={() => setHovered(id)}
                title="ドラッグして別の積み木につなぐ(依存の矢印)"
                data-testid="link-handle"
              >
                <span className="size-1.5 rounded-full bg-[var(--color-toy-purple)]" />
              </div>
            );
          })()}

          {linkDrag && <LinkDragLine from={linkDrag.from} to={linkDrag.to} />}

          {/* 相手のカーソル。紙の中に置くので、拡大しても位置がずれない */}
          {realtime && <RealtimeCursors scale={cam.scale} />}

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
            if (marquee || dragId || itemDrag || selected.size > 0 || selectedItems.size === 0) return null;
            const chosen = shownItems.filter((i) => selectedItems.has(i.id));
            if (chosen.length === 0) return null;
            const all = unionBox(chosen.map((i) => (i.type === "section" ? { x: i.x, y: i.y, w: i.w, h: i.h } : boundsOf(i.x, i.y, i.points))))!;
            const strokes = chosen.filter((i) => i.type !== "section");
            return (
              <div className="absolute" style={{ left: all.x + all.w + 14, top: all.y - 4, zIndex: 300, ...screenSized }}>
                <div
                  className="brick flex items-center gap-1 rounded-[13px] border-2 border-[rgba(20,22,28,0.12)] bg-white p-1"
                  style={{ "--depth-x": "0px", "--depth-y": "4px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid="item-toolbar"
                >
                  {strokes.length > 0 &&
                    ITEM_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="size-6 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(20,22,28,0.15)]"
                        style={{ background: c }}
                        onClick={() => {
                          const before = strokes.map((i) => ({ id: i.id, color: i.color }));
                          const after = strokes.map((i) => ({ id: i.id, color: c }));
                          patchItems(after);
                          record({ label: "線の色を変えた", undo: () => patchItems(before), redo: () => patchItems(after) });
                        }}
                        aria-label="線の色"
                      />
                    ))}
                  {strokes.length > 0 && <span className="mx-0.5 h-5 w-px bg-border" />}
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-[9px] hover:bg-secondary hover:text-destructive"
                    onClick={() => {
                      removeItems(chosen.map((i) => i.id));
                      setSelectedItems(new Set());
                    }}
                    aria-label="消す"
                    title="消す(Backspace)"
                    data-testid="item-delete"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })()}

          {(() => {
            if (marquee || dragId || selected.size === 0) return null;
            const chosen = blocks.filter((b) => selected.has(b.id) && placed.has(b.id));
            if (chosen.length === 0) return null;
            if (chosen.length === 1 && chosen[0].kind === "note") {
              const b = chosen[0];
              const p = placed.get(b.id)!;
              return (
                <div className="absolute" style={{ left: p.x + p.width + 14, top: p.y - 4, zIndex: 300, ...screenSized }}>
                  <NoteToolbar
                    block={b}
                    onDuplicate={() => duplicate([{ id: b.id, x: snap(p.x + 24), y: snap(p.y + 24) }], "メモを複製した")}
                    onHide={hide}
                    onShow={show}
                  />
                </div>
              );
            }
            if (chosen.length === 1) {
              const b = chosen[0];
              const p = placed.get(b.id)!;
              return (
                <div
                  className="absolute"
                  // 道具箱は画面基準の大きさ(拡大率の逆数で打ち消す)。位置は積み木の右のまま
                  style={{ left: p.x + p.width + 14, top: p.y - 4, zIndex: 300, ...screenSized }}
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
              <div className="absolute" style={{ left: right + 14, top: top - 4, zIndex: 300, ...screenSized }}>
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

          {draft && draftKind === "note" && (
            <div className="absolute" style={{ left: draft.x, top: draft.y, zIndex: 70 }}>
              <div
                className="flex items-center rounded-[13px] border-[2.5px] border-dashed border-[rgba(20,22,28,0.35)] bg-[rgba(255,255,255,0.55)] px-2.5 py-2"
                style={{ minHeight: BLOCK_H }}
              >
                <NoteTextarea
                  value=""
                  fontSize={NOTE_FONT_DEFAULT}
                  placeholder="メモ(Shift+Enter で改行)"
                  onCancel={() => setDraft(null)}
                  onDone={(v) => {
                    setDraft(null);
                    if (v) createBlock(v, draft, "note");
                  }}
                />
              </div>
            </div>
          )}

          {draft && draftKind === "task" && (
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

        {tool !== "select" && (
          <div
            className="absolute inset-0"
            style={{ cursor: "crosshair", zIndex: 30 }}
            onPointerDown={startDrawing}
            data-testid="draw-surface"
          />
        )}

        <ToolPalette tool={tool} onTool={(t) => { setActivePane(paneId); setTool(t); }} />

        {blocks.length === 0 && items.length === 0 && !draft && (
          <p className="pointer-events-none absolute inset-x-0 top-[46%] text-center text-[14px] font-bold text-muted-foreground">
            なにもない所をダブルクリックすると、積み木を置けます
          </p>
        )}

        {/*
          リアルタイムを繋ぐと、Liveblocks の無料プランの印が右下に出る。
          そのままだと拡大縮小のボタンに重なって押せなくなるので、上に逃がす。
        */}
        {/* 画面の角に貼るもの。紙の変形の外に置かないと、角に固定できない */}
        {realtime && <RealtimeBridge pending={writing} onReady={attachCursor} showPresence={!pane || pane.index === 0} />}

        <div
          className={cn(
            "absolute right-6 flex select-none items-center gap-1.5",
            realtime ? "bottom-[68px]" : "bottom-6",
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HistoryDock />
          <span className="w-2" />
          <ZoomDock
            onZoom={(d) => {
              // 画面のまん中を中心に拡大縮小する(左上に吸い寄せられないように)
              const r = surfaceRef.current?.getBoundingClientRect();
              const cx = r ? r.width / 2 : 0;
              const cy = r ? r.height / 2 : 0;
              setCam((c) => {
                const scale = clampScale(c.scale * (d > 0 ? 1.2 : 1 / 1.2));
                const k = scale / c.scale;
                return { scale, x: cx - (cx - c.x) * k, y: cy - (cy - c.y) * k };
              });
            }}
            onHome={() => setCam(HOME)}
            onFit={fitAll}
            scale={cam.scale}
            onSplit={onSplit}
          />
        </div>
      </div>
    </>
  );
}

function ZoomDock({
  onZoom,
  onHome,
  onFit,
  scale,
  onSplit,
}: {
  onZoom: (delta: number) => void;
  onHome: () => void;
  onFit: () => void;
  scale: number;
  onSplit?: () => void;
}) {
  const btn =
    "brick brick-press grid size-8 place-items-center rounded-[9px] bg-white text-[15px] font-bold leading-none";
  const style = {
    "--depth-x": "0px",
    "--depth-y": "3px",
    "--depth-color": "rgba(20,22,28,0.18)",
  } as React.CSSProperties;
  return (
    <>
      {onSplit && (
        <button
          type="button"
          className="brick brick-press grid h-8 place-items-center rounded-[9px] bg-white px-2.5 text-[11px] font-bold"
          style={style}
          onClick={onSplit}
          title="となりの期間を右に並べる(分割画面)"
          data-testid="split-open"
        >
          分割
        </button>
      )}
      <button
        type="button"
        className="brick brick-press grid h-8 place-items-center rounded-[9px] bg-white px-2.5 text-[11px] font-bold"
        style={style}
        onClick={onFit}
        title="置いてあるもの全部が収まるように寄る(⇧1)"
        data-testid="zoom-fit"
      >
        全体
      </button>
      <span className="num w-10 text-center text-[11px] font-bold text-muted-foreground" data-testid="zoom-level">
        {Math.round(scale * 100)}%
      </span>
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
