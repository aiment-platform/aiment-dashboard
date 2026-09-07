import { Topbar } from "@/components/topbar";

/** 一覧・設定など「紙ではない」ページの枠。積み木ボード(/)には被せない。 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-dots min-h-screen">
      <Topbar />
      <main className="mx-auto max-w-[900px] px-6 pb-24 pt-8">{children}</main>
    </div>
  );
}
