"use client";

import { useEffect } from "react";
import { OtherCursors, useBoardSync, useCursorBroadcast } from "./realtime";

/**
 * 盤とリアルタイムの線をつなぐ薄い部品。
 *
 * **Liveblocks の Hook は Room の中でしか動けない**ので、盤の本体には置かずに
 * ここへ切り出してある。リアルタイムを使わない時は、盤がこの部品を描かないだけで済む
 * (盤の中が if だらけにならない)。
 *
 * やることは2つだけ:
 *   ・書き込みが一段落したら「変わったよ」と相手に伝える
 *   ・自分のカーソルを流す関数を盤に渡し、相手のカーソルを描く
 */
export function RealtimeBridge({
  pending,
  onReady,
}: {
  /** 書き込み中かどうか。false に戻った瞬間に1回だけ知らせる */
  pending: boolean;
  /** カーソルを流す関数を盤へ渡す(盤はポインタが動くたびに呼ぶ) */
  onReady: (send: (p: { x: number; y: number } | null) => void) => void;
}) {
  useBoardSync(pending);
  const { move, leave } = useCursorBroadcast();

  useEffect(() => {
    onReady((p) => (p ? move(p) : leave()));
  }, [onReady, move, leave]);

  return <OtherCursors />;
}
