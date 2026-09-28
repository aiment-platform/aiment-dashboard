"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addContactLinkAction,
  deleteContactAction,
  removeContactLinkAction,
  updateContactAction,
  updateContactLinkAction,
} from "@/app/actions";
import { MemberSquare } from "@/components/member-square";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CONTACT_CHANNEL,
  CONTACT_KIND,
  CONTACT_STATUS,
  type ContactChannel,
  type ContactKind,
  type ContactStatus,
} from "@/lib/constants";
import {
  ADDRESS_LABEL,
  KIND_COLOR,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  channelDisplay,
  channelHref,
  daysAgo,
  detectAddress,
  valueAs,
} from "@/lib/contacts-ui";
import type { ContactDto, ContactLinkDto } from "@/lib/services/contacts";
import { cn, isComposing } from "@/lib/utils";

/**
 * 連絡先の1行。
 *
 * ぜんぶ行の上で触れる:
 *   ・名前      … 押すとその場で書きかえ
 *   ・連絡手段  … 名前のすぐ横にタグで並ぶ(X / Instagram / Discord / Messenger …)。
 *                 タグを押すと種類を選び直せる、値を押すと書きかえ、× で消す、＋ で足す
 *   ・一言      … 閉じているときは名前の下に見える短い説明。押すとその場で書きかえ
 *   ・担当 / 種類 / 段階 … それぞれの札を押して選ぶ
 *
 * 閉じているときは連絡手段を2つまで見せ、あふれた分は「+N」にまとめる。
 * 開くと全部見える + 下に「一言」と「詳細」(長文のメモ)の欄が出る。行の空いている所を押しても開く。
 */

/** 閉じているときに行に出す連絡手段の数 */
const SHOW_WHEN_CLOSED = 2;

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
  const [editingSummary, setEditingSummary] = useState(false);
  /** 連絡手段を足している最中か。channel があれば、その種類で始める(下のタグから押したとき) */
  const [adding, setAdding] = useState<false | { channel: ContactChannel | null }>(false);
  const [, start] = useTransition();
  const tone = STATUS_TONE[c.status];
  const ownerName = members.find((m) => m.id === c.owner_id)?.name ?? null;
  const since = daysAgo(c.last_contacted_at);
  const visible = open ? c.links : c.links.slice(0, SHOW_WHEN_CLOSED);
  const hiddenCount = c.links.length - visible.length;

  const run = (fn: () => Promise<unknown>, failed = "保存できませんでした") =>
    start(async () => {
      try {
        await fn();
      } catch {
        toast(failed);
      }
    });
  const save = (patch: Parameters<typeof updateContactAction>[1]) => run(() => updateContactAction(c.id, patch));

  /** 行の空いている所を押したら開く/とじる。ボタンや入力欄の上は横取りしない */
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
      <div className="group cursor-pointer px-2.5 py-2" onClick={onHeaderClick} data-testid="contact-header">
        <div className="flex items-center gap-2.5">
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

          {/* 名前 */}
          {editingName ? (
            <InlineInput
              value={c.name}
              className="min-w-0 flex-1 text-[13.5px]"
              onDone={(v) => {
                setEditingName(false);
                if (v && v !== c.name) save({ name: v });
              }}
              testId="contact-name-input"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className={cn("max-w-[40%] shrink-0 truncate text-left text-[13.5px] font-bold", c.status === "passed" && "opacity-60")}
              title="クリックで書きかえ"
              data-testid="contact-name"
            >
              {c.name}
            </button>
          )}

          {/* 連絡手段(タグ) */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-testid="contact-addresses">
            {visible.map((l) => (
              <LinkChip
                key={l.id}
                link={l}
                onChannel={(channel) => run(() => updateContactLinkAction(l.id, { channel, value: valueAs(channel, l.value) }))}
                onValue={(value) => run(() => updateContactLinkAction(l.id, { value }))}
                onRemove={() => run(() => removeContactLinkAction(l.id))}
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

            {adding ? (
              <NewLinkInput
                initialChannel={adding.channel}
                onDone={(found) => {
                  setAdding(false);
                  if (found) run(() => addContactLinkAction(c.id, found.channel, found.value));
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding({ channel: null })}
                className="grid size-5 shrink-0 place-items-center rounded-[6px] bg-white/70 text-[13px] font-bold leading-none opacity-70 hover:bg-white hover:opacity-100"
                aria-label="連絡手段を足す"
                title="連絡手段を足す"
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

          {/* 担当 */}
          <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-[6px] hover:ring-2 hover:ring-[var(--color-toy-purple)]"
                title={ownerName ? `担当: ${ownerName}` : "担当を決める"}
                data-testid="contact-owner"
              >
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

          {/* 段階 */}
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

        {/* 一言: 閉じているときは名前の下に出す(押すとその場で書きかえ)。開いたら下の「一言」欄で書きかえる */}
        {open ? null : editingSummary ? (
          <InlineInput
            value={c.summary ?? ""}
            placeholder="一言で(例: 登録者3万人・コラボ前向き)"
            className="mt-1 w-full text-[12px]"
            onDone={(v) => {
              setEditingSummary(false);
              if (v !== (c.summary ?? "")) save({ summary: v || null });
            }}
            testId="contact-summary-input"
          />
        ) : c.summary ? (
          <button
            type="button"
            onClick={() => setEditingSummary(true)}
            className="mt-0.5 block max-w-full truncate pl-[1px] text-left text-[12px] font-bold opacity-65 hover:opacity-100"
            title="クリックで書きかえ"
            data-testid="contact-summary"
          >
            {c.summary}
          </button>
        ) : null}
      </div>

      {open && (
        <Details
          contact={c}
          save={save}
          onClose={() => setOpen(false)}
          onAddChannel={(channel) => run(() => addContactLinkAction(c.id, channel, ""))}
          onRemoveChannel={(channel) => {
            const ids = c.links.filter((l) => l.channel === channel).map((l) => l.id);
            run(async () => {
              for (const id of ids) await removeContactLinkAction(id);
            });
          }}
        />
      )}
    </div>
  );
}

// ---- 部品 ----------------------------------------------------------------------

/** その場で書きかえる入力欄。Enter か外を押すと確定、Esc でやめる */
function InlineInput({
  value,
  onDone,
  className,
  placeholder,
  testId,
}: {
  value: string;
  onDone: (v: string) => void;
  className?: string;
  placeholder?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      autoFocus
      defaultValue={value}
      placeholder={placeholder}
      className={cn(
        "rounded-[6px] border-2 border-[var(--color-toy-purple)] bg-white px-1.5 py-0.5 font-bold outline-none",
        className,
      )}
      onBlur={(e) => onDone(e.target.value.trim())}
      onKeyDown={(e) => {
        if (isComposing(e)) return;
        if (e.key === "Enter") ref.current?.blur();
        if (e.key === "Escape") {
          if (ref.current) ref.current.value = value;
          ref.current?.blur();
        }
      }}
      data-testid={testId}
    />
  );
}

/** 連絡手段の種類を選ぶ小窓(タグ)。足すときも、既にあるものを変えるときも同じもの */
function ChannelMenu({
  current,
  onPick,
  children,
  open,
  onOpenChange,
}: {
  current: ContactChannel | null;
  onPick: (k: ContactChannel) => void;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className={cn(POP, "w-[260px]")}
        sideOffset={6}
        align="start"
        // 入力欄のフォーカスを奪わない(奪うと blur で保存が走ってしまう)
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-testid="address-type-menu"
      >
        <p className={POP_TITLE}>連絡手段</p>
        <div className="flex flex-wrap gap-1">
          {CONTACT_CHANNEL.map((k) => (
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
                k === current
                  ? "border-transparent bg-[var(--color-toy-purple)] text-white"
                  : "border-[rgba(20,22,28,0.12)] bg-white hover:border-[var(--color-toy-purple)]",
              )}
              data-testid={`type-${k}`}
            >
              {ADDRESS_LABEL[k]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 連絡手段1つ。タグを押すと種類、値を押すと書きかえ、× で消す */
function LinkChip({
  link,
  onChannel,
  onValue,
  onRemove,
}: {
  link: ContactLinkDto;
  onChannel: (c: ContactChannel) => void;
  onValue: (v: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const href = channelHref(link.channel, link.value);
  if (editing) {
    return (
      <span className="flex items-center gap-1" data-keep>
        <span className="text-[10px] font-bold opacity-60">{ADDRESS_LABEL[link.channel]}</span>
        <InlineInput
          value={link.value}
          className="w-[200px] text-[11.5px]"
          onDone={(v) => {
            setEditing(false);
            if (v !== link.value) onValue(v);
          }}
          testId={`link-edit-${link.channel}`}
        />
      </span>
    );
  }
  return (
    <span
      className="flex max-w-[210px] items-center gap-0.5 rounded-[7px] bg-white/70 pl-1 pr-0.5 text-[10.5px] font-bold"
      data-testid={`link-${link.channel}`}
    >
      <ChannelMenu current={link.channel} onPick={(k) => k !== link.channel && onChannel(k)} open={menu} onOpenChange={setMenu}>
        <button
          type="button"
          className="shrink-0 whitespace-nowrap rounded-[4px] px-0.5 opacity-50 hover:bg-white hover:opacity-100"
          title="種類を変える"
          data-testid={`link-type-${link.channel}`}
        >
          {ADDRESS_LABEL[link.channel]} ▾
        </button>
      </ChannelMenu>
      {link.value ? (
        <button type="button" onClick={() => setEditing(true)} className="num min-w-0 truncate px-0.5 hover:underline" title="クリックで書きかえ">
          {channelDisplay(link.channel, link.value)}
        </button>
      ) : (
        // アドレスは任意。タグだけ付いている状態。押すとここで入れられる
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="grid size-4 place-items-center rounded-[4px] font-bold opacity-40 hover:bg-white hover:opacity-90"
          title="アドレスを入れる(任意)"
          aria-label={`${ADDRESS_LABEL[link.channel]} のアドレスを入れる`}
          data-testid={`link-empty-${link.channel}`}
        >
          ＋
        </button>
      )}
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="grid size-4 place-items-center rounded-[4px] opacity-50 hover:bg-white hover:opacity-100" title="開く" aria-label={`${ADDRESS_LABEL[link.channel]} を開く`}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
        </a>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="grid size-4 place-items-center rounded-[4px] opacity-50 hover:bg-white hover:text-destructive hover:opacity-100"
        aria-label={`${ADDRESS_LABEL[link.channel]} を消す`}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </span>
  );
}

/**
 * 連絡手段を足す入力欄。
 * 貼った文字から種類を見分けて左のタグに出す(自動判定)。タグを押すと候補から選び直せる。
 * 手で選んだあとは、打ち直しても自動判定で戻さない。
 */
function NewLinkInput({
  initialChannel = null,
  onDone,
}: {
  /** 下のタグから押したときは、その種類で始める */
  initialChannel?: ContactChannel | null;
  onDone: (found: { channel: ContactChannel; value: string } | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<ContactChannel | null>(initialChannel);
  const [menu, setMenu] = useState(false);

  const guess = detectAddress(text);
  const channel: ContactChannel | null = chosen ?? guess?.key ?? null;
  let value = "";
  if (channel) value = chosen && chosen !== guess?.key ? valueAs(chosen, text) : (guess?.value ?? valueAs(channel, text));

  return (
    <span className="flex items-center gap-1" data-keep>
      <ChannelMenu
        current={channel}
        onPick={(k) => {
          setChosen(k);
          // 選んだらすぐ Enter で確定できるよう、入力欄にカーソルを戻す
          requestAnimationFrame(() => ref.current?.focus());
        }}
        open={menu}
        onOpenChange={setMenu}
      >
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "num shrink-0 cursor-pointer rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold",
            channel ? "bg-[var(--color-toy-purple)] text-white" : "bg-white/70 opacity-60",
          )}
          title="押すと連絡手段を選べます"
          data-testid="address-guess"
          data-key={channel ?? ""}
        >
          {channel ? ADDRESS_LABEL[channel] : "?"} ▾
        </button>
      </ChannelMenu>
      <input
        ref={ref}
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim() && !initialChannel) setChosen(null);
        }}
        placeholder="ID・URL・メールを貼る"
        className="w-[220px] rounded-[7px] border-2 border-[var(--color-toy-purple)] bg-white px-1.5 py-0.5 text-[11.5px] font-bold outline-none"
        onBlur={() => {
          if (menu) return; // 小窓を開いている最中の blur では保存しない
          // 種類を手で選んでいれば、アドレスが空でもタグとして足す(アドレスは任意)
          if (channel && (value || chosen)) onDone({ channel, value });
          else onDone(null);
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

/** 開いたときに出るもの: 一言 → 詳細(長文のメモ)、消す/とじる */
function Details({
  contact: c,
  save,
  onClose,
  onAddChannel,
  onRemoveChannel,
}: {
  contact: ContactDto;
  save: (patch: Parameters<typeof updateContactAction>[1]) => void;
  onClose: () => void;
  /** 持っていない種類のタグを押した: タグだけ付ける(アドレスは任意。あとでタグの中で入れる) */
  onAddChannel: (c: ContactChannel) => void;
  /** 持っている種類のタグを押した: 外す */
  onRemoveChannel: (c: ContactChannel) => void;
}) {
  const has = new Set(c.links.map((l) => l.channel));
  const [, start] = useTransition();
  return (
    <div className="space-y-3 border-t-2 border-[rgba(20,22,28,0.08)] px-3 py-3" data-testid="contact-editor">
      <div>
        <span className="mb-1 block text-[10.5px] font-bold text-muted-foreground">一言</span>
        <input
          defaultValue={c.summary ?? ""}
          maxLength={200}
          placeholder="閉じていても見える短い説明(例: 登録者3万人・コラボ前向き)"
          className="w-full rounded-[8px] border-2 border-[rgba(20,22,28,0.12)] bg-white px-2 py-1.5 text-[12.5px] font-bold outline-none focus:border-[var(--color-toy-purple)]"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if ((c.summary ?? "") === v) return;
            save({ summary: v || null });
          }}
          onKeyDown={(e) => {
            if (isComposing(e)) return;
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          data-testid="contact-summary-field"
        />
      </div>
      <div>
        <span className="mb-1 block text-[10.5px] font-bold text-muted-foreground">詳細</span>
        <textarea
          defaultValue={c.note ?? ""}
          rows={4}
          placeholder="話した内容 / 経緯 / 次にやること など、長めに"
          className="w-full resize-y rounded-[8px] border-2 border-[rgba(20,22,28,0.12)] bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-toy-purple)]"
          onBlur={(e) => {
            const v = e.target.value;
            if ((c.note ?? "") === v) return;
            save({ note: v || null });
          }}
          data-testid="contact-note"
        />
      </div>
      <div className="flex items-center gap-3">
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
        {/*
          連絡手段のタグ。9種類ぜんぶ並べ、この人が持っているものは塗って「選択中」にする。
          持っていないものを押すと、アドレス無しでタグだけ付く(アドレスは任意。上の行のタグを押して入れる)。
          持っているものを押すと、確認なしですぐ外す。
        */}
        <span className="flex flex-wrap items-center gap-1" data-testid="contact-channels">
          {CONTACT_CHANNEL.map((ch) => {
            const on = has.has(ch);
            return (
              <button
                key={ch}
                type="button"
                onClick={() => (on ? onRemoveChannel(ch) : onAddChannel(ch))}
                className={cn(
                  "rounded-[7px] border-2 px-1.5 py-0.5 text-[10.5px] font-bold",
                  on
                    ? "border-transparent bg-[var(--color-toy-purple)] text-white"
                    : "border-[rgba(20,22,28,0.12)] bg-white/70 text-muted-foreground hover:border-[var(--color-toy-purple)]",
                )}
                aria-pressed={on}
                title={on ? `${ADDRESS_LABEL[ch]} を外す` : `${ADDRESS_LABEL[ch]} を足す`}
                data-testid={`channel-tag-${ch}`}
              >
                {on && "✓ "}
                {ADDRESS_LABEL[ch]}
              </button>
            );
          })}
        </span>
        <span className="flex-1" />
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
