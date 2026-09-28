import { describe, expect, it } from "vitest";
import { alignBox, boundsOf, centerInside, simplify, unionBox, wouldCycle } from "./board-geometry";

describe("スナップ(縦横にそろえる)", () => {
  const other = { x: 100, y: 100, w: 200, h: 50 };
  it("左端が近ければ、左端にそろう(縦のガイドが出る)", () => {
    const r = alignBox({ x: 104, y: 300, w: 120, h: 50 }, [other], 8);
    expect(r.x).toBe(100);
    expect(r.guides.find((g) => g.axis === "v")?.at).toBe(100);
  });
  it("中心同士がそろう", () => {
    const r = alignBox({ x: 137, y: 300, w: 120, h: 50 }, [other], 8); // 中心 197 → 200
    expect(r.x).toBe(140);
  });
  it("上端が近ければ横にそろう", () => {
    const r = alignBox({ x: 500, y: 95, w: 120, h: 50 }, [other], 8);
    expect(r.y).toBe(100);
    expect(r.guides.some((g) => g.axis === "h")).toBe(true);
  });
  it("遠ければ動かさず、ガイドも出さない", () => {
    const r = alignBox({ x: 500, y: 400, w: 120, h: 50 }, [other], 8);
    expect(r).toEqual({ x: 500, y: 400, guides: [] });
  });
  it("いちばん近い候補を選ぶ", () => {
    const r = alignBox({ x: 106, y: 300, w: 120, h: 50 }, [other, { x: 103, y: 600, w: 40, h: 10 }], 8);
    expect(r.x).toBe(103);
  });
});

describe("ペンの点を間引く", () => {
  it("ほぼ直線なら両端だけ残す", () => {
    const pts: [number, number][] = Array.from({ length: 50 }, (_, i) => [i, i * 0.01]);
    expect(simplify(pts)).toEqual([pts[0], pts[49]]);
  });
  it("曲がり角は残す", () => {
    const pts: [number, number][] = [[0, 0], [50, 0], [50, 50]];
    expect(simplify(pts)).toEqual(pts);
  });
});

describe("セクションの中に入っているか", () => {
  const section = { x: 0, y: 0, w: 300, h: 200 };
  it("中心が中にあれば入っている(はみ出していてもよい)", () => {
    expect(centerInside({ x: 250, y: 50, w: 80, h: 40 }, section)).toBe(true);
  });
  it("中心が外なら入っていない", () => {
    expect(centerInside({ x: 280, y: 50, w: 80, h: 40 }, section)).toBe(false);
  });
});

describe("囲む箱", () => {
  it("線の点列から箱を作る", () => {
    expect(boundsOf(10, 10, [[0, 0], [30, -5], [20, 40]])).toEqual({ x: 10, y: 5, w: 30, h: 45 });
  });
  it("全部を囲む", () => {
    expect(unionBox([{ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: -5, w: 10, h: 10 }])).toEqual({ x: 0, y: -5, w: 60, h: 15 });
    expect(unionBox([])).toBeNull();
  });
});

describe("wouldCycle", () => {
  const links = [
    { from_id: "a", to_id: "b" },
    { from_id: "b", to_id: "c" },
  ];
  it("b → a は輪になる(a → b がある)", () => expect(wouldCycle(links, "b", "a")).toBe(true));
  it("c → a は遠回りの輪になる", () => expect(wouldCycle(links, "c", "a")).toBe(true));
  it("a → c は輪にならない", () => expect(wouldCycle(links, "a", "c")).toBe(false));
  it("無関係な d → a は大丈夫", () => expect(wouldCycle(links, "d", "a")).toBe(false));
});
