import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import {
  CONTACT_CHANNEL,
  CONTACT_KIND,
  CONTACT_STATUS,
  type ContactChannel,
  type ContactKind,
  type ContactStatus,
} from "@/lib/constants";
import { valueAs } from "@/lib/contacts-ui";
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
  /** 連絡手段(タグ)。並び順どおり */
  links: ContactLinkDto[];
  /** 一言。閉じていても見える短い説明 */
  summary: string | null;
  /** 詳細。開いたときに見える長文 */
  note: string | null;
  owner_id: string | null;
  /** 最後に連絡した日(YYYY-MM-DD)。null = まだ一度も */
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactLinkDto {
  id: string;
  channel: ContactChannel;
  value: string;
}

export interface ContactInput {
  name: string;
  kind?: ContactKind;
  status?: ContactStatus;
  summary?: string | null;
  note?: string | null;
  owner_id?: string | null;
  last_contacted_at?: string | null;
}

function toDto(r: typeof schema.contacts.$inferSelect, links: ContactLinkDto[] = []): ContactDto {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as ContactKind,
    status: r.status as ContactStatus,
    links,
    summary: r.summary,
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

function assertKind(k: string): asserts k is ContactKind {
  if (!(CONTACT_KIND as readonly string[]).includes(k)) throw new Error(`invalid kind: ${k}`);
}
function assertChannel(c: string): asserts c is ContactChannel {
  if (!(CONTACT_CHANNEL as readonly string[]).includes(c)) throw new Error(`invalid channel: ${c}`);
}

function assertStatus(s: string): asserts s is ContactStatus {
  if (!(CONTACT_STATUS as readonly string[]).includes(s)) throw new Error(`invalid status: ${s}`);
}

/** 連絡先ID → 連絡手段の一覧 */
async function linksOf(ids: string[] | "all"): Promise<Map<string, ContactLinkDto[]>> {
  const db = getDb();
  if (ids !== "all" && ids.length === 0) return new Map();
  const rows =
    ids === "all"
      ? await db.select().from(schema.contactLinks)
      : await db.select().from(schema.contactLinks).where(inArray(schema.contactLinks.contactId, ids));
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, ContactLinkDto[]>();
  for (const l of rows) {
    const list = map.get(l.contactId) ?? [];
    list.push({ id: l.id, channel: l.channel as ContactChannel, value: l.value });
    map.set(l.contactId, list);
  }
  return map;
}

/** 新しいものが上。段階ごとの並べ替えは画面側でやる。 */
export async function listContacts(): Promise<ContactDto[]> {
  // 連絡先と連絡手段は互いを待たないので同時に聞く
  const [rows, links] = await Promise.all([
    getDb().select().from(schema.contacts).orderBy(desc(schema.contacts.createdAt)),
    linksOf("all"),
  ]);
  return rows.map((r) => toDto(r, links.get(r.id) ?? []));
}

export async function getContact(id: string): Promise<ContactDto | null> {
  const [rows, links] = await Promise.all([
    getDb().select().from(schema.contacts).where(eq(schema.contacts.id, id)),
    linksOf([id]),
  ]);
  return rows[0] ? toDto(rows[0], links.get(id) ?? []) : null;
}

export async function createContact(
  input: ContactInput & { links?: { channel: ContactChannel; value: string }[] },
  actor: Actor,
): Promise<string> {
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
    summary: clean(input.summary),
    note: clean(input.note),
    ownerId: input.owner_id ?? actor.id ?? null,
    lastContactedAt: clean(input.last_contacted_at),
    createdAt: now,
    updatedAt: now,
  });
  for (const l of input.links ?? []) await addContactLink(id, l.channel, l.value, actor);
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
  if (patch.summary !== undefined) set.summary = clean(patch.summary);
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
  await db.delete(schema.contactLinks).where(eq(schema.contactLinks.contactId, id));
  await db.delete(schema.contacts).where(eq(schema.contacts.id, id));
  await logActivity(actor, "contact", id, "deleted", { before: before.name });
}

// ---- 連絡手段(タグ) ------------------------------------------------------------

/**
 * 連絡手段を1つ足す。値はその種類の形に整える(X の URL → ID など)。
 * **値は空でもよい**(「Instagram でつながっている」ことだけ先に付けて、ID はあとで入れる)。
 */
export async function addContactLink(
  contactId: string,
  channel: string,
  value: string,
  actor: Actor,
): Promise<string> {
  assertChannel(channel);
  const v = valueAs(channel, value ?? "");
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.contactLinks)
    .where(eq(schema.contactLinks.contactId, contactId))
    .orderBy(asc(schema.contactLinks.sortOrder));
  const id = newId("cl");
  await db.insert(schema.contactLinks).values({
    id,
    contactId,
    channel,
    value: v,
    sortOrder: (existing.at(-1)?.sortOrder ?? -1) + 1,
    createdAt: nowIso(),
  });
  await touch(contactId);
  await logActivity(actor, "contact", contactId, "link_added", { after: `${channel}:${v}` });
  return id;
}

/** 連絡手段の種類や値を変える */
export async function updateContactLink(
  linkId: string,
  patch: { channel?: string; value?: string },
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(schema.contactLinks).where(eq(schema.contactLinks.id, linkId)))[0];
  if (!before) throw new Error(`link not found: ${linkId}`);
  const channel = patch.channel ?? before.channel;
  assertChannel(channel);
  // 空にしても消さない(タグだけ残る)。消すのは × から
  const value = valueAs(channel, patch.value ?? before.value);
  await db.update(schema.contactLinks).set({ channel, value }).where(eq(schema.contactLinks.id, linkId));
  await touch(before.contactId);
  await logActivity(actor, "contact", before.contactId, "link_updated", {
    before: `${before.channel}:${before.value}`,
    after: `${channel}:${value}`,
  });
}

export async function removeContactLink(linkId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(schema.contactLinks).where(eq(schema.contactLinks.id, linkId)))[0];
  if (!before) return;
  await db.delete(schema.contactLinks).where(eq(schema.contactLinks.id, linkId));
  await touch(before.contactId);
  await logActivity(actor, "contact", before.contactId, "link_removed", { before: `${before.channel}:${before.value}` });
}

async function touch(contactId: string) {
  await getDb().update(schema.contacts).set({ updatedAt: nowIso() }).where(eq(schema.contacts.id, contactId));
}
