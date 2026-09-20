import type { ContactKind, ContactStatus } from "@/lib/constants";

/** 画面に出す日本語と色。DBの値(英語)はそのまま、見せ方だけここで決める。 */

export const KIND_LABEL: Record<ContactKind, string> = {
  user: "ユーザー",
  vtuber: "VTuber",
  other: "その他",
};

export const STATUS_LABEL: Record<ContactStatus, string> = {
  candidate: "候補",
  contacted: "声かけ済み",
  waiting: "返事待ち",
  active: "協力中",
  passed: "見送り",
};

/**
 * 段階ごとの色。盤の積み木と同じ決まり
 *   薄紫 = ふつう / 若草 = うまくいっている / 桃 = こちらが動くべき
 */
export const STATUS_TONE: Record<ContactStatus, { face: string; deep: string; ink: string }> = {
  candidate: { face: "#ffffff", deep: "rgba(20,22,28,0.18)", ink: "#14161c" },
  contacted: { face: "var(--color-brick-face)", deep: "var(--color-brick-deep)", ink: "var(--color-brick-ink)" },
  waiting: { face: "var(--color-brick-face)", deep: "var(--color-brick-deep)", ink: "var(--color-brick-ink)" },
  active: { face: "var(--color-brick-done-face)", deep: "var(--color-brick-done-deep)", ink: "var(--color-brick-done-ink)" },
  passed: { face: "#f1f0ec", deep: "rgba(20,22,28,0.14)", ink: "rgba(20,22,28,0.5)" },
};

export const KIND_COLOR: Record<ContactKind, string> = {
  user: "#6c4bf4",
  vtuber: "#e8467c",
  other: "#8a8f9a",
};

/** X の ID からプロフィールURLへ */
export function xUrl(handle: string): string {
  return `https://x.com/${handle}`;
}

/** 「返事待ちが何日続いているか」のように、日付から今日までの日数 */
export function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const d = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((today - d) / 86_400_000);
}

// ---- 連絡先の自動判別 --------------------------------------------------------

export type AddressKey = "handle" | "discord" | "email" | "url";

export const ADDRESS_LABEL: Record<AddressKey, string> = {
  handle: "X",
  discord: "Discord",
  email: "メール",
  url: "ページ",
};

export interface DetectedAddress {
  key: AddressKey;
  /** 保存する値(XならIDだけ、URLなら https:// 付き) */
  value: string;
  /** 「X か Discord か決めかねる1語」のとき true。画面で切り替えられるようにする */
  ambiguous: boolean;
}

/** これで終わっていたらページ(URL)とみなす。Discord のユーザー名に付く「.」と区別するため */
const KNOWN_TLD = /\.(com|net|org|jp|io|tv|gg|me|co|dev|app|info|xyz|site|link|page|studio|fm|live|store|shop)(\/|$)/i;

/**
 * 貼られた文字から、X / Discord / メール / ページ のどれかを見分ける。
 *
 * 見分けの順番が大事(上から順に当てはめる):
 *   1. x.com / twitter.com の URL         → X(IDだけ取り出す)
 *   2. discord.gg / discord.com の URL     → Discord
 *   3. http(s):// や www. で始まる        → ページ
 *   4. a@b.c の形                          → メール
 *   5. name#1234 の形(昔の Discord)        → Discord
 *   6. @ で始まる1語                       → X
 *   7. foo.com のような、よくある末尾のドメイン → ページ(https:// を付ける)
 *   8. それ以外の1語                        → X と仮定(ただし「決めかねる」印を付ける)
 *   9. 空白などを含む                       → Discord のユーザー名と仮定(同上)
 */
export function detectAddress(raw: string): DetectedAddress | null {
  const t = raw.trim();
  if (!t) return null;

  const x = t.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/i);
  if (x) return { key: "handle", value: x[1], ambiguous: false };

  if (/^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com|discordapp\.com)\//i.test(t)) {
    return { key: "discord", value: t, ambiguous: false };
  }

  if (/^https?:\/\//i.test(t)) return { key: "url", value: t, ambiguous: false };
  if (/^www\./i.test(t)) return { key: "url", value: `https://${t}`, ambiguous: false };

  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(t)) return { key: "email", value: t, ambiguous: false };

  if (/^[^\s#@]{2,32}#\d{4}$/.test(t)) return { key: "discord", value: t, ambiguous: false };

  if (/^@[A-Za-z0-9_]{1,15}$/.test(t)) return { key: "handle", value: t.slice(1), ambiguous: false };

  // メールは4で拾い終わっているので、ここに来た「@」入りは youtube.com/@name のようなURL
  if (!/\s/.test(t) && KNOWN_TLD.test(t)) {
    return { key: "url", value: `https://${t}`, ambiguous: false };
  }

  if (/^[A-Za-z0-9_.]{1,32}$/.test(t)) return { key: "handle", value: t, ambiguous: true };

  return { key: "discord", value: t, ambiguous: true };
}
