import { Liveblocks } from "@liveblocks/node";
import { cookies } from "next/headers";
import { ACCOUNT_COOKIE, accountById } from "@/lib/accounts";

/**
 * Liveblocks に「この人は誰か」を教える窓口。
 *
 * ブラウザは秘密鍵を持てないので、いったんここに聞きに来て、
 * サーバーが「この人はSoyaです」と署名した通行証を返す仕組みです。
 * 誰かの判定は、いつもの選択Cookie(Soya / Futo / Other)をそのまま使います。
 *
 * 名前と色をここで渡しておくと、相手の画面のカーソルにそのまま出ます。
 */
export async function POST() {
  const key = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!key) {
    return new Response("リアルタイム共有は設定されていません", { status: 501 });
  }

  const jar = await cookies();
  const account = accountById(jar.get(ACCOUNT_COOKIE)?.value);
  if (!account) {
    return new Response("だれとして書くかが選ばれていません", { status: 403 });
  }

  const liveblocks = new Liveblocks({ secret: key });
  const session = liveblocks.prepareSession(account.id, {
    userInfo: { name: account.name, color: account.color },
  });
  // 部屋は盤ごと(board:<期間ID>)。使う人は2人なので、全部の盤に入れてよい。
  session.allow("board:*", session.FULL_ACCESS);

  const { body, status } = await session.authorize();
  return new Response(body, { status });
}
