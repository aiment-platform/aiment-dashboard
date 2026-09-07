import type { Health, Confidence } from "@/lib/constants";

/** 「たった今」「5分前」「2時間前」「3日前」 — 活動の経過時間 */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return `${Math.floor(days / 30)}か月前`;
}

/** 「9/30」 */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** カレンダー日での日数差(今日=0、明日=1、昨日=-1) */
function calendarDays(iso: string): number {
  const due = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((due - today) / 86_400_000);
}

/** 「あと5日」「今日期限」「3日超過」 */
export function dueLabel(iso: string | null, overdue: boolean): string | null {
  if (!iso) return null;
  const days = calendarDays(iso);
  if (overdue || days < 0) return `${-days}日超過`;
  if (days === 0) return "今日期限";
  return `あと${days}日`;
}

export const HEALTH_LABEL: Record<Health, string> = {
  on_track: "順調",
  at_risk: "要注意",
  off_track: "危険",
};

export const HEALTH_GLYPH: Record<Health, string> = {
  on_track: "●",
  at_risk: "▲",
  off_track: "■",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const TREND_ARROW: Record<"up" | "down" | "flat", string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

/** 「18/30」用の数値表記(小数は1桁まで) */
export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/*
 * 切迫ランプ (G-redesign): calm → warm → hot → critical。
 * 全画面で共通の唯一の色規則。停滞(stale)はランプに乗せない — 腐敗は冷たい灰色。
 */
export type Urgency = "calm" | "warm" | "hot" | "critical";

/** 期限ベースの切迫度: 期限なし=calm / <7日=warm / <3日=hot / 当日・超過=critical */
export function dueUrgency(due: string | null | undefined): Urgency {
  if (!due) return "calm";
  const days = calendarDays(due);
  if (days <= 0) return "critical";
  if (days < 3) return "hot";
  if (days < 7) return "warm";
  return "calm";
}

/** ブロッカー年齢の切迫度: 〜3日=calm / 3日超=warm / 7日超=hot / 14日超=critical */
export function blockerUrgency(ageDays: number): Urgency {
  if (ageDays > 14) return "critical";
  if (ageDays > 7) return "hot";
  if (ageDays > 3) return "warm";
  return "calm";
}

export const URGENCY_TEXT: Record<Urgency, string> = {
  calm: "text-calm",
  warm: "text-warm",
  hot: "text-hot",
  critical: "text-critical",
};

export const URGENCY_VAR: Record<Urgency, string> = {
  calm: "var(--color-calm)",
  warm: "var(--color-warm)",
  hot: "var(--color-hot)",
  critical: "var(--color-critical)",
};
