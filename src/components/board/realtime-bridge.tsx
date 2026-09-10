"use client";

import { useEffect } from "react";
import { OtherCursors, PresenceChips, useBoardSync, useCursorBroadcast } from "./realtime";

/**
 * 盤とリアルタイムの線をつなぐ薄い部品。
 *
 * **Liveblocks の Hook は Room の中でしか動けない**ので、盤の本体には置かずに
 * ここへ切り出してある。リアルタイムを使わない時は、盤がこの部品を描かないだけで済む。
 *
 * 置き場所が2つに分かれているのが要点:
 *   ・{@link RealtimeCursors} は**紙の中**(拡大縮小がかかる層)。紙の座標で描くため
 *   ・{@link RealtimeBridge}  は**紙の外**。画面の角に貼り付けたいため
 *
 * 変形(transform)のかかった親の中では `position: fixed` が画面ではなく
 * **その親を基準にしてしまう**ので、紙の中に置くと角に固定できない。
 */

/** 紙の中に置く: 相手のカーソル */
export function RealtimeCursors() {
  return <OtherCursors />;
}

/** 紙の外に置く: 合図のやり取り、カーソルの送信、左上の「いま居る人」 */
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

  return <PresenceChips />;
}
