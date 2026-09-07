import { describe, it, expect, vi } from "vitest";
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  historyIntent,
  isTextEntry,
  popRedo,
  popUndo,
  pushEntry,
  type HistoryEntry,
} from "./history";

const entry = (label: string): HistoryEntry => ({ label, undo: vi.fn(), redo: vi.fn() });

describe("pushEntry", () => {
  it("past に積まれる", () => {
    const s = pushEntry(EMPTY_HISTORY, entry("a"));
    expect(s.past.map((e) => e.label)).toEqual(["a"]);
  });
  it("新しい操作をすると future(やり直せる分)は捨てられる", () => {
    let s = pushEntry(EMPTY_HISTORY, entry("a"));
    s = popUndo(s).state;
    expect(s.future).toHaveLength(1);
    s = pushEntry(s, entry("b"));
    expect(s.future).toHaveLength(0);
    expect(s.past.map((e) => e.label)).toEqual(["b"]);
  });
  it("上限を超えたら古いものから捨てる", () => {
    let s = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = pushEntry(s, entry(`e${i}`));
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    expect(s.past[0].label).toBe("e10");
  });
});

describe("popUndo / popRedo", () => {
  it("最後の操作から順に取り消す", () => {
    const s = pushEntry(pushEntry(EMPTY_HISTORY, entry("a")), entry("b"));
    const u1 = popUndo(s);
    expect(u1.entry?.label).toBe("b");
    const u2 = popUndo(u1.state);
    expect(u2.entry?.label).toBe("a");
    expect(u2.state.past).toHaveLength(0);
  });
  it("取り消したものを同じ順で戻せる", () => {
    let s = pushEntry(pushEntry(EMPTY_HISTORY, entry("a")), entry("b"));
    s = popUndo(s).state;
    const r = popRedo(s);
    expect(r.entry?.label).toBe("b");
    expect(r.state.past.map((e) => e.label)).toEqual(["a", "b"]);
    expect(r.state.future).toHaveLength(0);
  });
  it("空なら null を返し、状態は変わらない", () => {
    expect(popUndo(EMPTY_HISTORY).entry).toBeNull();
    expect(popRedo(EMPTY_HISTORY).entry).toBeNull();
    expect(popUndo(EMPTY_HISTORY).state).toBe(EMPTY_HISTORY);
  });
  it("undo → redo → undo を往復しても壊れない", () => {
    let s = pushEntry(EMPTY_HISTORY, entry("a"));
    s = popUndo(s).state;
    s = popRedo(s).state;
    const again = popUndo(s);
    expect(again.entry?.label).toBe("a");
  });
});

describe("historyIntent", () => {
  const k = (o: Partial<Parameters<typeof historyIntent>[0]>) =>
    historyIntent({ key: "z", metaKey: false, ctrlKey: false, shiftKey: false, ...o });
  it("⌘Z / Ctrl+Z は undo", () => {
    expect(k({ metaKey: true })).toBe("undo");
    expect(k({ ctrlKey: true })).toBe("undo");
  });
  it("⇧⌘Z / Ctrl+Shift+Z は redo", () => {
    expect(k({ metaKey: true, shiftKey: true })).toBe("redo");
    expect(k({ ctrlKey: true, shiftKey: true })).toBe("redo");
  });
  it("Ctrl+Y も redo(Windowsの慣習)", () => {
    expect(k({ key: "y", ctrlKey: true })).toBe("redo");
  });
  it("修飾キー無し、別のキーは無視", () => {
    expect(k({})).toBeNull();
    expect(k({ key: "a", metaKey: true })).toBeNull();
  });
  it("大文字でも効く(Shift併用でキーが Z になるため)", () => {
    expect(k({ key: "Z", metaKey: true, shiftKey: true })).toBe("redo");
  });
});

describe("isTextEntry", () => {
  it("入力欄なら true", () => {
    expect(isTextEntry({ tagName: "INPUT" } as Element)).toBe(true);
    expect(isTextEntry({ tagName: "TEXTAREA" } as Element)).toBe(true);
  });
  it("ふつうの要素は false", () => {
    expect(isTextEntry({ tagName: "DIV", isContentEditable: false } as unknown as Element)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
