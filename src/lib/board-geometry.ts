/**
 * 盤の「形」まわりの純関数(画面に依存しないので単体テストできる)。
 *   ・スナップ(縦横の端・中心をほかの積み木にそろえる)
 *   ・ペンの点を間引く
 *   ・セクションの中に入っているかの判定
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ガイド線。v = 縦線(x がそろった) / h = 横線(y がそろった)。from〜to はガイドを引く範囲 */
export interface Guide {
  axis: "v" | "h";
  at: number;
  from: number;
  to: number;
}

/**
 * 動かしている箱を、ほかの箱の端・中心にそろえる。
 * そろえる候補: 左端 / 中心 / 右端(縦線)、上端 / 中心 / 下端(横線)。
 * threshold 以内でいちばん近いものに吸い付く。x と y は別々に決める。
 */
export function alignBox(moving: Box, others: Box[], threshold: number): { x: number; y: number; guides: Guide[] } {
  const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
  const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];

  let bestX: { d: number; shift: number; at: number } | null = null;
  let bestY: { d: number; shift: number; at: number } | null = null;
  for (const o of others) {
    for (const mine of xs(moving).map((v, i) => ({ v, i }))) {
      for (const theirs of xs(o)) {
        const d = Math.abs(theirs - mine.v);
        if (d <= threshold && (!bestX || d < bestX.d)) bestX = { d, shift: theirs - mine.v, at: theirs };
      }
    }
    for (const mine of ys(moving)) {
      for (const theirs of ys(o)) {
        const d = Math.abs(theirs - mine);
        if (d <= threshold && (!bestY || d < bestY.d)) bestY = { d, shift: theirs - mine, at: theirs };
      }
    }
  }

  const x = moving.x + (bestX?.shift ?? 0);
  const y = moving.y + (bestY?.shift ?? 0);
  const placed = { ...moving, x, y };
  const guides: Guide[] = [];
  // ガイドは「そろった相手」から自分まで伸ばす
  if (bestX) {
    const hits = others.filter((o) => xs(o).some((v) => Math.abs(v - bestX!.at) < 0.5));
    const ysAll = [placed.y, placed.y + placed.h, ...hits.flatMap((o) => [o.y, o.y + o.h])];
    guides.push({ axis: "v", at: bestX.at, from: Math.min(...ysAll) - 8, to: Math.max(...ysAll) + 8 });
  }
  if (bestY) {
    const hits = others.filter((o) => ys(o).some((v) => Math.abs(v - bestY!.at) < 0.5));
    const xsAll = [placed.x, placed.x + placed.w, ...hits.flatMap((o) => [o.x, o.x + o.w])];
    guides.push({ axis: "h", at: bestY.at, from: Math.min(...xsAll) - 8, to: Math.max(...xsAll) + 8 });
  }
  return { x, y, guides };
}

/** 線分と点の距離(間引きに使う) */
function distToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * ペンの点を間引く(Ramer–Douglas–Peucker)。
 * 手で描いた線は点が多すぎるので、形が tolerance 以上変わらない範囲で減らす。
 */
export function simplify(points: [number, number][], tolerance = 1.2): [number, number][] {
  if (points.length <= 2) return points;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, idx + 1), tolerance);
  const right = simplify(points.slice(idx), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** 点列を囲む箱(線・ペンの当たり判定やセクション判定に使う) */
export function boundsOf(x: number, y: number, points: [number, number][]): Box {
  if (points.length === 0) return { x, y, w: 0, h: 0 };
  const xs = points.map((p) => x + p[0]);
  const ys = points.map((p) => y + p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** 箱の中心がセクションの中にあれば「入っている」とみなす(半分はみ出しても入れる) */
export function centerInside(inner: Box, outer: Box): boolean {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

/** 全部を囲む箱(「全体を見る」に使う)。空なら null */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bot = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bot - y };
}

/**
 * to から矢印をたどって from に戻ってこられるか。
 * 戻ってこられるなら、from → to を足すと輪(A が B を待ち、B が A を待つ)になる。
 */
export function wouldCycle(links: { from_id: string; to_id: string }[], fromId: string, toId: string): boolean {
  const next = new Map<string, string[]>();
  for (const l of links) next.set(l.from_id, [...(next.get(l.from_id) ?? []), l.to_id]);
  const seen = new Set<string>();
  const stack = [toId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}
