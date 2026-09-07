import { listWork } from "@/lib/services/periods";
import { listMembers } from "@/lib/services/members";
import { MemberSquare } from "@/components/member-square";
import { WorkRow } from "@/components/work-row";

/**
 * 一覧 — 盤を横断して「いま誰が何を持っているか」だけを見る画面。
 * 盤と同じ語彙(期間 / 積み木 / サブタスク)と同じ色で並べる。
 */
export default async function WorkListPage() {
  const [work, members] = await Promise.all([listWork(), listMembers()]);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;

  const open = work.filter((w) => !w.done);
  const done = work.filter((w) => w.done).slice(0, 12);
  const active = members.filter((m) => m.is_active);

  const groups = active
    .map((m) => ({
      member: m,
      items: open
        .filter((w) => w.owner_id === m.id)
        .sort((a, b) => {
          if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
          if (a.kind !== b.kind) return a.kind === "block" ? -1 : 1;
          return (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1;
        }),
    }))
    .filter((g) => g.items.length > 0);
  const orphan = open.filter((w) => !active.some((m) => m.id === w.owner_id));

  const heading = "mb-2 flex items-center gap-2 text-[12px] font-bold";

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-[26px] font-bold tracking-tight">一覧</h1>
        <p className="text-[11px] font-bold text-muted-foreground">
          <span className="num">{open.length}</span> 件のこっています
        </p>
      </header>

      {groups.map(({ member, items }) => (
        <section key={member.id}>
          <p className={heading}>
            <MemberSquare id={member.id} name={member.name} size={20} />
            {member.name}
            <span className="num font-normal text-muted-foreground">{items.length}件</span>
          </p>
          <div className="space-y-1.5">
            {items.map((w) => (
              <WorkRow key={`${w.kind}:${w.id}`} item={w} ownerName={nameOf(w.owner_id)} />
            ))}
          </div>
        </section>
      ))}

      {orphan.length > 0 && (
        <section>
          <p className={heading}>担当者なし</p>
          <div className="space-y-1.5">
            {orphan.map((w) => (
              <WorkRow key={`${w.kind}:${w.id}`} item={w} ownerName={null} />
            ))}
          </div>
        </section>
      )}

      {open.length === 0 && (
        <p className="text-[13px] font-bold text-muted-foreground">
          のこっているものはありません。盤で積み木を置くとここに出ます。
        </p>
      )}

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[12px] font-bold text-muted-foreground">
            さいきん できたもの（{done.length}）
          </summary>
          <div className="mt-2 space-y-1.5">
            {done.map((w) => (
              <WorkRow key={`${w.kind}:${w.id}`} item={w} ownerName={nameOf(w.owner_id)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
