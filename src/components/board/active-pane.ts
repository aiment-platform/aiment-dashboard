import { useSyncExternalStore } from "react";

/**
 * 分割画面で「いまどの画面を触っているか」。
 *
 * キーボード操作(Backspace・⌘C/⌘V・道具の切り替え・← →)は window で受けるので、
 * 何もしないと並んでいる盤ぜんぶが同時に反応してしまう。
 * 最後にポインタを押した盤だけが反応するようにする。1画面のときは常に反応する。
 */
let active: string | null = null;
const listeners = new Set<() => void>();

export function setActivePane(id: string) {
  if (active === id) return;
  active = id;
  for (const l of listeners) l();
}

export function isActivePane(id: string | undefined): boolean {
  return !id || active === null || active === id;
}

/** 画面に「いまキーを受けている枠」を示すため(枠のふちの色) */
export function useActivePaneId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active,
    () => null,
  );
}
