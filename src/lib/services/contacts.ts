import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { CONTACT_KIND, CONTACT_STATUS, type ContactKind, type ContactStatus } from "@/lib/constants";
import { logActivity, type Actor } from "./activity";

/**
 * 連絡先 — 協力してくれるユーザーさん・VTuberさんの名簿。
 *
 * ここは「誰に声をかけて、いまどの段階か」を持つ場所。
 * 積み木(仕事)とは別の軸で、期間をまたいで残る。
 */

export interface ContactDto {
  id: string;
  name: string;
  kind: ContactKind;
  status: ContactStatus;
  handle: string | null;
  discord: string | null;
  email: string | null;
  url: string | null;
  note: string | null;
  owner_id: string | null;
  /** 最後に連絡した日(YYYY-MM-DD)。null = まだ一度も */
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  name: string;
  kind?: ContactKind;
  status?: ContactStatus;
  handle?: string | null;
  discord?: string | null;
  email?: string | null;
  url?: string | null;
  note?: string | null;
  owner_id?: string | null;
  last_contacted_at?: string | null;
}

function toDto(r: typeof schema.contacts.$inferSelect): ContactDto {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as ContactKind,
    status: r.status as ContactStatus,
    handle: r.handle,
    discord: r.discord,
    email: r.email,
    url: r.url,
    note: r.note,
    owner_id: r.ownerId,
    last_contacted_at: r.lastContactedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

/** 空文字は null にそろえる(入力欄を空にして保存 = 消す) */
function clean(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** @ や URL を貼っても、Xの ID だけを残す */
function cleanHandle(v: string | null | undefined): string | null {
  const t = clean(v);
  if (!t) return null;
  return t.replace(/^https?:\/\/(x|twitter)\.com\//i, "").replace(/^@/, "").replace(/[/?].*$/, "");
}

function assertKind(k: string): asserts k is ContactKind {
  if (!(CONTACT_KIND as readonly string[]).includes(k)) throw new Error(`invalid kind: ${k}`);
}
function assertStatus(s: string): asserts s is ContactStatus {
  if (!(CONTACT_STATUS as readonly string[]).includes(s)) throw new Error(`invalid status: ${s}`);
}

/** 新しいものが上。段階ごとの並べ替えは画面側でやる。 */
export async function listContacts(): Promise<ContactDto[]> {
  const rows = await getDb().select().from(schema.contacts).orderBy(desc(schema.contacts.createdAt));
  return rows.map(toDto);
}

export async function getContact(id: string): Promise<ContactDto | null> {
  const r = (await getDb().select().from(schema.contacts).where(eq(schema.contacts.id, id)))[0];
  return r ? toDto(r) : null;
}

export async function createContact(input: ContactInput, actor: Actor): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("name is required");
  const kind = input.kind ?? "user";
  const status = input.status ?? "candidate";
  assertKind(kind);
  assertStatus(status);

  const id = newId("ct");
  const now = nowIso();
  await getDb().insert(schema.contacts).values({
    id,
    name,
    kind,
    status,
    handle: cleanHandle(input.handle),
    discord: clean(input.discord),
    email: clean(input.email),
    url: clean(input.url),
    note: clean(input.note),
    ownerId: input.owner_id ?? actor.id ?? null,
    lastContactedAt: clean(input.last_contacted_at),
    createdAt: now,
    updatedAt: now,
  });
  await logActivity(actor, "contact", id, "created", { after: name });
  return id;
}

export async function updateContact(id: string, patch: Partial<ContactInput>, actor: Actor): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)))[0];
  if (!before) throw new Error(`contact not found: ${id}`);

  const set: Partial<typeof schema.contacts.$inferInsert> = { updatedAt: nowIso() };
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new Error("name is required");
    set.name = n;
  }
  if (patch.kind !== undefined) {
    assertKind(patch.kind);
    set.kind = patch.kind;
  }
  if (patch.status !== undefined) {
    assertStatus(patch.status);
    set.status = patch.status;
    // 声をかけた・返事待ちになった = その日に連絡した、と見なす(手で上書きもできる)
    if (
      patch.last_contacted_at === undefined &&
      (patch.status === "contacted" || patch.status === "waiting") &&
      before.status !== patch.status
    ) {
      set.lastContactedAt = nowIso().slice(0, 10);
    }
  }
  if (patch.handle !== undefined) set.handle = cleanHandle(patch.handle);
  if (patch.discord !== undefined) set.discord = clean(patch.discord);
  if (patch.email !== undefined) set.email = clean(patch.email);
  if (patch.url !== undefined) set.url = clean(patch.url);
  if (patch.note !== undefined) set.note = clean(patch.note);
  if (patch.owner_id !== undefined) set.ownerId = patch.owner_id;
  if (patch.last_contacted_at !== undefined) set.lastContactedAt = clean(patch.last_contacted_at);

  await db.update(schema.contacts).set(set).where(eq(schema.contacts.id, id));

  if (patch.status !== undefined && patch.status !== before.status) {
    await logActivity(actor, "contact", id, "status_changed", { before: before.status, after: patch.status });
  }
}

export async function deleteContact(id: string, actor: Actor): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)))[0];
  if (!before) return;
  await db.delete(schema.contacts).where(eq(schema.contacts.id, id));
  await logActivity(actor, "contact", id, "deleted", { before: before.name });
}
