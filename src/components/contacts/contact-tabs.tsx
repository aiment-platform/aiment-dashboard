"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ContactChannel, ContactKind } from "@/lib/constants";
import { ADDRESS_LABEL, KIND_COLOR, KIND_LABEL } from "@/lib/contacts-ui";
import { cn } from "@/lib/utils";

/**
 * 上のタブ: すべて / VTuber / ユーザー / その他。右に検索。
 * どのタブを見ているかは URL(?kind=)に持つ — 共有できて、戻るで戻れる。
 */
const TABS: (ContactKind | null)[] = [null, "vtuber", "user", "other"];

export function ContactTabs({
  kind,
  via,
  viaCounts,
  q,
  counts,
}: {
  kind: ContactKind | null;
  /** 連絡手段での絞り込み */
  via: ContactChannel | null;
  viaCounts: { channel: ContactChannel; n: number }[];
  q: string;
  counts: Record<ContactKind, number> & { all: number };
}) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `/contacts?${qs}` : "/contacts");
  };

  const depth = { "--depth-x": "0px", "--depth-y": "3px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties;

  return (
    <div className="space-y-2">
    <div className="flex items-center gap-1.5">
      {TABS.map((t) => {
        const active = kind === t;
        const n = t ? counts[t] : counts.all;
        return (
          <button
            key={t ?? "all"}
            type="button"
            onClick={() => go({ kind: t })}
            className={cn(
              "brick brick-press flex h-9 items-center gap-1.5 rounded-[11px] px-3 text-[13px] font-bold",
              active ? "text-white" : "bg-white",
            )}
            style={{ ...depth, ...(active ? { background: t ? KIND_COLOR[t] : "#14161c" } : {}) }}
            aria-pressed={active}
            data-testid={`tab-${t ?? "all"}`}
          >
            {t ? KIND_LABEL[t] : "すべて"}
            <span className={cn("num text-[11px]", active ? "opacity-80" : "text-muted-foreground")}>{n}</span>
          </button>
        );
      })}
      <input
        defaultValue={q}
        placeholder="さがす"
        className="ml-auto h-9 w-[160px] rounded-[11px] border-2 border-[rgba(20,22,28,0.12)] bg-white px-3 text-[12px] font-bold outline-none focus:border-[var(--color-toy-purple)]"
        onKeyDown={(e) => e.key === "Enter" && go({ q: (e.target as HTMLInputElement).value || null })}
        onBlur={(e) => go({ q: e.target.value || null })}
        data-testid="contact-search"
      />
    </div>

    {/* 連絡手段で絞る。持っている人がいる手段だけ出す */}
    {viaCounts.length > 0 && (
      <div className="flex flex-wrap items-center gap-1" data-testid="via-filter">
        <span className="mr-1 text-[10.5px] font-bold text-muted-foreground">連絡手段</span>
        {viaCounts.map(({ channel, n }) => {
          const on = via === channel;
          return (
            <button
              key={channel}
              type="button"
              onClick={() => go({ via: on ? null : channel })}
              className={cn(
                "rounded-[8px] border-2 px-2 py-0.5 text-[11px] font-bold",
                on
                  ? "border-transparent bg-[var(--color-toy-purple)] text-white"
                  : "border-[rgba(20,22,28,0.12)] bg-white text-muted-foreground hover:border-[var(--color-toy-purple)]",
              )}
              aria-pressed={on}
              data-testid={`via-${channel}`}
            >
              {ADDRESS_LABEL[channel]} <span className="num opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
    )}
    </div>
  );
}
