"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPeriodAction } from "@/app/actions";
import { isComposing } from "@/lib/utils";

/** 期間がひとつも無いときの最初の一歩。ピルと同じ形で「これが目標だ」と教える。 */
export function FirstPeriod() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const inMonth = new Date(today.getTime() + 30 * 86_400_000);

  return (
    <div className="paper-dots fixed inset-0 grid place-items-center">
      <form
        className="w-[520px]"
        // 変換中の Enter でフォームが送信されないようにする
        onKeyDown={(e) => {
          if (e.key === "Enter" && isComposing(e)) e.preventDefault();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const id = await createPeriodAction({
              title: String(f.get("title") ?? "").trim() || "さいしょの期間",
              start_date: String(f.get("start") ?? "") || null,
              end_date: String(f.get("end") ?? "") || null,
            });
            router.push(`/?p=${id}`);
          });
        }}
      >
        <div
          className="brick flex flex-col items-center gap-2 rounded-[44px] border-[4px] border-[var(--color-toy-purple)] bg-white px-10 py-7"
          style={{ "--depth-x": "0px", "--depth-y": "8px", "--depth-color": "rgba(108,75,244,0.42)" } as React.CSSProperties}
        >
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground">
            この きかんは なにに むかう？
          </p>
          <input
            name="title"
            autoFocus
            placeholder="例: VTuber、ユーザー確保フェーズ"
            className="inset-field w-full rounded-[12px] px-4 py-2.5 text-center text-[20px] font-bold"
          />
          <div className="flex items-center gap-2">
            <input name="start" type="date" defaultValue={iso(today)} className="inset-field num rounded-[9px] px-2.5 py-1.5 text-[13px] font-bold" />
            <span className="text-[13px] font-bold text-muted-foreground">~</span>
            <input name="end" type="date" defaultValue={iso(inMonth)} className="inset-field num rounded-[9px] px-2.5 py-1.5 text-[13px] font-bold" />
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="brick brick-press mx-auto mt-6 block rounded-[14px] bg-[var(--color-toy-purple)] px-8 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
          style={{ "--depth-color": "#4a2fc4" } as React.CSSProperties}
        >
          はじめる
        </button>
      </form>
    </div>
  );
}
