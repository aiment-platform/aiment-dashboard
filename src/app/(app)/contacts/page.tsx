import { listContacts } from "@/lib/services/contacts";
import { listMembers } from "@/lib/services/members";
import { CONTACT_CHANNEL, CONTACT_KIND, type ContactChannel, type ContactKind, type ContactStatus } from "@/lib/constants";
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
  searchParams: Promise<{ kind?: string; via?: string; q?: string }>;
}) {
  const { kind: rawKind, via: rawVia, q } = await searchParams;
  const kind = (CONTACT_KIND as readonly string[]).includes(rawKind ?? "") ? (rawKind as ContactKind) : null;
  // 連絡手段での絞り込み(?via=instagram など)。その手段を持っている人だけ
  const via = (CONTACT_CHANNEL as readonly string[]).includes(rawVia ?? "") ? (rawVia as ContactChannel) : null;
  const [all, members] = await Promise.all([listContacts(), listMembers()]);
  const active = members.filter((m) => m.is_active).map((m) => ({ id: m.id, name: m.name }));

  const needle = (q ?? "").trim().toLowerCase();
  const shown = all.filter((c) => {
    if (kind && c.kind !== kind) return false;
    if (via && !c.links.some((l) => l.channel === via)) return false;
    if (needle) {
      const hay = [c.name, c.summary, c.note, ...c.links.map((l) => l.value)].filter(Boolean).join(" ").toLowerCase();
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
  // 連絡手段ごとの人数(いま開いている種類タブの中で数える)。0人の手段は出さない
  const inKind = all.filter((c) => !kind || c.kind === kind);
  const viaCounts = CONTACT_CHANNEL.map((ch) => ({
    channel: ch,
    n: inKind.filter((c) => c.links.some((l) => l.channel === ch)).length,
  })).filter((x) => x.n > 0 || x.channel === via);
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

      <ContactTabs kind={kind} via={via} viaCounts={viaCounts} q={q ?? ""} counts={counts} />

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
        名前・一言・連絡手段は押すとその場で書きかえ、担当のマークを押すと担当を選べます。▾ か行の空いている所で開くと、一言と詳細メモの欄が出ます。
        右の札から段階を変えると、「声かけ済み」「返事待ち」にした日が
        <strong className="font-bold">最後に連絡した日</strong>として自動で入ります。
      </p>
    </div>
  );
}
