import { cookies } from "next/headers";
import type { Actor } from "@/lib/services/activity";
import { listMembers, type MemberDto } from "@/lib/services/members";

const COOKIE = "aiment_member";

/**
 * MVP identity: a member-picker cookie, no auth. Trusted 1–5 person tool on
 * localhost. `members.auth_user_id` is reserved for Supabase Auth later.
 */
export async function getCurrentMember(): Promise<MemberDto | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  const members = await listMembers();
  if (id) {
    const found = members.find((m) => m.id === id);
    if (found) return found;
  }
  return members.find((m) => m.is_active) ?? null;
}

export async function getActor(): Promise<Actor> {
  const m = await getCurrentMember();
  return { type: "member", id: m?.id ?? null };
}

export const MEMBER_COOKIE = COOKIE;
