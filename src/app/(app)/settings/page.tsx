import Link from "next/link";
import { listMembers } from "@/lib/services/members";
import { listPeriods } from "@/lib/services/periods";
import { MemberSquare } from "@/components/member-square";
import { periodRangeLabel } from "@/lib/whiteboard";

/** 設定 — メンバー(=色)と期間の一覧、それとエージェント向けの入口。 */
export default async function SettingsPage() {
  const [members, periods] = await Promise.all([listMembers(), listPeriods()]);
  const card =
    "brick rounded-[14px] bg-white p-4";
  const depth = { "--depth-x": "0px", "--depth-y": "4px", "--depth-color": "rgba(20,22,28,0.16)" } as React.CSSProperties;

  return (
    <div className="max-w-[720px] space-y-8">
      <h1 className="text-[26px] font-bold tracking-tight">設定</h1>

      <section>
        <p className="mb-2 text-[12px] font-bold">メンバー</p>
        <div className={card} style={depth}>
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <MemberSquare id={m.id} name={m.name} size={24} />
                <span className="text-[13px] font-bold">{m.name}</span>
                {m.role && <span className="text-[11px] font-bold text-muted-foreground">{m.role}</span>}
                <span className="num ml-auto text-[10px] text-muted-foreground">{m.id}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
            使うのは <strong className="font-bold">Soya / Futo / Other</strong> の3アカウントだけです
            （<span className="num">src/lib/accounts.ts</span> に直接書いてあります）。
            四角の色も3人で必ず違うように手で決めてあるので、あとから変わりません。
            <br />
            画面の左上を押すと、書き手をいつでも切り替えられます。
            <strong className="font-bold">誰がこのページを開けるかは Vercel 側の許可メールアドレス</strong>
            が決めます（アプリ側にログインはありません）。
          </p>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[12px] font-bold">期間</p>
        <div className={card} style={depth}>
          <ul className="space-y-1">
            {periods.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/?p=${p.id}`}
                  className="flex items-baseline gap-2 rounded-[9px] px-1.5 py-1.5 hover:bg-accent"
                >
                  <span className="flex-1 truncate text-[13px] font-bold">{p.title}</span>
                  {p.is_now && (
                    <span className="rounded-full bg-[var(--color-toy-purple)] px-1.5 text-[9px] font-bold text-white">
                      いま
                    </span>
                  )}
                  <span className="num text-[11px] text-muted-foreground">
                    積み木 {p.block_count}
                  </span>
                  <span className="num text-[11px] text-muted-foreground">
                    {periodRangeLabel(p.start_date, p.end_date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
            期間の追加・名前・日付の変更は、盤の上のピルを押すとその場でできます。
          </p>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[12px] font-bold">AIエージェント向け</p>
        <div className={`${card} text-[11px] leading-5 text-muted-foreground`} style={depth}>
          <p>画面が描いているのと同じデータを、機械が読める形で出しています。</p>
          <ul className="num mt-1.5 space-y-0.5">
            <li>GET /api/v1/summary ・ /tasks ・ /blockers ・ /updates ・ /members</li>
            <li>POST /api/v1/tasks ・ POST /api/v1/updates</li>
            <li>PATCH /api/v1/milestones/[id] ・ /workstreams/[id] ・ /objectives/[id]</li>
          </ul>
          <p className="mt-1.5">
            MCPサーバー実装済み:{" "}
            <span className="num">claude mcp add aiment -- npx tsx {"<repo>"}/mcp/server.ts</span>
          </p>
          <p className="mt-1.5">
            データベースは <span className="num">data/aiment.db</span>（SQLiteファイル1個）。
            画面・REST・MCPはすべて <span className="num">src/lib/services/</span> の同じ関数を通ります。
          </p>
        </div>
      </section>
    </div>
  );
}
