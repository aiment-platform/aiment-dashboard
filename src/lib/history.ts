/**
 * やり直し(Undo / Redo)の「積み上げ」だけを扱う純粋な部分。
 *
 * 考え方はカードの山札2つ:
 *   past  … すでにやったことの山。Ctrl+Z で一番上を1枚めくって取り消す
 *   future… 取り消したことの山。Ctrl+Shift+Z で戻す
 * 新しい操作をしたら future は捨てる(枝分かれした歴史は追わない — 混乱のもと)。
 *
 * DOM も React も知らないので、ここだけ単体テストで固められる。
 */

export interface HistoryEntry {
  /** 「積み木を動かした」— トーストに出る一言 */
  label: string;
  /** その操作を取り消す */
  undo: () => void | Promise<void>;
  /** 取り消したものをもう一度やる */
  redo: () => void | Promise<void>;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** これ以上は覚えない。古いものから捨てる。 */
export const HISTORY_LIMIT = 50;

export const EMPTY_HISTORY: HistoryState = { past: [], future: [] };

/** 操作を1つ記録する。分岐した未来は捨てる。 */
export function pushEntry(state: HistoryState, entry: HistoryEntry): HistoryState {
  const past = [...state.past, entry];
  return { past: past.slice(-HISTORY_LIMIT), future: [] };
}

/** Ctrl+Z 一回ぶん。取り消すものが無ければ entry は null。 */
export function popUndo(state: HistoryState): { state: HistoryState; entry: HistoryEntry | null } {
  if (state.past.length === 0) return { state, entry: null };
  const entry = state.past[state.past.length - 1];
  return {
    state: { past: state.past.slice(0, -1), future: [...state.future, entry].slice(-HISTORY_LIMIT) },
    entry,
  };
}

/** Ctrl+Shift+Z 一回ぶん。 */
export function popRedo(state: HistoryState): { state: HistoryState; entry: HistoryEntry | null } {
  if (state.future.length === 0) return { state, entry: null };
  const entry = state.future[state.future.length - 1];
  return {
    state: { past: [...state.past, entry].slice(-HISTORY_LIMIT), future: state.future.slice(0, -1) },
    entry,
  };
}

/** キー入力が「やり直し」かどうか。⌘Z / Ctrl+Z / ⇧⌘Z / Ctrl+Y に対応。 */
export function historyIntent(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): "undo" | "redo" | null {
  if (!e.metaKey && !e.ctrlKey) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !e.metaKey) return "redo"; // Windows の慣習
  return null;
}

/** 文字入力中は横取りしない(入力欄のやり直しはブラウザに任せる) */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  return (el as HTMLElement).isContentEditable === true;
}
