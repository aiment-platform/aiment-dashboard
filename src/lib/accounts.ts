/**
 * 使うアカウントは3つだけ。増やす予定が無いので、DBに作らせず**ここに直接書く**。
 *
 * IDを固定してあるのが要点で、
 *   ・担当者アイコンの色が毎回同じになる
 *   ・シードし直しても、デプロイし直しても、同じ人は同じ行を指す
 * という2つがタダで手に入る。
 *
 * 本当のログイン(誰でも入れるかどうか)は**Vercel側の許可メールアドレス**で守る。
 * このアプリは「もう入れる人しか来ない」前提で、誰として書くかだけを選ばせる。
 */
export interface Account {
  id: string;
  name: string;
  /** 担当者アイコンの色。3人が必ず違う色になるよう手で決めてある。 */
  color: string;
}

export const ACCOUNTS: Account[] = [
  { id: "mem_soya", name: "Soya", color: "#6c4bf4" },
  { id: "mem_futo", name: "Futo", color: "#22c7b8" },
  { id: "mem_other", name: "Other", color: "#ffb020" },
];

export const ACCOUNT_IDS = ACCOUNTS.map((a) => a.id);

/**
 * 担当者としてだけ選べる人。「だれとして書く？」には出さない。
 * Both = Soya と Futo の二人で持つ仕事。
 */
export const ASSIGNEE_ONLY: Account[] = [{ id: "mem_both", name: "Both", color: "#3b82f6" }];

/** 担当者として選べる全員(書き手の3人 + Both) */
export const ASSIGNEES: Account[] = [...ACCOUNTS, ...ASSIGNEE_ONLY];

/** その担当者は、この人の仕事として数えるか(Both は Soya にも Futo にも入る) */
export function isAssignedTo(ownerId: string | null | undefined, memberId: string): boolean {
  if (!ownerId) return false;
  if (ownerId === memberId) return true;
  return ownerId === "mem_both" && (memberId === "mem_soya" || memberId === "mem_futo");
}

export function isAccountId(id: string | null | undefined): boolean {
  return !!id && ACCOUNT_IDS.includes(id);
}

export function accountById(id: string | null | undefined): Account | null {
  return ACCOUNTS.find((a) => a.id === id) ?? null;
}

/** 誰として書いているかを覚えておくCookieの名前 */
export const ACCOUNT_COOKIE = "aiment_account";
