"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createContactAction } from "@/app/actions";
import { CONTACT_KIND, type ContactKind } from "@/lib/constants";
import { KIND_COLOR, KIND_LABEL } from "@/lib/contacts-ui";
import { isComposing } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * 連絡先を足す欄。名前と種類だけで作れる。細かい欄はあとから行を開いて。
 * 「思いついた名前をすぐ入れられる」ことを優先している。
 */
export function AddContact({ fixedKind }: { fixedKind: ContactKind | null }) {
  const [picked, setPicked] = useState<ContactKind>("user");
  // タブで種類を見ているときは、その種類で足す(選ばせない)
  const kind = fixedKind ?? picked;
  const setKind = setPicked;
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const submit = () => {
    const name = input.current?.value.trim() ?? "";
    if (!name) return;
    start(async () => {
      try {
        await createContactAction({ name, kind });
        if (input.current) input.current.value = "";
        input.current?.focus();
      } catch {
        toast("追加できませんでした");
      }
    });
  };

  return (
    <div
      className="brick flex items-center gap-2 rounded-[12px] bg-white p-2"
      style={{ "--depth-x": "0px", "--depth-y": "4px", "--depth-color": "rgba(20,22,28,0.16)" } as React.CSSProperties}
    >
      {fixedKind ? (
        <span className="rounded-[8px] px-2 py-1 text-[11px] font-bold text-white" style={{ background: KIND_COLOR[fixedKind] }}>
          {KIND_LABEL[fixedKind]}
        </span>
      ) : (
      <div className="flex gap-1">
        {CONTACT_KIND.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "rounded-[8px] border-2 px-2 py-1 text-[11px] font-bold",
              kind === k ? "border-transparent text-white" : "border-[rgba(20,22,28,0.12)] bg-white text-muted-foreground",
            )}
            style={kind === k ? { background: KIND_COLOR[k] } : undefined}
            data-testid={`add-kind-${k}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      )}
      <input
        ref={input}
        placeholder="名前を入れて Enter"
        className="min-w-0 flex-1 rounded-[8px] border-2 border-[rgba(20,22,28,0.12)] px-2.5 py-1.5 text-[13px] font-bold outline-none focus:border-[var(--color-toy-purple)]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isComposing(e)) submit();
        }}
        data-testid="add-contact-name"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="brick brick-press rounded-[9px] bg-[var(--color-toy-purple)] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
        style={{ "--depth-x": "0px", "--depth-y": "3px", "--depth-color": "#4a2fc4" } as React.CSSProperties}
        data-testid="add-contact-submit"
      >
        足す
      </button>
    </div>
  );
}
