"use client";

/**
 * ライト / ダークの切り替え。
 *
 * 選んだ方を Cookie(aiment_theme)に覚える。サーバーは次から最初からその色で送るので、
 * 開いた瞬間に白く光る(ちらつく)ことがない。まだ選んでいない人は OS の設定に従う。
 * 押した瞬間は <html data-theme> を直接書きかえるので、待ち時間なしで切り替わる。
 * (色はすべて CSS の変数なので、サーバーに聞き直す必要はない = DB も読まない)
 */
import { THEME_COOKIE } from "@/lib/theme";

export function ThemeToggle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const toggle = () => {
    const el = document.documentElement;
    const next = el.dataset.theme === "dark" ? "light" : "dark";
    el.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={toggle}
      aria-label="ライト / ダークを切り替える"
      title="ライト / ダークを切り替える"
      data-testid="theme-toggle"
    >
      {/* 月(ライトのとき) / 太陽(ダークのとき)。どちらを出すかは CSS で決める(サーバーとずれない) */}
      <svg className="theme-icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
      <svg className="theme-icon-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
