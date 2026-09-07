import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 日本語の変換中(IME)に押された Enter / Escape かどうか。
 *
 * かな漢字変換の「変換を確定する Enter」と「入力を決定する Enter」は
 * 同じキーなので、区別しないと変換の途中で入力が閉じてしまう。
 * ブラウザは変換中のキー入力に `isComposing = true` を立ててくれるので、
 * その間はこちらの処理をしない。
 */
export function isComposing(e: { nativeEvent: KeyboardEvent } | KeyboardEvent): boolean {
  const native = "nativeEvent" in e ? e.nativeEvent : e;
  // keyCode 229 は「IMEが処理中」を表す古くからの合図(Safari 等の保険)
  return native.isComposing === true || native.keyCode === 229;
}
