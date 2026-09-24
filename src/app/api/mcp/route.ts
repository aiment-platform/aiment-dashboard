import { timingSafeEqual } from "node:crypto";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerAimentTools } from "@/lib/mcp/tools";

/**
 * MCP の入口(Vercel 上)。Claude Code や Codex が URL でつなぐ。
 *
 * 鍵は2つ:
 *   ① Vercel の門   … x-vercel-protection-bypass ヘッダー(Vercel が見る。ここには来ない)
 *   ② この入口の鍵  … Authorization: Bearer <MCP_TOKEN>(ここで見る)
 * ②があるので、①が漏れても MCP_TOKEN を変えれば MCP だけ止められる。
 *
 * 状態を持たない作り(リクエストごとに独立)なので、Vercel の「箱を立てて捨てる」と相性がよい。
 */
const handler = createMcpHandler(
  (server) => registerAimentTools(server, { type: "agent", id: "mcp" }),
  { serverInfo: { name: "aiment", version: "1.0.0" } },
);

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const authed = withMcpAuth(
  handler,
  (_req, token) => {
    const secret = process.env.MCP_TOKEN;
    if (!secret || !token || !sameSecret(token, secret)) return undefined;
    return { token, clientId: "aiment", scopes: [] };
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
