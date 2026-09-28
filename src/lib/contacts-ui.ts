import type { ContactChannel, ContactKind, ContactStatus } from "@/lib/constants";

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

// ---- 連絡手段(タグ) ------------------------------------------------------------

export type AddressKey = ContactChannel;

export const ADDRESS_LABEL: Record<ContactChannel, string> = {
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  discord: "Discord",
  messenger: "Messenger",
  line: "LINE",
  email: "メール",
  url: "ページ",
  other: "その他",
};

/** その手段の値を開くリンク。開けないもの(Discord の名前など)は null */
export function channelHref(channel: ContactChannel, value: string): string | null {
  const v = value.trim();
  if (!v) return null; // アドレス未入力のタグ
  if (/^https?:\/\//i.test(v)) return v;
  switch (channel) {
    case "x":
      return `https://x.com/${v.replace(/^@/, "")}`;
    case "instagram":
      return `https://instagram.com/${v.replace(/^@/, "")}`;
    case "tiktok":
      return `https://www.tiktok.com/@${v.replace(/^@/, "")}`;
    case "youtube":
      return v.startsWith("@") ? `https://youtube.com/${v}` : null;
    case "messenger":
      return `https://m.me/${v}`;
    case "email":
      return `mailto:${v}`;
    case "url":
      return `https://${v}`;
    default: // discord / line / other: 開ける形とは限らない
      return null;
  }
}

/** 画面に出すときの形。ID で持っているものは @ を付ける */
export function channelDisplay(channel: ContactChannel, value: string): string {
  if ((channel === "x" || channel === "instagram" || channel === "tiktok") && !/^https?:/i.test(value)) {
    return `@${value.replace(/^@/, "")}`;
  }
  return value;
}

export interface DetectedAddress {
  key: ContactChannel;
  /** 保存する値(SNS なら URL から ID だけ取り出す、ページなら https:// 付き) */
  value: string;
  /** 1語だけで、どの SNS の ID か決めかねる */
  ambiguous: boolean;
}

/** これで終わっていたらページ(URL)とみなす。Discord のユーザー名に付く「.」と区別するため */
const KNOWN_TLD = /\.(com|net|org|jp|io|tv|gg|me|co|dev|app|info|xyz|site|link|page|studio|fm|live|store|shop)(\/|$)/i;

/** プロフィールURLから ID を取り出す(ドメインごと) */
const PROFILE: { key: ContactChannel; re: RegExp }[] = [
  { key: "x", re: /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/i },
  { key: "instagram", re: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?(?:[?#].*)?$/i },
  { key: "tiktok", re: /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{1,30})(?:[/?#].*)?$/i },
];

/** そのドメインなら、この種類として URL のまま持つ */
const BY_DOMAIN: { key: ContactChannel; re: RegExp }[] = [
  { key: "youtube", re: /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i },
  { key: "discord", re: /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com|discordapp\.com)\//i },
  { key: "messenger", re: /^(?:https?:\/\/)?(?:www\.)?(?:m\.me|messenger\.com|facebook\.com|fb\.com)\//i },
  { key: "line", re: /^(?:https?:\/\/)?(?:line\.me|lin\.ee)\//i },
  { key: "instagram", re: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i },
  { key: "tiktok", re: /^(?:https?:\/\/)?(?:www\.|vt\.)?tiktok\.com\//i },
];

/**
 * 貼られた文字から、どの連絡手段かを見分ける。
 *
 * 見分けの順番が大事(上から順に当てはめる):
 *   1. X / Instagram / TikTok のプロフィールURL → その種類(IDだけ取り出す)
 *   2. YouTube / Discord / Messenger / LINE などのURL → その種類(URLのまま)
 *   3. http(s):// や www. で始まる        → ページ
 *   4. a@b.c の形                          → メール
 *   5. name#1234 の形(昔の Discord)        → Discord
 *   6. @ で始まる1語                       → X と仮定(決めかねる印)
 *   7. foo.com のような、よくある末尾のドメイン → ページ(https:// を付ける)
 *   8. それ以外の1語                        → X と仮定(決めかねる印)
 *   9. 空白などを含む                       → Discord の名前と仮定(決めかねる印)
 * 決めかねるものは、画面のタグから選び直せる。
 */
export function detectAddress(raw: string): DetectedAddress | null {
  const t = raw.trim();
  if (!t) return null;

  for (const { key, re } of PROFILE) {
    const m = t.match(re);
    if (m) return { key, value: m[1], ambiguous: false };
  }
  for (const { key, re } of BY_DOMAIN) {
    if (re.test(t)) return { key, value: /^https?:\/\//i.test(t) ? t : `https://${t}`, ambiguous: false };
  }

  if (/^https?:\/\//i.test(t)) return { key: "url", value: t, ambiguous: false };
  if (/^www\./i.test(t)) return { key: "url", value: `https://${t}`, ambiguous: false };

  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(t)) return { key: "email", value: t, ambiguous: false };

  if (/^[^\s#@]{2,32}#\d{4}$/.test(t)) return { key: "discord", value: t, ambiguous: false };

  if (/^@[A-Za-z0-9_.]{1,30}$/.test(t)) return { key: "x", value: t.slice(1), ambiguous: true };

  // メールは4で拾い終わっているので、ここに来た「@」入りは youtube.com/@name のようなURL
  if (!/\s/.test(t) && KNOWN_TLD.test(t)) return { key: "url", value: `https://${t}`, ambiguous: false };

  if (/^[A-Za-z0-9_.]{1,32}$/.test(t)) return { key: "x", value: t, ambiguous: true };

  return { key: "discord", value: t, ambiguous: true };
}

/** 種類を手で選び直したとき、貼った文字をその種類の形に整える(壊さない範囲で) */
export function valueAs(channel: ContactChannel, raw: string): string {
  const t = raw.trim();
  const profile = PROFILE.find((p) => p.key === channel);
  if (profile) {
    const m = t.match(profile.re);
    return m ? m[1] : t.replace(/^@/, "");
  }
  if (channel === "url" && t && !/^https?:\/\//i.test(t)) return `https://${t}`;
  return t;
}
