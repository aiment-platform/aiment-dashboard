import { describe, it, expect } from "vitest";
import { taskOrder, type TaskDto } from "./tasks";

function t(over: Partial<TaskDto>): TaskDto {
  return {
    id: "task_x",
    title: "x",
    status: "todo",
    priority: "p1",
    due_date: null,
    overdue: false,
    note: null,
    owner: { id: "mem_a", name: "A" },
    workstream: null,
    milestone: null,
    blocked_by: [],
    created_at: "2026-08-01T00:00:00Z",
    completed_at: null,
    ...over,
  };
}

describe("taskOrder(p0 → 期限超過 → 期限近い順 → 優先度 → 新しい順)", () => {
  it("p0 が最優先", () => {
    const a = t({ priority: "p0" });
    const b = t({ priority: "p1", overdue: true, due_date: "2026-08-01" });
    expect([b, a].sort(taskOrder)[0]).toBe(a);
  });
  it("期限超過は未超過より先", () => {
    const late = t({ overdue: true, due_date: "2026-08-10" });
    const soon = t({ due_date: "2026-08-22" });
    expect([soon, late].sort(taskOrder)[0]).toBe(late);
  });
  it("期限が近い順", () => {
    const a = t({ due_date: "2026-09-01" });
    const b = t({ due_date: "2026-08-25" });
    expect([a, b].sort(taskOrder)[0]).toBe(b);
  });
  it("期限なしは期限ありの後", () => {
    const none = t({ due_date: null });
    const dated = t({ due_date: "2026-12-31" });
    expect([none, dated].sort(taskOrder)[0]).toBe(dated);
  });
  it("同条件なら p1 が p2 より先", () => {
    const p1 = t({ priority: "p1" });
    const p2 = t({ priority: "p2" });
    expect([p2, p1].sort(taskOrder)[0]).toBe(p1);
  });
});
