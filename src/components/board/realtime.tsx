"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LiveblocksProvider,
  RoomProvider,
  useBroadcastEvent,
  useEventListener,
  useOthers,
  useUpdateMyPresence,
} from "@liveblocks/react";

/**
 * ふたりで同じ盤を見るための線。
 *
 * **suspense 版ではなく通常版の Hook を使うこと。**
 * suspense 版は「繋がるまで待つ」ので、鍵が間違っていると盤ごと表示されなくなる。
 * 通常版なら未接続でも空のまま返るので、線が死んでも盤は普通に使える。
 *
 * ここで流すのは**2つだけ**です。
 *   ・カーソルの位置(presence)
 *   ・「盤が変わったよ」という合図(broadcast)
 *
 * **積み木のデータ本体は流しません。** 正しいデータはPostgresに1つだけ置きます。
 * 合図を受けた側が取り直す、という形にすることで「どっちが本当か」が
 * 分からなくなる状態を作らずに済みます。
 * (積み木は数十個なので、丸ごと取り直しても一瞬です)
 *
 * Neon の無料枠は月100 CU時間しかないので、
 * **常時つなぎっぱなしの通信をDBに乗せないこと**が大事。だから別の線にしています。
 */

/** 盤ぜんぶを包む。リアルタイムを使わない時(鍵が無い時)は素通しになる。 */
export function BoardRoom({
  roomId,
  enabled,
  children,
}: {
  roomId: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" throttle={16}>
      <RoomProvider id={roomId} initialPresence={{ cursor: null }}>
        {children}
      </RoomProvider>
    </LiveblocksProvider>
  );
}

/**
 * 自分が何か変えたら「変わったよ」と一言流し、
 * 相手から合図が来たら取り直す。
 *
 * 自分の broadcast は自分には返ってこないので、
 * 「refresh → broadcast → refresh …」の無限ループにはならない。
 */
export function useBoardSync(pending: boolean) {
  const router = useRouter();
  const broadcast = useBroadcastEvent();
  const was = useRef(false);

  useEventListener(({ event }) => {
    if (event.type === "board-changed") router.refresh();
  });

  useEffect(() => {
    // 書き込みが一段落した瞬間に1回だけ知らせる
    if (was.current && !pending) broadcast({ type: "board-changed" });
    was.current = pending;
  }, [pending, broadcast]);
}

/** 相手のカーソル。紙の座標で持っているので、拡大しても位置がずれない。 */
export function OtherCursors() {
  const others = useOthers();
  return (
    <>
      {others.map(({ connectionId, presence, info }) => {
        const cursor = presence.cursor;
        if (!cursor) return null;
        const color = info?.color ?? "#6c4bf4";
        return (
          <div
            key={connectionId}
            className="pointer-events-none absolute"
            style={{ left: cursor.x, top: cursor.y, zIndex: 400 }}
            data-testid="other-cursor"
            data-name={info?.name ?? ""}
          >
            <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden>
              <path
                d="M3 2.5l12.5 8.2-5.9 1.1-2.4 5.6L3 2.5z"
                fill={color}
                stroke="#fff"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="brick absolute left-[15px] top-[17px] whitespace-nowrap rounded-[7px] px-1.5 py-0.5 text-[11px] font-bold text-white"
              style={
                {
                  background: color,
                  "--depth-x": "0px",
                  "--depth-y": "2px",
                  "--depth-color": `color-mix(in srgb, ${color} 70%, #000)`,
                } as React.CSSProperties
              }
            >
              {info?.name ?? "だれか"}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** 自分のカーソルを相手へ流す。紙の座標に直してから渡す。 */
export function useCursorBroadcast() {
  const update = useUpdateMyPresence();
  return {
    move: (p: { x: number; y: number }) => update({ cursor: p }),
    leave: () => update({ cursor: null }),
  };
}


