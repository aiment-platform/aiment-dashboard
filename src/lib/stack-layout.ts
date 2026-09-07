import { BLOCK_H, HANDLE_W } from "./whiteboard";

/**
 * 積み木を「積む」ための計算。Scratchのブロックと同じ考え方。
 *
 * 形はレンガ積み:
 *
 *      [ A ][ B ]       ← 同じ段。ふたつとも C の上に載っている
 *      [   C    ]       ← C は上の段の土台になるので、その幅まで伸びる
 *
 * 長さの決まりは2つだけ:
 *   ・**基本は名前の長さ**。短いタスクは短い積み木になる
 *   ・**上の段を支えきれないときだけ、土台として伸びる**
 * そろえ方は**つねに左**。中央ぞろえにすると、上に行くほど小さく見えてしまう。
 *
 * データとしては木構造 — 各積み木が「自分の下にある土台」(parentId)を1つ持つだけ。
 * 子の座標は保存しない。**土台の座標と親子関係から毎回計算する**ので、
 * 土台を動かせば塔ごと動くし、幅の辻褄が合わなくなることもない。
 *
 * ここは DOM も React も知らない純粋な計算だけ(src/lib/stack-layout.test.ts)。
 */

/** 同じ段の積み木どうしの隙間。0 = ぴったりくっつく。 */
export const STACK_GAP_X = 0;
/** 段と段の隙間。0 = ぴったり重なる。 */
export const STACK_GAP_Y = 0;
/** この距離まで近づいたらくっつく */
export const SNAP_RANGE = 30;

export interface StackNode {
  id: string;
  /** 下にある土台。null なら地面に直置き(=座標を自分で持つ) */
  parentId: string | null;
  /** 同じ段での並び順 */
  sortOrder: number;
  /** 中身から決まる、その積み木ひとつぶんの幅 */
  intrinsicWidth: number;
  /** 展開したサブタスクを含めた、その積み木ひとつぶんの高さ */
  height: number;
}

export interface Placed {
  id: string;
  x: number;
  y: number;
  /** 名前の長さで決まる幅 */
  width: number;
  height: number;
  /** 地面から何段目か(0 = 地面)。描画順もこれで決める — 上の段ほど手前。 */
  depth: number;
}

export interface Point {
  x: number;
  y: number;
}

/** 地面に直置きされた積み木の座標 */
export type Ground = Record<string, Point>;

function byOrder(a: StackNode, b: StackNode): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id < b.id ? -1 : 1;
}

export function childrenOf(nodes: StackNode[], parentId: string | null): StackNode[] {
  return nodes.filter((n) => n.parentId === parentId).sort(byOrder);
}

/** 上の段の合計幅(すき間こみ)。子が無ければ 0。 */
export function rowWidth(
  nodes: StackNode[],
  id: string,
  memo: Map<string, number> = new Map(),
): number {
  const kids = childrenOf(nodes, id);
  if (kids.length === 0) return 0;
  return (
    kids.reduce((s, k) => s + subtreeWidth(nodes, k.id, memo), 0) + STACK_GAP_X * (kids.length - 1)
  );
}

/**
 * その積み木が実際に占める幅 = 自分の名前ぶんの幅と、支えている段の幅の大きいほう。
 * 上に何個も載っていれば、下の積み木はその土台になるまで伸びる。
 */
export function subtreeWidth(
  nodes: StackNode[],
  id: string,
  memo: Map<string, number> = new Map(),
): number {
  const hit = memo.get(id);
  if (hit !== undefined) return hit;
  const node = nodes.find((n) => n.id === id);
  if (!node) return 0;
  memo.set(id, node.intrinsicWidth); // 輪になっていても止まるよう、先に置いておく
  const w = Math.max(node.intrinsicWidth, rowWidth(nodes, id, memo));
  memo.set(id, w);
  return w;
}

/** ある積み木が別の積み木の上に乗っているか(自分自身も true)。輪を作らせないために使う。 */
export function isDescendant(nodes: StackNode[], ancestorId: string, nodeId: string): boolean {
  let cur: string | null = nodeId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = nodes.find((n) => n.id === cur)?.parentId ?? null;
  }
  return false;
}

/** 地面の積み木ぜんぶを起点に、塔をまるごと配置する。 */
export function layoutAll(nodes: StackNode[], ground: Ground): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const memo = new Map<string, number>();

  const place = (id: string, left: number, top: number, depth: number) => {
    const node = nodes.find((n) => n.id === id);
    if (!node || out.has(id)) return;
    // 名前ぶんの幅。上の段を支えきれないときだけ、土台として伸びる。
    const width = subtreeWidth(nodes, id, memo);
    out.set(id, { id, x: left, y: top, width, height: node.height, depth });

    const kids = childrenOf(nodes, id);
    if (kids.length === 0) return;
    const rowBottom = top - STACK_GAP_Y;
    let cx = left; // つねに左ぞろえ
    for (const k of kids) {
      // 下ぞろえ: サブタスクを開いている子は上へ伸びる(土台に重ならない)
      place(k.id, cx, rowBottom - k.height, depth + 1);
      cx += subtreeWidth(nodes, k.id, memo) + STACK_GAP_X;
    }
  };

  for (const n of nodes) {
    if (n.parentId === null) {
      const g = ground[n.id] ?? { x: 0, y: 0 };
      place(n.id, g.x, g.y, 0);
    }
  }
  // 親が消えている等の迷子も、置き去りにせず地面に出す
  for (const n of nodes) {
    if (!out.has(n.id)) place(n.id, ground[n.id]?.x ?? 0, ground[n.id]?.y ?? 0, 0);
  }
  return out;
}

// ---- どこに落とすか ---------------------------------------------------------

export type Drop =
  | { kind: "free"; x: number; y: number }
  | { kind: "onTop"; targetId: string }
  | { kind: "under"; targetId: string }
  | { kind: "beside"; targetId: string; before: boolean };

function rectDistance(p: Point, r: Placed): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + BLOCK_H));
  return Math.hypot(dx, dy);
}

/** 左右この割合ぶんは「横に割り込む」ゾーン。真ん中4割が上下の判定。 */
const SIDE_ZONE = 0.3;

/**
 * 掴んでいる積み木の「頭の中心」がどこに近いかで、くっつき方を決める。
 *   真ん中の上寄り → その積み木の上に載せる
 *   真ん中の下寄り → その積み木の下に潜って土台になる
 *   左右3割      → 横に割り込む(同じ段に並ぶ) ※相手に土台がある時だけ
 *
 * 横の割り込みは「何番目に入るか」まで決まるので、
 * 3つ以上の横並びも、並んでいるブロックの間への割り込みもこれで足りる。
 */
export function findDrop(
  point: Point,
  placed: Map<string, Placed>,
  nodes: StackNode[],
  draggingId: string,
  fallback: Point,
): Drop {
  let best: { drop: Drop; dist: number } | null = null;

  for (const r of placed.values()) {
    if (r.id === draggingId) continue;
    // 自分の上に乗っているものにはくっつけない(輪になる)
    if (isDescendant(nodes, draggingId, r.id)) continue;
    const dist = rectDistance(point, r);
    if (dist > SNAP_RANGE) continue;

    const node = nodes.find((n) => n.id === r.id);
    if (!node) continue;
    const rx = (point.x - r.x) / r.width;
    const ry = (point.y - r.y) / BLOCK_H;

    let drop: Drop;
    if (node.parentId !== null && (rx < SIDE_ZONE || rx > 1 - SIDE_ZONE)) {
      drop = { kind: "beside", targetId: r.id, before: rx < 0.5 };
    } else if (ry < 0.5) {
      drop = { kind: "onTop", targetId: r.id };
    } else {
      drop = { kind: "under", targetId: r.id };
    }
    if (!best || dist < best.dist) best = { drop, dist };
  }

  return best?.drop ?? { kind: "free", x: fallback.x, y: fallback.y };
}

// ---- くっつけた結果 ---------------------------------------------------------

export interface Move {
  id: string;
  parentId: string | null;
  sortOrder: number;
  /** 地面に置かれる時だけ座標を持つ */
  x: number | null;
  y: number | null;
}

/** 兄弟の並びを 0,1,2… に振り直す(順番の抜けや重複を残さない)。 */
function renumber(order: string[], parentId: string | null, ground: Ground): Move[] {
  return order.map((id, i) => ({
    id,
    parentId,
    sortOrder: i,
    x: parentId === null ? (ground[id]?.x ?? 0) : null,
    y: parentId === null ? (ground[id]?.y ?? 0) : null,
  }));
}

/**
 * 落とし方から、実際に書き換える行を出す。
 * 動かす積み木そのものだけでなく、並び直る兄弟や、
 * 「下に潜られて子になった相手」も一緒に返す。
 */
export function planDrop(
  nodes: StackNode[],
  ground: Ground,
  drop: Drop,
  draggingId: string,
): Move[] {
  const dragged = nodes.find((n) => n.id === draggingId);
  if (!dragged) return [];

  if (drop.kind === "free") {
    const oldSiblings = childrenOf(nodes, dragged.parentId)
      .filter((n) => n.id !== draggingId)
      .map((n) => n.id);
    return [
      { id: draggingId, parentId: null, sortOrder: 0, x: drop.x, y: drop.y },
      ...(dragged.parentId !== null ? renumber(oldSiblings, dragged.parentId, ground) : []),
    ];
  }

  if (drop.kind === "onTop") {
    const order = childrenOf(nodes, drop.targetId)
      .map((n) => n.id)
      .filter((id) => id !== draggingId);
    order.push(draggingId);
    return dedupe([
      ...renumber(order, drop.targetId, ground),
      ...detachFromOld(nodes, ground, dragged, drop.targetId),
    ]);
  }

  if (drop.kind === "beside") {
    const target = nodes.find((n) => n.id === drop.targetId);
    if (!target || target.parentId === null) return [];
    const order = childrenOf(nodes, target.parentId)
      .map((n) => n.id)
      .filter((id) => id !== draggingId);
    const at = order.indexOf(drop.targetId);
    order.splice(drop.before ? at : at + 1, 0, draggingId);
    return dedupe([
      ...renumber(order, target.parentId, ground),
      ...detachFromOld(nodes, ground, dragged, target.parentId),
    ]);
  }

  // under: 相手の居場所を奪い、相手を自分の上に載せる
  const target = nodes.find((n) => n.id === drop.targetId);
  if (!target) return [];
  const moves: Move[] = [];

  if (target.parentId === null) {
    // 相手は地面 → 自分がその場所を継ぐ
    const g = ground[target.id] ?? { x: 0, y: 0 };
    moves.push({ id: draggingId, parentId: null, sortOrder: 0, x: g.x, y: g.y });
  } else {
    const order = childrenOf(nodes, target.parentId)
      .map((n) => n.id)
      .filter((id) => id !== draggingId);
    const at = order.indexOf(target.id);
    order.splice(at, 1, draggingId);
    moves.push(...renumber(order, target.parentId, ground));
  }
  // 自分がもともと支えていた段はそのまま + 相手が末尾に乗る
  const kids = childrenOf(nodes, draggingId).map((n) => n.id);
  kids.push(target.id);
  moves.push(...renumber(kids, draggingId, ground));
  moves.push(...detachFromOld(nodes, ground, dragged, dragged.parentId));
  return dedupe(moves);
}

/** 動かした積み木が抜けた穴を、元の段で詰め直す */
function detachFromOld(
  nodes: StackNode[],
  ground: Ground,
  dragged: StackNode,
  newParentId: string | null,
): Move[] {
  if (dragged.parentId === null || dragged.parentId === newParentId) return [];
  const rest = childrenOf(nodes, dragged.parentId)
    .filter((n) => n.id !== dragged.id)
    .map((n) => n.id);
  return renumber(rest, dragged.parentId, ground);
}

/** 同じIDが二度出たら、あとから決まったほう(先頭側)を優先する */
function dedupe(moves: Move[]): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const m of moves) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** プレビュー用: 移動を当てはめた「もしもの木」を作る */
export function applyMoves(
  nodes: StackNode[],
  ground: Ground,
  moves: Move[],
): { nodes: StackNode[]; ground: Ground } {
  const byId = new Map(moves.map((m) => [m.id, m]));
  const nextGround: Ground = { ...ground };
  const next = nodes.map((n) => {
    const m = byId.get(n.id);
    if (!m) return n;
    if (m.x !== null && m.y !== null) nextGround[n.id] = { x: m.x, y: m.y };
    return { ...n, parentId: m.parentId, sortOrder: m.sortOrder };
  });
  return { nodes: next, ground: nextGround };
}

/** 積み木ひとつぶんの最小幅(持ち手を含む) */
export const MIN_BLOCK_W = HANDLE_W + 180;
