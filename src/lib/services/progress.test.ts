import { describe, it, expect } from "vitest";
import {
  milestoneProgress,
  rollup,
  worstHealth,
  daysSince,
  isStale,
  daysRemaining,
} from "./progress";

const ms = (current: number, target: number, weight = 1, status = "in_progress") => ({
  currentValue: current,
  targetValue: target,
  weight,
  status,
});

describe("milestoneProgress", () => {
  it("実数から導出する (18/30 = 0.6)", () => {
    expect(milestoneProgress(ms(18, 30))).toBeCloseTo(0.6);
  });
  it("目標超過は1.0で頭打ち", () => {
    expect(milestoneProgress(ms(40, 30))).toBe(1);
  });
  it("achieved は数値に関わらず1.0を強制", () => {
    expect(milestoneProgress(ms(2, 30, 1, "achieved"))).toBe(1);
  });
  it("target <= 0 は0(ゼロ除算しない)", () => {
    expect(milestoneProgress(ms(5, 0))).toBe(0);
  });
});

describe("rollup(加重集計)", () => {
  it("仕様の例: 重み25/30/15/25/5 → 51.2%", () => {
    const p = rollup([
      ms(18, 30, 25),
      ms(1, 3, 30),
      ms(2, 3, 15),
      ms(3, 5, 25),
      ms(12, 50, 5),
    ]);
    expect(p).toBeCloseTo(0.512, 3);
  });
  it("dropped は集計から除外される", () => {
    expect(rollup([ms(10, 10, 50), ms(0, 10, 50, "dropped")])).toBe(1);
  });
  it("マイルストーンなし(または全dropped)は0", () => {
    expect(rollup([])).toBe(0);
    expect(rollup([ms(5, 10, 1, "dropped")])).toBe(0);
  });
  it("等weightは単純平均に一致", () => {
    expect(rollup([ms(1, 2), ms(0, 2)])).toBeCloseTo(0.25);
  });
});

describe("worstHealth", () => {
  it("最悪値を返す: off_track > at_risk > on_track", () => {
    expect(worstHealth(["on_track", "at_risk"])).toBe("at_risk");
    expect(worstHealth(["at_risk", "off_track", "on_track"])).toBe("off_track");
    expect(worstHealth(["on_track"])).toBe("on_track");
    expect(worstHealth([])).toBe("on_track");
  });
});

describe("鮮度(staleness)", () => {
  const now = new Date("2026-08-21T12:00:00Z");
  it("daysSince は経過日数(floor)", () => {
    expect(daysSince("2026-08-15T12:00:00Z", now)).toBe(6);
    expect(daysSince("2026-08-21T09:00:00Z", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("invalid", now)).toBeNull();
  });
  it("isStale は7日超で真、7日以内で偽、欠損は真", () => {
    expect(isStale("2026-08-13T11:00:00Z", now)).toBe(true); // 8日
    expect(isStale("2026-08-14T12:00:00Z", now)).toBe(false); // 7日ちょうど
    expect(isStale(null, now)).toBe(true);
  });
  it("daysRemaining はカレンダー日の残り(当日=0、超過は負)", () => {
    expect(daysRemaining("2026-08-31", now)).toBe(10);
    expect(daysRemaining("2026-08-21", now)).toBe(0);
    expect(daysRemaining("2026-08-18", now)).toBe(-3);
    expect(daysRemaining(null, now)).toBeNull();
  });
});
