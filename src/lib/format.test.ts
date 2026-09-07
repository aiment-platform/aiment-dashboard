import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dueUrgency, blockerUrgency, fmtNum, dueLabel } from "./format";

describe("blockerUrgency(年齢→切迫ランプ)", () => {
  it("境界: 〜3日=calm / 3日超=warm / 7日超=hot / 14日超=critical", () => {
    expect(blockerUrgency(0)).toBe("calm");
    expect(blockerUrgency(3)).toBe("calm");
    expect(blockerUrgency(4)).toBe("warm");
    expect(blockerUrgency(7)).toBe("warm");
    expect(blockerUrgency(8)).toBe("hot");
    expect(blockerUrgency(14)).toBe("hot");
    expect(blockerUrgency(15)).toBe("critical");
  });
});

describe("dueUrgency(期限→切迫ランプ)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("期限なし=calm", () => {
    expect(dueUrgency(null)).toBe("calm");
  });
  it("7日以上先=calm / 7日未満=warm / 3日未満=hot / 当日・超過=critical", () => {
    expect(dueUrgency("2026-08-31")).toBe("calm");
    expect(dueUrgency("2026-08-26")).toBe("warm");
    expect(dueUrgency("2026-08-23")).toBe("hot");
    expect(dueUrgency("2026-08-21")).toBe("critical");
    expect(dueUrgency("2026-08-10")).toBe("critical");
  });
});

describe("dueLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("あとN日 / 今日期限 / N日超過", () => {
    expect(dueLabel("2026-08-26", false)).toBe("あと5日");
    expect(dueLabel("2026-08-21", false)).toBe("今日期限");
    expect(dueLabel("2026-08-19", true)).toBe("2日超過");
    expect(dueLabel(null, false)).toBeNull();
  });
});

describe("fmtNum", () => {
  it("整数はそのまま、小数は1桁", () => {
    expect(fmtNum(18)).toBe("18");
    expect(fmtNum(1.25)).toBe("1.3");
  });
});
