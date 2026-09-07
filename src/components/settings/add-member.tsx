"use client";

import { useState, useTransition } from "react";
import { createMemberAction } from "@/app/actions";

export function AddMember() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名前"
        className="inset-field h-9 w-40 rounded-[9px] px-2.5 text-[13px] font-bold"
      />
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="役割（任意）"
        className="inset-field h-9 w-40 rounded-[9px] px-2.5 text-[13px] font-bold"
      />
      <button
        type="button"
        disabled={pending || !name.trim()}
        onClick={() =>
          startTransition(async () => {
            await createMemberAction(name, role);
            setName("");
            setRole("");
          })
        }
        style={{ "--depth-x": "0px", "--depth-y": "3px", "--depth-color": "#4a2fc4" } as React.CSSProperties}
        className="brick brick-press h-9 rounded-[10px] bg-[var(--color-toy-purple)] px-3.5 text-[12px] font-bold text-white disabled:opacity-50"
      >
        メンバー追加
      </button>
    </div>
  );
}
