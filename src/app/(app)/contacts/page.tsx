import { listContacts } from "@/lib/services/contacts";
import { listMembers } from "@/lib/services/members";
import { CONTACT_KIND, type ContactKind, type ContactStatus } from "@/lib/constants";
import { STATUS_LABEL } from "@/lib/contacts-ui";
import { AddContact } from "@/components/contacts/add-contact";
import { ContactRow } from "@/components/contacts/contact-row";
import { ContactTabs } from "@/components/contacts/contact-tabs";

/**
 * 連絡先 — 協力してくれるユーザーさん・VTuberさんの名簿。
 *
 * 並びは「段階」順。いちばん上が **返事待ち**(相手のボール、忘れやすい)、
 * 次に 声かけ済み → 候補 → 協力中 → 見送り。
 * 「いま自分が動くべき人」が上に来るようにしてある。
 */
const ORDER: ContactStatus[] = ["waiting", "contacted", "candidate", "active", "passed"];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const { kind: rawKind, q } = await searchParams;
  const kind = (CONTACT_KIND as readonly string[]).includes(rawKind ?? "") ? (rawKind as ContactKind) : null;
  const [all, members] = await Promise.all([listContacts(), listMembers()]);
  const active = members.filter((m) => m.is_active).map((m) => ({ id: m.id, name: m.name }));

  const needle = (q ?? "").trim().toLowerCase();
  const shown = all.filter((c) => {
    if (kind && c.kind !== kind) return false;
    if (needle) {
      const hay = [c.name, c.handle, c.discord, c.email, c.note].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const groups = ORDER.map((s) => ({ status: s, items: shown.filter((c) => c.status === s) })).filter(
    (g) => g.items.length > 0,
  );

  const counts = {
    all: all.length,
    ...(Object.fromEntries(CONTACT_KIND.map((k) => [k, all.filter((c) => c.kind === k).length])) as Record<ContactKind, number>),
  };
  const activeCount = all.filter((c) => c.status === "active").length;
  const waitingCount = all.filter((c) => c.status === "waiting").length;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-[26px] font-bold tracking-tight">連絡先</h1>
        <p className="text-[11px] font-bold text-muted-foreground">
          協力中 <span className="num">{activeCount}</span> ・ 返事待ち <span className="num">{waitingCount}</span>
        </p>
      </header>

      <ContactTabs kind={kind} q={q ?? ""} counts={counts} />

      <AddContact fixedKind={kind} />

      {groups.length === 0 && (
        <p className="py-10 text-center text-[12px] font-bold text-muted-foreground">
          {all.length === 0 ? "まだ誰もいません。上の欄から足してください。" : "この条件では誰もいません。"}
        </p>
      )}

      {groups.map(({ status: s, items }) => (
        <section key={s}>
          <p className="mb-2 flex items-center gap-2 text-[12px] font-bold">
            {STATUS_LABEL[s]}
            <span className="num font-normal text-muted-foreground">{items.length}人</span>
          </p>
          <div className="space-y-1.5">
            {items.map((c) => (
              <ContactRow key={c.id} contact={c} members={active} />
            ))}
          </div>
        </section>
      ))}

      <p className="pt-4 text-[11px] leading-5 text-muted-foreground">
        名前を押すと書きかえ、担当のマークを押すと担当を選べます。▾ で開くと連絡先の追加と備考。
        右の札から段階を変えると、「声かけ済み」「返事待ち」にした日が
        <strong className="font-bold">最後に連絡した日</strong>として自動で入ります。
      </p>
    </div>
  );
}
