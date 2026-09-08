import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_COOKIE, ACCOUNT_IDS } from "@/lib/accounts";

/**
 * まだ「だれとして書くか」を選んでいない人を、選択画面へ送るだけ。
 *
 * **アクセス制限はここではやりません。** 誰が開けるかは
 * Vercel の Deployment Protection(許可メールアドレス)が受け持ちます。
 * ここに来られる時点で、もう入れる人だと分かっている前提です。
 */
const SKIP = ["/who", "/api"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (SKIP.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const chosen = req.cookies.get(ACCOUNT_COOKIE)?.value;
  if (chosen && ACCOUNT_IDS.includes(chosen)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/who";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
