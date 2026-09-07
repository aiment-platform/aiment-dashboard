"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  EMPTY_HISTORY,
  historyIntent,
  isTextEntry,
  popRedo,
  popUndo,
  pushEntry,
  type HistoryEntry,
  type HistoryState,
} from "@/lib/history";

/**
 * 盤の「やり直し」。⌘Z / Ctrl+Z で取り消し、⇧⌘Z / Ctrl+Shift+Z で戻す。
 *
 * 仕組みはかんたんで、**操作するたびに「元に戻す手順」を一緒に覚えておく**だけ。
 * 例: 積み木を (100,200) → (300,400) に動かしたら
 *     undo = もう一度 (100,200) に動かす / redo = また (300,400) に動かす
 * を1組にして山に積む。データベースを巻き戻しているわけではないので、
 * 相方が同時に触っていても相手の変更を壊しません。
 *
 * 山の出し入れそのものは src/lib/history.ts(純粋関数・テスト済み)。
 */

interface HistoryApi {
  /** 操作を1つ記録する。undo/redo は実際にサーバーへ投げる関数。 */
  record: (entry: HistoryEntry) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Ctx = createContext<HistoryApi>({
  record: () => {},
  undo: () => {},
  redo: () => {},
  canUndo: false,
  canRedo: false,
});

export function useHistory(): HistoryApi {
  return useContext(Ctx);
}

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  /*
   * 山札そのものは ref に置く。state の更新関数の中で undo() を呼ぶと、
   * React の開発モードは「更新関数は純粋なはず」として二度実行するので、
   * サーバー呼び出しまで二重に走ってしまう(redo が積み木を2個作った)。
   * 副作用は更新関数の外、ボタンの見た目だけ state に写す。
   */
  const stack = useRef<HistoryState>(EMPTY_HISTORY);
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const sync = useCallback(() => {
    setDepth({ past: stack.current.past.length, future: stack.current.future.length });
  }, []);
  // 連打しても順番が入れ替わらないよう、1件ずつ流す
  const busy = useRef(false);

  const record = useCallback(
    (entry: HistoryEntry) => {
      stack.current = pushEntry(stack.current, entry);
      sync();
    },
    [sync],
  );

  const run = useCallback(
    (dir: "undo" | "redo") => {
      if (busy.current) return;
      const { state, entry } = dir === "undo" ? popUndo(stack.current) : popRedo(stack.current);
      if (!entry) {
        toast(dir === "undo" ? "もう戻せません" : "やり直せるものはありません");
        return;
      }
      stack.current = state;
      sync();
      busy.current = true;
      Promise.resolve(dir === "undo" ? entry.undo() : entry.redo())
        .then(() => toast(`${dir === "undo" ? "もどした" : "やり直した"}: ${entry.label}`))
        .catch((err) => toast.error(`できませんでした: ${entry.label}`, { description: String(err) }))
        .finally(() => {
          busy.current = false;
        });
    },
    [sync],
  );

  const undo = useCallback(() => run("undo"), [run]);
  const redo = useCallback(() => run("redo"), [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const intent = historyIntent(e);
      if (!intent) return;
      // 入力欄の中では文字のやり直しを優先(横取りしない)
      if (isTextEntry(document.activeElement)) return;
      e.preventDefault();
      if (intent === "undo") undo();
      else redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <Ctx.Provider
      value={{ record, undo, redo, canUndo: depth.past > 0, canRedo: depth.future > 0 }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** 紙の右下に置く、やり直しの2つのボタン(キーが分からなくても押せるように)。 */
export function HistoryDock() {
  const { undo, redo, canUndo, canRedo } = useHistory();
  const style = {
    "--depth-x": "0px",
    "--depth-y": "3px",
    "--depth-color": "rgba(20,22,28,0.18)",
  } as React.CSSProperties;
  const cls =
    "brick brick-press grid size-8 place-items-center rounded-[9px] bg-white disabled:opacity-35 disabled:shadow-none";
  return (
    <>
      <button
        type="button"
        className={cls}
        style={style}
        onClick={undo}
        disabled={!canUndo}
        title="もどす (⌘Z)"
        aria-label="もどす"
        data-testid="undo"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-4" />
        </svg>
      </button>
      <button
        type="button"
        className={cls}
        style={style}
        onClick={redo}
        disabled={!canRedo}
        title="やり直す (⇧⌘Z)"
        aria-label="やり直す"
        data-testid="redo"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H9a5 5 0 0 0 0 10h4" />
        </svg>
      </button>
    </>
  );
}
