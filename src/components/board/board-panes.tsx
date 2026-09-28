"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { SharedHistory, Whiteboard, type WhiteboardProps } from "@/components/board/whiteboard";
import { CrossPaneLinks } from "@/components/board/cross-pane-links";
import { neighbourPeriod } from "@/lib/whiteboard";
import { useActivePaneId } from "@/components/board/active-pane";
import { cn } from "@/lib/utils";
import type { PeriodBoard } from "@/lib/services/periods";

/**
 * 盤を1枚、または左右に並べて出す。
 *
 * URL が「いま何を並べているか」の唯一の記録: `/?p=A&p=B` なら A と B を並べる。
 * だからリロードしても、URL を相方に送っても同じ並びが開く。
 *
 * それぞれの枠は**自分のカメラ(位置・拡大率)を持つ**ので、別々に動かせる。
 * 枠をまたぐ依存の矢印だけは、どの枠にも属さないので {@link CrossPaneLinks} が上から描く。
 */

/** これ以上並べると1枚が細くなりすぎて使えない */
const MAX_PANES = 3;

type Shared = Omit<WhiteboardProps, "period" | "siblings" | "blocks" | "items" | "links" | "outside" | "pane" | "onSplit">;

export function BoardPanes({ boards, shared }: { boards: PeriodBoard[]; shared: Shared }) {
  const router = useRouter();
  const ids = useMemo(() => boards.map((b) => b.period.id), [boards]);
  const siblings = boards[0].siblings;
  const activePane = useActivePaneId();

  const goTo = useCallback(
    (next: string[]) => router.push(`/?${next.map((id) => `p=${encodeURIComponent(id)}`).join("&")}`),
    [router],
  );

  /**
   * 右端の期間の「次」を右に足す。次が無ければ左端の「前」を左に足す(時間の順に並ぶように)。
   * どちらも無ければ、まだ出ていない期間を右に。
   */
  const split = () => {
    const next = neighbourPeriod(siblings, ids[ids.length - 1], 1);
    if (next && !ids.includes(next.id)) return goTo([...ids, next.id]);
    const prev = neighbourPeriod(siblings, ids[0], -1);
    if (prev && !ids.includes(prev.id)) return goTo([prev.id, ...ids]);
    const rest = siblings.find((p) => !ids.includes(p.id));
    goTo([...ids, rest?.id ?? ids[ids.length - 1]]);
  };

  const canSplit = ids.length < MAX_PANES && siblings.length > 0;

  if (boards.length === 1) {
    const b = boards[0];
    return (
      <Whiteboard
        key={b.period.id}
        {...shared}
        period={b.period}
        siblings={b.siblings}
        blocks={b.blocks}
        items={b.items}
        links={b.links}
        outside={b.outside}
        onSplit={canSplit ? split : undefined}
      />
    );
  }

  return (
    <SharedHistory>
      <div className="fixed inset-0 flex" data-testid="split-view">
        {boards.map((b, index) => (
          <div
            key={`${index}:${b.period.id}`}
            className={cn(
              "relative h-full min-w-0 flex-1 overflow-hidden border-l-[3px] border-[rgba(20,22,28,0.14)] first:border-l-0",
              // いまキーを受けている枠は、上のふちを紫にして分かるようにする
              "after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:z-50 after:h-[4px] after:transition-colors",
              (activePane ?? "pane-0") === `pane-${index}` ? "after:bg-[var(--color-toy-purple)]" : "after:bg-transparent",
            )}
            data-pane={b.period.id}
            data-pane-index={index}
          >
            <Whiteboard
              {...shared}
              period={b.period}
              siblings={b.siblings}
              blocks={b.blocks}
              items={b.items}
              links={b.links}
              outside={b.outside}
              onSplit={canSplit && index === boards.length - 1 ? split : undefined}
              pane={{
                id: `pane-${index}`,
                index,
                count: boards.length,
                periods: ids,
                onNavigate: (periodId) => goTo(ids.map((id, i) => (i === index ? periodId : id))),
                onClose: () => goTo(ids.filter((_, i) => i !== index)),
              }}
            />
          </div>
        ))}
      </div>
      <CrossPaneLinks boards={boards} />
    </SharedHistory>
  );
}
