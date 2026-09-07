/**
 * ホワイトボード「積み木」の純関数まとめ。
 * DOM も React も触らないので、ここだけ単体テストで固められる
 * (src/lib/whiteboard.test.ts)。見た目の定数もここに集約する。
 */

/** 積み木1個の高さ(px)。厚み(ハードシャドウ)は含まない。 */
export const BLOCK_H = 52;
/** 左のグレーのつまみ(開閉ハンドル)の幅 */
export const HANDLE_W = 28;
/** 面(色のついた部分)の最小幅。担当者の四角と数文字が入るだけの下限。 */
export const MIN_FACE_W = 84;
/** 厚みの見え方 — 右下にずらす量 */
export const BLOCK_DEPTH = 5;
/** サブタスク1行の高さ */
export const SUBTASK_H = 43;
/** 幹(縦線)がブロック下端から伸び始めるまでの距離 */
export const TRUNK_TOP = 8;
/** 盤のグリッド(ドラッグはこの倍数に吸着する) */
export const GRID = 10;
/** 紙の水玉の間隔(px)。カメラの倍率をかけて使う。 */
export const DOT_GAP = 26;

/** 担当者アイコンの色。四角の色 = 人。順番は固定なので誰の色かは変わらない。 */
export const MEMBER_COLORS = [
  "#7c5cfc", // purple
  "#6fd85f", // green
  "#ffb020", // amber
  "#3ea9f5", // blue
  "#ff6f9c", // pink
  "#22c7b8", // teal
  "#b06cf0", // violet
  "#f2703a", // orange
] as const;

/** メンバーIDから色を決める。同じIDなら毎回同じ色(DBに色を持たせない)。 */
export function memberColor(memberId: string | null | undefined): string {
  if (!memberId) return "#c9c9c9";
  let h = 0;
  for (let i = 0; i < memberId.length; i++) h = (h * 31 + memberId.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

/** 名前の頭文字(日本語1文字 / ラテンは1文字)。アイコンの中に置く。 */
export function initial(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n ? Array.from(n)[0].toUpperCase() : "?";
}

/**
 * 「重要(桃色)」かどうかの唯一の規則。
 *
 *   ・手で旗を立てたら、いつでも重要
 *   ・旗を立てていなければ「期限まで2日以内 / 期限切れ / ブロッカーあり」で自動的に重要
 *   ・できあがったものは重要にならない
 *
 * 桃色が増えすぎたら、しきい値はここだけ直せば全画面に効く。
 */
export const URGENT_DAYS = 2;

export function isUrgentBlock(input: {
  status: string;
  important: boolean;
  blocked: boolean;
  /** 今日から見て期限まであと何日か。期限なしは null。 */
  daysLeft: number | null;
}): boolean {
  if (input.status === "achieved") return false;
  if (input.important) return true;
  if (input.blocked) return true;
  return input.daysLeft !== null && input.daysLeft <= URGENT_DAYS;
}

export type Tone = "normal" | "urgent" | "done";

/** 積み木の色 = 状態。緑=完了 / ピンク=重要 / 薄紫=普通。 */
export function blockTone(block: { status: string; urgent: boolean }): Tone {
  if (block.status === "achieved") return "done";
  return block.urgent ? "urgent" : "normal";
}

/**
 * タイトルの長さから積み木の見た目の幅を見積もる(全角は2文字分)。
 * 置いてある積み木は中身に合わせて自然に伸びるので、これを使うのは
 * 「まだ中身が無い下書きの積み木」の幅を決めるときだけ。240〜520px。
 */
/**
 * 積み木の「名前ぶんの幅」。**短いタスクは短い積み木になる。**
 * 内訳: 持ち手28 + 左余白10 + 担当者26 + 隙間10 + 文字 + 右余白24
 * 操作ボタンは面から出て「選んだときに右に出る道具箱」へ移したので、そのぶんは要らない。
 */
export function blockWidth(title: string, extras = 0): number {
  let units = 0;
  for (const ch of title) units += /[\x20-\x7e]/.test(ch) ? 1 : 2;
  return Math.round(Math.min(640, Math.max(150, 98 + units * 7.8 + extras)));
}

/**
 * 面に追加で乗るチップのぶんの幅。積み方の計算と描画で同じ値を使う。
 * 取り組み中の名札は面の外(右上)に乗るので、ここには入れない。
 */
export function blockExtrasWidth(hasDue: boolean, hasCounter = false): number {
  return (hasDue ? 36 : 0) + (hasCounter ? 38 : 0);
}

/** 座標を持たないブロックの既定位置。右下へ流れる階段状に置く。 */
export function defaultBlockPosition(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: 60 + col * 320, y: 40 + row * 300 + col * 110 };
}

/** ドラッグ結果をグリッドに吸着 + 盤の外(負の座標)に出さない */
export function snap(v: number): number {
  return Math.max(0, Math.round(v / GRID) * GRID);
}

/** 展開したときにブロックが占める高さ(枝の本数ぶん下に伸びる) */
export function expandedHeight(subtaskCount: number): number {
  return BLOCK_H + (subtaskCount === 0 ? 0 : TRUNK_TOP + subtaskCount * SUBTASK_H);
}

/** ピルの下に出る「9/6 ~ 10/6」 */
export function periodRangeLabel(start: string | null, end: string | null): string {
  const fmt = (d: string) => {
    const [, m, day] = d.slice(0, 10).split("-");
    return `${Number(m)}/${Number(day)}`;
  };
  if (start && end) return `${fmt(start)} ~ ${fmt(end)}`;
  if (start) return `${fmt(start)} ~`;
  if (end) return `~ ${fmt(end)}`;
  return "期間未設定";
}

/** ← → の行き先。端まで来たら null(矢印を消す)。 */
export function neighbourPeriod<T extends { id: string }>(
  periods: T[],
  currentId: string,
  dir: -1 | 1,
): T | null {
  const i = periods.findIndex((p) => p.id === currentId);
  if (i < 0) return null;
  return periods[i + dir] ?? null;
}

/** 盤全体を包む矩形 — スクロール領域の大きさを決めるのに使う */
export function canvasExtent(
  placed: { x: number; y: number; w: number; h: number }[],
  viewport: { w: number; h: number },
): { w: number; h: number } {
  let maxX = 0;
  let maxY = 0;
  for (const b of placed) {
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { w: Math.max(viewport.w, maxX + 400), h: Math.max(viewport.h, maxY + 400) };
}
