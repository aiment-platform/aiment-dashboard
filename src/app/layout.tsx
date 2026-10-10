import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/sonner";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata: Metadata = {
  title: "aiment",
  description: "aiment 積み木ボード — この期間は何に向かっているのか",
};

// Everything reads live SQLite state; never prerender stale company state.
export const dynamic = "force-dynamic";

/**
 * ルート直下は「紙」だけ。ヘッダーもコンテナも置かない —
 * トップページ(積み木ボード)が画面いっぱいを使うため。
 * 従来の一覧系ページは (app) ルートグループ側で枠を被せる。
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ライト / ダーク。選んでいれば Cookie に入っている(theme-toggle.tsx)
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = saved === "dark" || saved === "light" ? saved : undefined;
  return (
    <html
      lang="ja"
      className={`${inter.variable} ${jbmono.variable}`}
      data-theme={theme}
      // 選んでいない人は下の小さなスクリプトが OS の設定を見て data-theme を付けるので、サーバーの HTML とずれてよい
      suppressHydrationWarning
    >
      <head>
        {!theme && (
          <script
            // 描く前に走らせる(後から切り替えると、一瞬白く光ってしまう)
            dangerouslySetInnerHTML={{
              __html: `if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.dataset.theme="dark"`,
            }}
          />
        )}
      </head>
      <body className="min-h-screen">
        {children}
        {/* 盤の右下はやり直し/ズームのボタン置き場なので、知らせは左下に出す */}
        <Toaster position="bottom-left" theme={theme ?? "system"} />
      </body>
    </html>
  );
}
