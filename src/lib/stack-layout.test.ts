import { describe, it, expect } from "vitest";
import {
  applyMoves,
  childrenOf,
  findDrop,
  isDescendant,
  layoutAll,
  blocksInRect,
  planDrop,
  rectFromPoints,
  rowWidth,
  topMostOf,
  subtreeWidth,
  STACK_GAP_X,
  STACK_GAP_Y,
  type Ground,
  type StackNode,
} from "./stack-layout";
import { BLOCK_H } from "./whiteboard";

const n = (
  id: string,
  parentId: string | null = null,
  sortOrder = 0,
  intrinsicWidth = 200,
  height = BLOCK_H,
): StackNode => ({ id, parentId, sortOrder, intrinsicWidth, height });

/**   [a][b]
 *    [c]        ← c が土台。幅はそれぞれの名前の長さで決まる。
 */
const tower: StackNode[] = [n("c"), n("a", "c", 0), n("b", "c", 1)];
const ground: Ground = { c: { x: 100, y: 500 } };

describe("幅", () => {
  it("上に何も載っていなければ、名前ぶんの幅そのまま", () => {
    expect(subtreeWidth([n("x", null, 0, 240)], "x")).toBe(240);
    expect(subtreeWidth([n("x", null, 0, 160)], "x")).toBe(160); // 短いタスクは短いまま
  });
  it("複数が載ったら、土台はその段を支えられる幅まで伸びる", () => {
    // a(200) + b(200) = 400 > c(200)
    expect(subtreeWidth(tower, "c")).toBe(200 * 2 + STACK_GAP_X);
  });
  it("自分のほうが広ければ伸びない", () => {
    const wide = [n("c", null, 0, 900), n("a", "c", 0), n("b", "c", 1)];
    expect(subtreeWidth(wide, "c")).toBe(900);
  });
  it("段が増えても下まで伝わる", () => {
    const three = [n("c"), n("a", "c", 0), n("b", "c", 1), n("z", "a", 0, 500)];
    expect(subtreeWidth(three, "a")).toBe(500); // a は z を支える
    expect(subtreeWidth(three, "c")).toBe(500 + STACK_GAP_X + 200); // c は a と b を支える
  });
  it("rowWidth は上の段の合計幅を返す", () => {
    expect(rowWidth(tower, "c")).toBe(200 * 2 + STACK_GAP_X);
  });
});

describe("layoutAll", () => {
  const placed = layoutAll(tower, ground);
  it("土台は地面の座標に置かれる", () => {
    expect(placed.get("c")).toMatchObject({ x: 100, y: 500 });
  });
  it("上の段は土台にぴったり重なる(すき間なし)", () => {
    expect(placed.get("a")!.y).toBe(500 - BLOCK_H);
    expect(placed.get("b")!.y).toBe(placed.get("a")!.y);
    expect(placed.get("b")!.x - placed.get("a")!.x).toBe(200 + STACK_GAP_X);
  });
  it("上の段は土台の左ぞろえ(中央ぞろえにしない)", () => {
    expect(placed.get("a")!.x).toBe(placed.get("c")!.x);
  });
  it("伸びた土台でも左ぞろえのまま", () => {
    const narrow = [n("c", null, 0, 240), n("a", "c", 0, 500), n("b", "c", 1, 300)];
    const p = layoutAll(narrow, ground);
    expect(p.get("c")!.width).toBe(500 + STACK_GAP_X + 300);
    expect(p.get("a")!.x).toBe(p.get("c")!.x);
  });
  it("サブタスクを開いた子は上へ伸びる(土台に重ならない)", () => {
    const tall = [n("c"), n("a", "c", 0, 200, BLOCK_H + 120)];
    const p = layoutAll(tall, ground);
    expect(p.get("a")!.y + (BLOCK_H + 120)).toBe(500 - STACK_GAP_Y);
  });
  it("3段でも左ぞろえで積み上がる", () => {
    const three = [n("c"), n("a", "c", 0), n("z", "a", 0, 500)];
    const p = layoutAll(three, ground);
    expect(p.get("a")!.x).toBe(100);
    expect(p.get("z")!.x).toBe(100);
    expect(p.get("z")!.y).toBe(500 - BLOCK_H * 2);
    expect(p.get("z")!.width).toBe(500);
  });
  it("親が消えていても迷子を地面に出す", () => {
    const orphan = [n("x", "missing")];
    expect(layoutAll(orphan, { x: { x: 5, y: 6 } }).get("x")).toMatchObject({ x: 5, y: 6 });
  });
});

describe("isDescendant", () => {
  it("上に乗っているものを見つける", () => {
    expect(isDescendant(tower, "c", "a")).toBe(true);
    expect(isDescendant(tower, "a", "c")).toBe(false);
  });
  it("自分自身も true(自分の上には置けない)", () => {
    expect(isDescendant(tower, "a", "a")).toBe(true);
  });
});

describe("findDrop", () => {
  const placed = layoutAll(tower, ground);
  const c = placed.get("c")!;
  const away = { x: 9999, y: 9999 };

  it("遠ければ自由配置", () => {
    expect(findDrop(away, placed, tower, "x", { x: 1, y: 2 })).toEqual({ kind: "free", x: 1, y: 2 });
  });
  it("土台の上半分 → その上に載せる", () => {
    const p = { x: c.x + c.width / 2, y: c.y + 5 };
    expect(findDrop(p, placed, tower, "x", away)).toEqual({ kind: "onTop", targetId: "c" });
  });
  it("土台の下半分 → 下に潜って土台になる", () => {
    const p = { x: c.x + c.width / 2, y: c.y + BLOCK_H - 5 };
    expect(findDrop(p, placed, tower, "x", away)).toEqual({ kind: "under", targetId: "c" });
  });
  it("すでに載っている積み木の横 → 割り込む", () => {
    const a = placed.get("a")!;
    const left = { x: a.x + 5, y: a.y + BLOCK_H / 2 };
    expect(findDrop(left, placed, tower, "x", away)).toEqual({
      kind: "beside",
      targetId: "a",
      before: true,
    });
    const right = { x: a.x + a.width - 5, y: a.y + BLOCK_H / 2 };
    expect(findDrop(right, placed, tower, "x", away)).toEqual({
      kind: "beside",
      targetId: "a",
      before: false,
    });
  });
  it("土台(地面置き)の横は割り込みにならない", () => {
    const p = { x: c.x + 5, y: c.y + 5 };
    expect(findDrop(p, placed, tower, "x", away).kind).toBe("onTop");
  });
  it("自分が支えている積み木にはくっつかない(輪ができる)", () => {
    const p = { x: placed.get("a")!.x + 100, y: placed.get("a")!.y + 5 };
    expect(findDrop(p, placed, tower, "c", away).kind).toBe("free");
  });
});

describe("planDrop", () => {
  const lone = [...tower, n("d", null, 0, 200)];
  const groundD: Ground = { ...ground, d: { x: 900, y: 900 } };

  it("上に載せると親が変わり、末尾に並ぶ", () => {
    const moves = planDrop(lone, groundD, { kind: "onTop", targetId: "c" }, "d");
    const d = moves.find((m) => m.id === "d")!;
    expect(d).toMatchObject({ parentId: "c", sortOrder: 2 });
  });
  it("横に割り込むと、その位置に入って全員が振り直される", () => {
    const moves = planDrop(lone, groundD, { kind: "beside", targetId: "b", before: true }, "d");
    const order = moves
      .filter((m) => m.parentId === "c")
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((m) => m.id);
    expect(order).toEqual(["a", "d", "b"]);
  });
  it("下に潜ると、相手の場所を継いで相手が上に乗る", () => {
    const moves = planDrop(lone, groundD, { kind: "under", targetId: "c" }, "d");
    const d = moves.find((m) => m.id === "d")!;
    const c = moves.find((m) => m.id === "c")!;
    expect(d).toMatchObject({ parentId: null, x: 100, y: 500 }); // c の居場所を継ぐ
    expect(c.parentId).toBe("d");
  });
  it("塔から抜くと、残った兄弟が詰め直される", () => {
    const three = [n("c"), n("a", "c", 0), n("b", "c", 1), n("e", "c", 2)];
    const moves = planDrop(three, ground, { kind: "free", x: 10, y: 20 }, "a");
    expect(moves.find((m) => m.id === "a")).toMatchObject({ parentId: null, x: 10, y: 20 });
    const rest = moves
      .filter((m) => m.parentId === "c")
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((m) => m.id);
    expect(rest).toEqual(["b", "e"]);
  });
  it("同じ積み木が二度書き換えられることはない", () => {
    const moves = planDrop(lone, groundD, { kind: "under", targetId: "a" }, "d");
    expect(new Set(moves.map((m) => m.id)).size).toBe(moves.length);
  });
});

describe("applyMoves", () => {
  it("当てはめた結果で塔を組み直せる(プレビュー用)", () => {
    const lone = [...tower, n("d", null, 0, 200)];
    const g: Ground = { ...ground, d: { x: 900, y: 900 } };
    const moves = planDrop(lone, g, { kind: "onTop", targetId: "c" }, "d");
    const next = applyMoves(lone, g, moves);
    expect(childrenOf(next.nodes, "c").map((x) => x.id)).toEqual(["a", "b", "d"]);
    const placed = layoutAll(next.nodes, next.ground);
    expect(placed.get("d")!.y).toBe(500 - BLOCK_H);
    expect(placed.get("d")!.x).toBe(100 + (200 + STACK_GAP_X) * 2); // 左から3番目
    expect(placed.get("c")!.width).toBe(200 * 3 + STACK_GAP_X * 2); // 土台は3つを支える幅に
  });
});

describe("範囲選択", () => {
  const placed = layoutAll(tower, ground);
  it("触れている積み木を拾う(囲みきらなくてよい)", () => {
    const hit = blocksInRect(placed, { x: 90, y: 490, w: 30, h: 30 });
    expect(hit).toContain("c");
  });
  it("離れていれば拾わない", () => {
    expect(blocksInRect(placed, { x: 9000, y: 9000, w: 10, h: 10 })).toEqual([]);
  });
  it("どちらの角から引いても同じ矩形になる", () => {
    expect(rectFromPoints({ x: 10, y: 10 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(rectFromPoints({ x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});

describe("topMostOf", () => {
  it("土台も上の積み木も選ばれていたら、土台だけ動かす", () => {
    expect(topMostOf(tower, ["c", "a", "b"])).toEqual(["c"]);
  });
  it("上の積み木だけ選ばれていればそれを動かす", () => {
    expect(topMostOf(tower, ["a", "b"])).toEqual(["a", "b"]);
  });
  it("関係のない積み木はそのまま残る", () => {
    const lone = [...tower, n("d")];
    expect(topMostOf(lone, ["c", "d"])).toEqual(["c", "d"]);
  });
});
