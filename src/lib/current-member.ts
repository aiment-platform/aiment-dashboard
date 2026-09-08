import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ACCOUNT_COOKIE, accountById, isAccountId, type Account } from "@/lib/accounts";
import { getDb, schema } from "@/lib/db";
import { nowIso } from "@/lib/ids";
import type { Actor } from "@/lib/services/activity";
import { type MemberDto } from "@/lib/services/members";

/**
 * 「いま誰として書いているか」。
 *
 * Cookie に選んだアカウントのIDが入っているだけの、ごく簡単な仕組みです。
 * **本当のアクセス制限は Vercel 側の許可メールアドレス**が受け持つので、
 * ここは「もう入れる人しか来ない」前提で、名前を選ばせるだけ。
 */
export async function getCurrentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const id = jar.get(ACCOUNT_COOKIE)?.value;
  return isAccountId(id) ? accountById(id) : null;
}

export async function getCurrentMember(): Promise<MemberDto | null> {
  const account = await getCurrentAccount();
  if (!account) return null;
  await ensureAccountRow(account);
  return { id: account.id, name: account.name, role: null, is_active: true };
}

export async function getActor(): Promise<Actor> {
  const account = await getCurrentAccount();
  return { type: "member", id: account?.id ?? null };
}

/** アカウントに対応する members の行が無ければ作る(名前や色はコード側が正)。 */
async function ensureAccountRow(account: Account): Promise<void> {
  const db = getDb();
  const found = (await db.select().from(schema.members).where(eq(schema.members.id, account.id)))[0];
  if (found) return;
  await db.insert(schema.members).values({
    id: account.id,
    name: account.name,
    role: null,
    authUserId: null,
    isActive: 1,
    createdAt: nowIso(),
  });
}
