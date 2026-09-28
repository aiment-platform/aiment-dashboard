"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createPeriodAction, deletePeriodAction, updatePeriodAction } from "@/app/actions";
import { neighbourPeriod, periodRangeLabel } from "@/lib/whiteboard";
import type { PeriodSummary } from "@/lib/services/periods";
import { cn, isComposing } from "@/lib/utils";
import { isActivePane } from "@/components/board/active-pane";
import type { PaneInfo } from "@/components/board/whiteboard";

/**
 * 画面のいちばん上にある「いまの期間は何に向かっているのか」。
 * 左右の矢印で前後の期間へ、ピルを押すと期間そのものを編集できる。
 * 期間は自由に決められる(月に縛られない) — 開始日と終了日をただ持つだけ。
 */

function Arrow({
  dir,
  target,
  onGo,
  small,
}: {
  dir: -1 | 1;
  target: PeriodSummary | null;
  onGo: (id: string) => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("arrow-btn grid shrink-0 place-items-center", small ? "size-8" : "size-12")}
      disabled={!target}
      onClick={() => target && onGo(target.id)}
      title={target ? target.title : dir < 0 ? "これがいちばん最初の期間" : "これがいちばん最後の期間"}
      aria-label={dir < 0 ? "前の期間へ" : "次の期間へ"}
      data-testid={dir < 0 ? "period-prev" : "period-next"}
    >
      <svg width={small ? 22 : 34} height={small ? 22 : 34} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold tracking-wider text-muted-foreground">
        {label}
      </span>
      <input {...props} className="inset-field w-full rounded-[9px] px-2.5 py-1.5 text-[13px] font-bold" />
    </label>
  );
}

export function PeriodPill({
  period,
  siblings,
  pane,
}: {
  period: PeriodSummary;
  siblings: PeriodSummary[];
  /** 分割画面の1枚として置かれているとき。移動はその枠だけを差し替える */
  pane?: PaneInfo;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const prev = neighbourPeriod(siblings, period.id, -1);
  const next = neighbourPeriod(siblings, period.id, 1);

  const go = (id: string) => (pane ? pane.onNavigate(id) : router.push(`/?p=${id}`));
  // 並べているときは小さく。1枚だけのときは今までどおり大きく
  const compact = Boolean(pane && pane.count > 1);

  // ← → キーでも期間を移動できる(文字入力中は除く)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 並べているときは、最後に触った枠だけが動く
      if (pane && !isActivePane(pane.id)) return;
      if (e.key === "ArrowLeft" && prev) go(prev.id);
      if (e.key === "ArrowRight" && next) go(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev?.id, next?.id, pane?.id, pane?.onNavigate]);

  return (
    <div
      className={cn(
        "pointer-events-none inset-x-0 top-0 z-40 flex justify-center",
        pane ? "absolute" : "fixed",
        // 左端の枠は、左上の名前・一覧・連絡先のボタンと重ならないよう一段下げる
        compact ? (pane?.index === 0 ? "pt-[104px]" : "pt-4") : "pt-7",
      )}
    >
      <div className={cn("pointer-events-auto flex items-center", compact ? "gap-1.5" : "gap-4")}>
        <Arrow dir={-1} target={prev} onGo={go} small={compact} />

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "brick brick-press flex flex-col items-center rounded-full border-[var(--color-toy-purple)] bg-white",
                compact
                  ? "min-w-[200px] max-w-[360px] border-[3px] px-7 py-2"
                  : "min-w-[520px] max-w-[820px] border-[4px] px-14 py-4",
              )}
              style={
                {
                  "--depth-x": "0px",
                  "--depth-y": "8px",
                  "--depth-color": "rgba(108,75,244,0.42)",
                } as React.CSSProperties
              }
              title="押すと期間を編集"
              data-testid="period-pill"
            >
              <span
                className={cn("max-w-full truncate font-bold leading-tight tracking-tight", compact ? "text-[17px]" : "text-[30px]")}
                data-testid="period-title"
              >
                {period.title}
              </span>
              <span className={cn("num font-bold text-foreground/85", compact ? "text-[11px]" : "text-[13px]")} data-testid="period-range">
                {periodRangeLabel(period.start_date, period.end_date)}
              </span>
            </button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[320px] rounded-[18px] border-2 border-[rgba(20,22,28,0.14)] p-4"
            sideOffset={12}
          >
            <form
              className="space-y-2.5"
              // 変換中の Enter でフォームが送信されないようにする
              onKeyDown={(e) => {
                if (e.key === "Enter" && isComposing(e)) e.preventDefault();
              }}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                start(async () => {
                  await updatePeriodAction(period.id, {
                    title: String(f.get("title") ?? "").trim() || period.title,
                    start_date: String(f.get("start") ?? "") || null,
                    end_date: String(f.get("end") ?? "") || null,
                  });
                  setOpen(false);
                });
              }}
            >
              <Field label="このきかんの目標" name="title" defaultValue={period.title} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="はじまり" name="start" type="date" defaultValue={period.start_date ?? ""} />
                <Field label="おわり" name="end" type="date" defaultValue={period.end_date ?? ""} />
              </div>
              <button
                type="submit"
                className="brick brick-press w-full rounded-[10px] bg-[var(--color-toy-purple)] py-2 text-[13px] font-bold text-white"
                style={{ "--depth-color": "#4a2fc4" } as React.CSSProperties}
              >
                保存
              </button>
            </form>

            <div className="my-3 h-px bg-border" />

            <p className="mb-1.5 text-[10px] font-bold tracking-wider text-muted-foreground">
              きかんを えらぶ
            </p>
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
              {siblings.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    go(p.id);
                  }}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-[9px] px-2 py-1.5 text-left hover:bg-accent",
                    p.id === period.id && "bg-accent",
                  )}
                >
                  <span className="flex-1 truncate text-[12.5px] font-bold">{p.title}</span>
                  {p.is_now && (
                    <span className="shrink-0 rounded-full bg-[var(--color-toy-purple)] px-1.5 text-[9px] font-bold text-white">
                      いま
                    </span>
                  )}
                  <span className="num shrink-0 text-[10px] text-muted-foreground">
                    {periodRangeLabel(p.start_date, p.end_date)}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="brick brick-press flex-1 rounded-[10px] bg-secondary py-1.5 text-[12px] font-bold"
                style={{ "--depth-color": "rgba(20,22,28,0.16)" } as React.CSSProperties}
                onClick={() =>
                  start(async () => {
                    const id = await createPeriodAction({
                      title: "あたらしい期間",
                      start_date: null,
                      end_date: null,
                    });
                    setOpen(false);
                    go(id);
                  })
                }
                data-testid="period-new"
              >
                ＋ あたらしい期間
              </button>
              {siblings.length > 1 && (
                <button
                  type="button"
                  className="rounded-[10px] px-2.5 text-[12px] font-bold text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    start(async () => {
                      await deletePeriodAction(period.id);
                      setOpen(false);
                      const fallback = next ?? prev;
                      if (fallback) go(fallback.id);
                      else router.push("/");
                    })
                  }
                >
                  片づける
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Arrow dir={1} target={next} onGo={go} small={compact} />

        {pane?.onClose && (
          <button
            type="button"
            className="ml-1 grid size-8 place-items-center rounded-full bg-white/80 text-muted-foreground shadow-sm hover:text-destructive"
            onClick={pane.onClose}
            title="この画面を閉じる"
            aria-label="この画面を閉じる"
            data-testid="pane-close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
