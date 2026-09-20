"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteContactAction, updateContactAction } from "@/app/actions";
import { MemberSquare } from "@/components/member-square";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CONTACT_KIND, CONTACT_STATUS, type ContactKind, type ContactStatus } from "@/lib/constants";
import {
  ADDRESS_LABEL,
  KIND_COLOR,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  daysAgo,
  detectAddress,
  xUrl,
  type AddressKey,
} from "@/lib/contacts-ui";
import type { ContactDto } from "@/lib/services/contacts";
import { cn, isComposing } from "@/lib/utils";

/**
 * 連絡先の1行。
 *
 * ぜんぶ行の上で触れる:
 *   ・名前      … 押すとその場で書きかえ(盤の積み木と同じ)
 *   ・連絡先    … 名前のすぐ横。押すとその場で書きかえ、× で消す、＋ で足す
 *                 足すときは種類を選ばせない。貼った文字から自動で見分ける(detectAddress)
 *   ・担当      … マークを押して選ぶ
 *   ・種類      … 札を押して選ぶ
 *   ・段階      … 右の札から選ぶ
 *
 * 閉じているときは連絡先を **2つまで** 見せ、あふれた分は「+N」にまとめる。
 * 開くと全部見える + 備考が出る。開くのは ▾ でも、行の空いている所を押してもいい。
 */

/** 閉じているときに行に出す連絡先の数。これを超えた分は「+N」にまとめる */
const SHOW_WHEN_CLOSED = 2;

const ADDRESS: { key: AddressKey; label: string; type: string }[] = [
  { key: "handle", label: ADDRESS_LABEL.handle, type: "text" },
  { key: "discord", label: ADDRESS_LABEL.discord, type: "text" },
  { key: "email", label: ADDRESS_LABEL.email, type: "email" },
  { key: "url", label: ADDRESS_LABEL.url, type: "url" },
];

const POP = "w-auto rounded-[14px] border-2 border-[rgba(20,22,28,0.14)] p-2";
const POP_TITLE = "mb-1.5 px-0.5 text-[10px] font-bold tracking-wider text-muted-foreground";

export function ContactRow({
  contact: c,
  members,
}: {
  contact: ContactDto;
  members: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [, start] = useTransition();
  const tone = STATUS_TONE[c.status];
  const ownerName = members.find((m) => m.id === c.owner_id)?.name ?? null;
  const since = daysAgo(c.last_contacted_at);

  const save = (patch: Parameters<typeof updateContactAction>[1]) =>
    start(async () => {
      try {
        await updateContactAction(c.id, patch);
      } catch {
        toast("保存できませんでした");
      }
    });

  /** ＋を押して入力中か */
  const [adding, setAdding] = useState(false);
  const have = ADDRESS.filter((a) => c[a.key]);
  const visible = open ? have : have.slice(0, SHOW_WHEN_CLOSED);
  const hiddenCount = have.length - visible.length;

  /**
   * 行の空いている所を押したら開く/とじる。
   * ボタン・入力欄・リンクの上は、それぞれの役目があるので横取りしない。
   */
  const onHeaderClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("button, input, select, textarea, a, [data-keep]")) return;
    setOpen((v) => !v);
  };

  return (
    <div
      className="brick rounded-[12px]"
      style={{ background: tone.face, color: tone.ink, "--depth-color": tone.deep } as React.CSSProperties}
      data-testid="contact-row"
      data-status={c.status}
      data-open={open}
    >
      <div
        className="flex cursor-pointer items-center gap-2.5 px-2.5 py-2"
        onClick={onHeaderClick}
        data-testid="contact-header"
      >
        {/* 種類: 札を押して選ぶ */}
        <Popover open={kindOpen} onOpenChange={setKindOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-[6px] px-1.5 py-px text-[10px] font-bold text-white"
              style={{ background: KIND_COLOR[c.kind] }}
              title="種類を変える"
              data-testid="contact-kind"
            >
              {KIND_LABEL[c.kind]}
            </button>
          </PopoverTrigger>
          <PopoverContent className={POP} sideOffset={6} align="start">
            <p className={POP_TITLE}>種類</p>
            <div className="flex gap-1">
              {CONTACT_KIND.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKindOpen(false);
                    if (k !== c.kind) save({ kind: k as ContactKind });
                  }}
                  className={cn(
                    "rounded-[8px] border-2 px-2 py-1 text-[11px] font-bold",
                    c.kind === k ? "border-transparent text-white" : "border-[rgba(20,22,28,0.12)] bg-white",
                  )}
                  style={c.kind === k ? { background: KIND_COLOR[k] } : undefined}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* 名前: 押すとその場で書きかえ */}
        {editingName ? (
          <NameInput
            value={c.name}
            onDone={(v) => {
              setEditingName(false);
              if (v && v !== c.name) save({ name: v });
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className={cn("shrink-0 max-w-[40%] truncate text-left text-[13.5px] font-bold", c.status === "passed" && "opacity-60")}
            title="クリックで書きかえ"
            data-testid="contact-name"
          >
            {c.name}
          </button>
        )}

        {/* 連絡先: 名前のすぐ横。閉じているときは2つまで、開くと全部 */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-testid="contact-addresses">
          {visible.map((a) => (
            <AddressChip
              key={a.key}
              def={a}
              value={c[a.key]!}
              taken={have.map((h) => h.key)}
              onSave={(v) => save({ [a.key]: v || null })}
              // 種類を変える = 値を別の列へ移す(元の列は空にする)
              onMove={(to) => to !== a.key && save({ [a.key]: null, [to]: valueAs(to, c[a.key]!) })}
            />
          ))}

          {!open && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="num rounded-[7px] bg-white/70 px-1.5 py-0.5 text-[10.5px] font-bold hover:bg-white"
              title="ぜんぶ見る"
              data-testid="address-more"
            >
              +{hiddenCount}
            </button>
          )}

          {adding && (
            <SmartAddressInput
              existing={c}
              onDone={(found) => {
                setAdding(false);
                if (found) save({ [found.key]: found.value });
              }}
            />
          )}

          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="grid size-5 shrink-0 place-items-center rounded-[6px] bg-white/70 text-[13px] font-bold leading-none opacity-70 hover:bg-white hover:opacity-100"
              aria-label="連絡先を足す"
              title="連絡先を足す"
              data-testid="address-add"
            >
              +
            </button>
          )}
        </div>

        {since !== null && (
          <span className="num hidden shrink-0 text-[10.5px] font-bold opacity-60 sm:block" title="最後に連絡した日から">
            {since === 0 ? "今日" : `${since}日前`}
          </span>
        )}

        {/* 担当: マークを押して選ぶ */}
        <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="shrink-0 rounded-[6px] hover:ring-2 hover:ring-[var(--color-toy-purple)]" title={ownerName ? `担当: ${ownerName}` : "担当を決める"} data-testid="contact-owner">
              <MemberSquare id={c.owner_id} name={ownerName} size={18} />
            </button>
          </PopoverTrigger>
          <PopoverContent className={POP} sideOffset={6} align="end">
            <p className={POP_TITLE}>担当</p>
            <div className="flex gap-1">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setOwnerOpen(false);
                    save({ owner_id: c.owner_id === m.id ? null : m.id });
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[8px] border-2 bg-white px-2 py-1 text-[11px] font-bold",
                    c.owner_id === m.id ? "border-[var(--color-toy-purple)]" : "border-[rgba(20,22,28,0.12)]",
                  )}
                  data-testid={`owner-${m.id}`}
                >
                  <MemberSquare id={m.id} name={m.name} size={14} />
                  {m.name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* 段階の札(そのまま) */}
        <label className="relative shrink-0" data-keep>
          <span
            className="brick brick-press block rounded-[8px] bg-white px-2 py-1 text-[11px] font-bold"
            style={{ "--depth-x": "0px", "--depth-y": "2px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties}
          >
            {STATUS_LABEL[c.status]}
          </span>
          <select
            className="absolute inset-0 cursor-pointer opacity-0"
            value={c.status}
            onChange={(e) => save({ status: e.target.value as ContactStatus })}
            aria-label="段階を変える"
            data-testid="contact-status"
          >
            {CONTACT_STATUS.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </label>

        {/* 開く/とじる(行のどこを押してもいいが、目印として残す) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid size-6 shrink-0 place-items-center rounded-[6px] opacity-50 hover:bg-white/60 hover:opacity-100"
          aria-expanded={open}
          aria-label={open ? "とじる" : "開く"}
          data-testid="contact-toggle"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : undefined }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && <Details contact={c} save={save} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * 種類を選ぶ小窓。新しく足すときも、既にあるものを変えるときも同じもの。
 * 「既に入っている種類」には印を付けて、上書きになることを知らせる。
 */
function AddressTypeMenu({
  current,
  taken,
  onPick,
  children,
  open,
  onOpenChange,
}: {
  current: AddressKey | null;
  /** 既に値が入っている種類(current 以外) */
  taken: AddressKey[];
  onPick: (k: AddressKey) => void;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className={POP}
        sideOffset={6}
        align="start"
        // 入力欄のフォーカスを奪わない(奪うと blur で保存が走ってしまう)
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-testid="address-type-menu"
      >
        <p className={POP_TITLE}>種類</p>
        <div className="flex gap-1">
          {(Object.keys(ADDRESS_LABEL) as AddressKey[]).map((k) => {
            const isCurrent = k === current;
            const willOverwrite = !isCurrent && taken.includes(k);
            return (
              <button
                key={k}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onOpenChange(false);
                  onPick(k);
                }}
                className={cn(
                  "rounded-[8px] border-2 px-2 py-1 text-[11px] font-bold",
                  isCurrent
                    ? "border-transparent bg-[var(--color-toy-purple)] text-white"
                    : "border-[rgba(20,22,28,0.12)] bg-white hover:border-[var(--color-toy-purple)]",
                )}
                title={willOverwrite ? `${ADDRESS_LABEL[k]} は入っています(上書きします)` : undefined}
                data-testid={`type-${k}`}
              >
                {ADDRESS_LABEL[k]}
                {willOverwrite && <span className="ml-1 text-[9px] text-[var(--color-brick-hot-ink)]">上書き</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 連絡先の1つ。値を押すとその場で書きかえ、ラベルを押すと種類を変える、× で消す。 */
function AddressChip({
  def,
  value,
  taken,
  onSave,
  onMove,
}: {
  def: (typeof ADDRESS)[number];
  value: string;
  /** 既に値が入っている種類 */
  taken: AddressKey[];
  onSave: (v: string) => void;
  /** 種類を変える(値を別の列へ移す) */
  onMove: (to: AddressKey) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  if (editing) {
    return (
      <span className="flex items-center gap-1" data-keep>
        <span className="text-[10px] font-bold opacity-60">{def.label}</span>
        <input
          ref={ref}
          autoFocus
          type={def.type}
          defaultValue={value}
          className="w-[200px] rounded-[7px] border-2 border-[var(--color-toy-purple)] bg-white px-1.5 py-0.5 text-[11.5px] font-bold outline-none"
          onBlur={(e) => {
            setEditing(false);
            const v = e.target.value.trim();
            if (v !== value) onSave(v);
          }}
          onKeyDown={(e) => {
            if (isComposing(e)) return;
            if (e.key === "Enter") ref.current?.blur();
            if (e.key === "Escape") {
              if (ref.current) ref.current.value = value;
              ref.current?.blur();
            }
          }}
          data-testid={`address-edit-${def.key}`}
        />
      </span>
    );
  }
  const shown = def.key === "handle" ? `@${value}` : value;
  const href = def.key === "handle" ? xUrl(value) : def.key === "email" ? `mailto:${value}` : def.key === "url" ? value : null;
  return (
    <span className="flex max-w-[260px] items-center gap-0.5 rounded-[7px] bg-white/70 pl-1 pr-0.5 text-[10.5px] font-bold" data-testid={`address-${def.key}`}>
      <AddressTypeMenu current={def.key} taken={taken} onPick={onMove} open={menu} onOpenChange={setMenu}>
        <button
          type="button"
          className="shrink-0 whitespace-nowrap rounded-[4px] px-0.5 opacity-50 hover:bg-white hover:opacity-100"
          title="種類を変える"
          data-testid={`address-type-${def.key}`}
        >
          {def.label} ▾
        </button>
      </AddressTypeMenu>
      <button type="button" onClick={() => setEditing(true)} className="num min-w-0 truncate px-0.5 hover:underline" title="クリックで書きかえ">
        {shown}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="grid size-4 place-items-center rounded-[4px] opacity-50 hover:bg-white hover:opacity-100" title="開く" aria-label={`${def.label} を開く`}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
        </a>
      )}
      <button
        type="button"
        onClick={() => onSave("")}
        className="grid size-4 place-items-center rounded-[4px] opacity-50 hover:bg-white hover:text-destructive hover:opacity-100"
        aria-label={`${def.label} を消す`}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </span>
  );
}

/** 名前の書きかえ欄。Enter か外を押すと確定、Esc でやめる。 */
function NameInput({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      autoFocus
      defaultValue={value}
      className="min-w-0 flex-1 rounded-[6px] border-2 border-[var(--color-toy-purple)] bg-white px-1.5 py-0.5 text-[13.5px] font-bold outline-none"
      onBlur={(e) => onDone(e.target.value.trim())}
      onKeyDown={(e) => {
        if (isComposing(e)) return;
        if (e.key === "Enter") ref.current?.blur();
        if (e.key === "Escape") onDone(value);
      }}
      data-testid="contact-name-input"
    />
  );
}

/**
 * 開いたときに出るもの。**備考だけ。**
 * (連絡先は名前の横に全部出ているので、ここには置かない)
 */
function Details({
  contact: c,
  save,
  onClose,
}: {
  contact: ContactDto;
  save: (patch: Parameters<typeof updateContactAction>[1]) => void;
  onClose: () => void;
}) {
  const [, start] = useTransition();
  const field =
    "w-full rounded-[8px] border-2 border-[rgba(20,22,28,0.12)] bg-white px-2 py-1.5 text-[12.5px] font-bold outline-none focus:border-[var(--color-toy-purple)]";

  return (
    <div className="space-y-3 border-t-2 border-[rgba(20,22,28,0.08)] px-3 py-3" data-testid="contact-editor">
      <div>
        <span className="mb-1 block text-[10.5px] font-bold text-muted-foreground">備考</span>
        <textarea
          defaultValue={c.note ?? ""}
          rows={3}
          placeholder="どんな人か / 話した内容 / 次にやること"
          className={cn(field, "resize-y font-normal")}
          onBlur={(e) => {
            const v = e.target.value;
            if ((c.note ?? "") === v) return;
            save({ note: v || null });
          }}
          data-testid="contact-note"
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (!confirm(`「${c.name}」を消しますか？`)) return;
            start(async () => {
              await deleteContactAction(c.id);
            });
          }}
          className="text-[11px] font-bold text-muted-foreground hover:text-destructive"
          data-testid="contact-delete"
        >
          この連絡先を消す
        </button>
        <button
          type="button"
          onClick={onClose}
          className="brick brick-press rounded-[8px] bg-white px-2.5 py-1 text-[11px] font-bold"
          style={{ "--depth-x": "0px", "--depth-y": "2px", "--depth-color": "rgba(20,22,28,0.18)" } as React.CSSProperties}
        >
          とじる
        </button>
      </div>
    </div>
  );
}

/** 種類を手で決めたとき、貼った文字をその種類の形に整える(壊さない範囲で) */
function valueAs(key: AddressKey, raw: string): string {
  const t = raw.trim();
  if (key === "handle") {
    const m = t.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i);
    return m ? m[1] : t.replace(/^@/, "");
  }
  if (key === "url" && t && !/^https?:\/\//i.test(t)) return `https://${t}`;
  return t;
}

/**
 * 連絡先の入力欄。
 * 打っているそばから「これは X」「これはメール」と見分けて、左の札に出す(自動判定)。
 * **札を押すと候補の小窓**が出て、X / Discord / メール / ページ から選べる。
 * 手で決めたあとは、打ち直しても自動判定で戻さない(決めたものが勝つ)。
 */
function SmartAddressInput({
  existing,
  onDone,
}: {
  existing: ContactDto;
  onDone: (found: { key: AddressKey; value: string } | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  /** 小窓で手で決めた種類。null なら自動判定に任せる */
  const [chosen, setChosen] = useState<AddressKey | null>(null);
  const [menu, setMenu] = useState(false);

  const guess = detectAddress(text);
  const key: AddressKey | null = chosen ?? guess?.key ?? null;
  // 自動判定と同じ種類なら判定が整えた値(XのURL→ID など)、手で変えたなら貼った文字をその種類の形に
  let value = "";
  if (key) value = chosen && chosen !== guess?.key ? valueAs(chosen, text) : (guess?.value ?? valueAs(key, text));
  const overwrites = key ? Boolean(existing[key]) : false;
  const taken = (Object.keys(ADDRESS_LABEL) as AddressKey[]).filter((k) => existing[k]);

  const finish = (commit: boolean) => {
    if (commit && key && value) onDone({ key, value });
    else onDone(null);
  };

  return (
    <span className="flex items-center gap-1" data-keep>
      <AddressTypeMenu current={key} taken={taken} onPick={setChosen} open={menu} onOpenChange={setMenu}>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()} // 入力欄のフォーカスを奪わない
          className={cn(
            "num shrink-0 cursor-pointer rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold",
            key ? "bg-[var(--color-toy-purple)] text-white" : "bg-white/70 opacity-60",
            overwrites && "bg-[var(--color-brick-hot-ink)]",
          )}
          title={
            !key
              ? "貼ると見分けます。押して選ぶこともできます"
              : overwrites
                ? `${ADDRESS_LABEL[key]} は入っています(上書きします)。押すと種類を選べます`
                : `${ADDRESS_LABEL[key]} として保存。押すと種類を選べます`
          }
          data-testid="address-guess"
          data-key={key ?? ""}
        >
          {key ? ADDRESS_LABEL[key] : "?"} ▾
        </button>
      </AddressTypeMenu>
      <input
        ref={ref}
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) setChosen(null); // 空にしたら自動判定に戻す
        }}
        placeholder="X / Discord / メール / URL を貼る"
        className="w-[230px] rounded-[7px] border-2 border-[var(--color-toy-purple)] bg-white px-1.5 py-0.5 text-[11.5px] font-bold outline-none"
        onBlur={() => {
          if (menu) return; // 小窓を開いている最中の blur では保存しない
          finish(true);
        }}
        onKeyDown={(e) => {
          if (isComposing(e)) return;
          if (e.key === "Enter") ref.current?.blur();
          if (e.key === "Escape") {
            setText("");
            ref.current?.blur();
          }
        }}
        data-testid="address-input"
      />
    </span>
  );
}
