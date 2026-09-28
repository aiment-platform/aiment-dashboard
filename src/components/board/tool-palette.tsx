"use client";

import { cn } from "@/lib/utils";

export type Tool = "select" | "note" | "line" | "pen" | "section";

const TOOLS: { id: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  {
    id: "select",
    label: "選ぶ・動かす",
    key: "V",
    icon: <path d="M5 3l14 8-6.5 1.5L9 19 5 3z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  },
  {
    id: "note",
    label: "メモ・コメント(タスクではないもの)",
    key: "C",
    icon: <rect x="3.5" y="6.5" width="17" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.4" />,
  },
  {
    id: "line",
    label: "直線(Shift で45°ずつ)",
    key: "L",
    icon: <path d="M5 19L19 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  },
  {
    id: "pen",
    label: "ペン",
    key: "P",
    icon: <path d="M4 17c3-6 5 2 8-3s4-7 8-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  },
  {
    id: "section",
    label: "セクションで囲う",
    key: "S",
    icon: (
      <>
        <rect x="3.5" y="7" width="17" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="3.5" y="3.5" width="8" height="3" rx="1" fill="currentColor" />
      </>
    ),
  },
];

/** 盤の左に縦に並ぶ道具。押す or キー(V N L P S)で切り替える */
export function ToolPalette({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <div
      className="brick absolute left-6 top-1/2 z-40 flex select-none -translate-y-1/2 flex-col gap-1 rounded-[14px] border-2 border-[rgba(20,22,28,0.12)] bg-white p-1"
      style={{ "--depth-x": "0px", "--depth-y": "4px", "--depth-color": "rgba(20,22,28,0.16)" } as React.CSSProperties}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="tool-palette"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onTool(t.id)}
          className={cn(
            "grid size-9 place-items-center rounded-[10px]",
            tool === t.id ? "bg-[var(--color-toy-purple)] text-white" : "text-foreground/70 hover:bg-secondary",
          )}
          title={`${t.label}  ${t.key}`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          data-testid={`tool-${t.id}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            {t.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
