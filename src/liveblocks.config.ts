/**
 * Liveblocks に「この部屋で何をやり取りするか」を型で教えるファイル。
 * これを書いておくと、presence や相手の名前・色が全部 any にならずに済む。
 */
declare global {
  interface Liveblocks {
    Presence: {
      /** 紙の座標。画面座標だと、相手が別の場所を見ているとズレる。 */
      cursor: { x: number; y: number } | null;
    };
    UserMeta: {
      id: string;
      info: { name: string; color: string };
    };
    RoomEvent: { type: "board-changed" };
  }
}

export {};
