import { describe, it, expect } from "vitest";
import {
  blockExtrasWidth,
  blockTone,
  blockWidth,
  canvasExtent,
  defaultBlockPosition,
  expandedHeight,
  initial,
  isUrgentBlock,
  memberColor,
  MEMBER_COLORS,
  neighbourPeriod,
  periodRangeLabel,
  snap,
  BLOCK_H,
  SUBTASK_H,
  TRUNK_TOP,
} from "./whiteboard";

describe("memberColor", () => {
  it("同じIDなら毎回同じ色", () => {
    expect(memberColor("mem_abc")).toBe(memberColor("mem_abc"));
  });
  it("必ずパレット内の色を返す", () => {
    for (const id of ["mem_a", "mem_b", "mem_zzz", "x"]) {
      expect(MEMBER_COLORS as readonly string[]).toContain(memberColor(id));
    }
  });
  it("担当者なしはグレー", () => {
    expect(memberColor(null)).toBe("#c9c9c9");
  });
});

describe("initial", () => {
  it("日本語は1文字目", () => expect(initial("そーや")).toBe("そ"));
  it("ラテンは大文字1文字", () => expect(initial("rin")).toBe("R"));
  it("空なら ?", () => expect(initial("")).toBe("?"));
});

describe("blockTone", () => {
  it("達成は done(重要フラグより優先)", () => {
    expect(blockTone({ status: "achieved", urgent: true })).toBe("done");
  });
  it("重要は urgent", () => {
    expect(blockTone({ status: "in_progress", urgent: true })).toBe("urgent");
  });
  it("それ以外は normal", () => {
    expect(blockTone({ status: "not_started", urgent: false })).toBe("normal");
  });
});

describe("blockWidth", () => {
  it("短いタスクは短い積み木になる", () => {
    expect(blockWidth("あ")).toBe(150);
    expect(blockWidth("すこし長めのタスク名")).toBeGreaterThan(blockWidth("あ"));
  });
  it("長いタイトルでも最大幅を超えない", () => {
    expect(blockWidth("あ".repeat(200))).toBe(640);
  });
  it("期限の日付のぶんだけ広がる(面から中身がはみ出さないように)", () => {
    const long = "アンケートを30件あつめる";
    expect(blockWidth(long, blockExtrasWidth(true))).toBeGreaterThan(blockWidth(long));
    expect(blockWidth(long, blockExtrasWidth(true, true))).toBeGreaterThan(
      blockWidth(long, blockExtrasWidth(true)),
    );
    expect(blockExtrasWidth(false)).toBe(0);
  });
  it("全角は半角の2倍で数える", () => {
    expect(blockWidth("ああああああああああ")).toBeGreaterThan(blockWidth("aaaaaaaaaa"));
  });
});

describe("defaultBlockPosition", () => {
  it("同じ列は重ならない", () => {
    const a = defaultBlockPosition(0);
    const b = defaultBlockPosition(3);
    expect(a.x).toBe(b.x);
    expect(b.y - a.y).toBeGreaterThanOrEqual(200);
  });
  it("右へ行くほど下がる(階段状)", () => {
    expect(defaultBlockPosition(1).y).toBeGreaterThan(defaultBlockPosition(0).y);
    expect(defaultBlockPosition(1).x).toBeGreaterThan(defaultBlockPosition(0).x);
  });
});

describe("snap", () => {
  it("10px グリッドに吸着", () => expect(snap(123)).toBe(120));
  it("負の座標は 0 に丸める", () => expect(snap(-40)).toBe(0));
});

describe("expandedHeight", () => {
  it("サブタスク0本ならブロックの高さのまま", () => {
    expect(expandedHeight(0)).toBe(BLOCK_H);
  });
  it("1本増えるごとに1行ぶん伸びる", () => {
    expect(expandedHeight(3) - expandedHeight(2)).toBe(SUBTASK_H);
    expect(expandedHeight(1)).toBe(BLOCK_H + TRUNK_TOP + SUBTASK_H);
  });
});

describe("periodRangeLabel", () => {
  it("両端そろえば 9/6 ~ 10/6", () => {
    expect(periodRangeLabel("2026-09-06", "2026-10-06")).toBe("9/6 ~ 10/6");
  });
  it("片方だけでも壊れない", () => {
    expect(periodRangeLabel("2026-09-06", null)).toBe("9/6 ~");
    expect(periodRangeLabel(null, "2026-10-06")).toBe("~ 10/6");
  });
  it("どちらも無ければ未設定", () => {
    expect(periodRangeLabel(null, null)).toBe("期間未設定");
  });
});

describe("neighbourPeriod", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("前後を返す", () => {
    expect(neighbourPeriod(list, "b", -1)?.id).toBe("a");
    expect(neighbourPeriod(list, "b", 1)?.id).toBe("c");
  });
  it("端では null", () => {
    expect(neighbourPeriod(list, "a", -1)).toBeNull();
    expect(neighbourPeriod(list, "c", 1)).toBeNull();
  });
  it("知らないIDでも落ちない", () => {
    expect(neighbourPeriod(list, "zzz", 1)).toBeNull();
  });
});

describe("canvasExtent", () => {
  it("ブロックが無ければビューポートのまま", () => {
    expect(canvasExtent([], { w: 1200, h: 800 })).toEqual({ w: 1200, h: 800 });
  });
  it("はみ出すブロックがあれば余白つきで広げる", () => {
    const e = canvasExtent([{ x: 2000, y: 1500, w: 300, h: 60 }], { w: 1200, h: 800 });
    expect(e.w).toBe(2700);
    expect(e.h).toBe(1960);
  });
});

describe("isUrgentBlock", () => {
  const base = { status: "not_started", important: false, blocked: false, daysLeft: null as number | null };
  it("手で旗を立てたら、期限に関係なく重要", () => {
    expect(isUrgentBlock({ ...base, important: true })).toBe(true);
    expect(isUrgentBlock({ ...base, important: true, daysLeft: 300 })).toBe(true);
  });
  it("旗がなくても、期限まで2日以内なら重要", () => {
    expect(isUrgentBlock({ ...base, daysLeft: 2 })).toBe(true);
    expect(isUrgentBlock({ ...base, daysLeft: 3 })).toBe(false);
  });
  it("期限切れも重要", () => {
    expect(isUrgentBlock({ ...base, daysLeft: -5 })).toBe(true);
  });
  it("ブロッカーが刺さっていれば重要", () => {
    expect(isUrgentBlock({ ...base, blocked: true })).toBe(true);
  });
  it("期限なし・旗なしなら普通", () => {
    expect(isUrgentBlock(base)).toBe(false);
  });
  it("できあがったものは重要にならない(旗が立っていても)", () => {
    expect(isUrgentBlock({ ...base, status: "achieved", important: true, daysLeft: -9 })).toBe(false);
  });
});
