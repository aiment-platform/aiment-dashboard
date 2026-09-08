import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCOUNT_COOKIE, ACCOUNTS } from "@/lib/accounts";

/**
 * 最初に出るアカウント選択。
 * 「誰として書くか」を決めるだけの画面です(パスワードもログインもありません —
 * ここに来られる時点で、Vercel 側の許可メールアドレスを通っています)。
 */
export default async function WhoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  async function choose(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!ACCOUNTS.some((a) => a.id === id)) return;
    const jar = await cookies();
    jar.set(ACCOUNT_COOKIE, id, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
    redirect(String(formData.get("next") || "/"));
  }

  return (
    <div className="paper-dots fixed inset-0 grid place-items-center">
      <div className="w-[560px] text-center">
        <p className="text-[11px] font-bold tracking-wider text-muted-foreground">aiment</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">だれとして書く？</h1>
        <p className="mt-2 text-[12px] font-bold leading-5 text-muted-foreground">
          積み木の担当者アイコンは、選んだ人の色になります。
          <br />
          あとから左上でいつでも変えられます。
        </p>

        <div className="mt-8 flex justify-center gap-3">
          {ACCOUNTS.map((a) => (
            <form key={a.id} action={choose}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="next" value={next ?? "/"} />
              <button
                type="submit"
                className="brick brick-press flex w-[160px] flex-col items-center gap-3 rounded-[20px] border-2 border-[rgba(20,22,28,0.12)] bg-white px-4 py-6"
                style={
                  {
                    "--depth-x": "0px",
                    "--depth-y": "6px",
                    "--depth-color": "rgba(20,22,28,0.2)",
                  } as React.CSSProperties
                }
                data-testid={`account-${a.id}`}
              >
                <span
                  className="brick grid size-[52px] place-items-center rounded-[14px] text-[20px] font-bold text-white"
                  style={
                    {
                      background: a.color,
                      "--depth-x": "0px",
                      "--depth-y": "4px",
                      "--depth-color": `color-mix(in srgb, ${a.color} 74%, #000)`,
                    } as React.CSSProperties
                  }
                >
                  {a.name.slice(0, 1)}
                </span>
                <span className="text-[15px] font-bold">{a.name}</span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
