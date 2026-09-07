import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${inter.variable} ${jbmono.variable}`}>
      <body className="min-h-screen">
        {children}
        {/* 盤の右下はやり直し/ズームのボタン置き場なので、知らせは左下に出す */}
        <Toaster position="bottom-left" theme="light" />
      </body>
    </html>
  );
}
