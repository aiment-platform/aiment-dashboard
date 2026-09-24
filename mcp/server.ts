/**
 * aiment の MCP サーバー(手元用・stdio)。
 *
 * ふだん相方と使うのは Vercel 上の /api/mcp(src/app/api/mcp/route.ts)。
 * こちらは開発中に手元の DB で試すためのもの。ツールの中身は同じ(src/lib/mcp/tools.ts)。
 *
 *   npm run mcp                          (DATABASE_URL が要る)
 *   npx @modelcontextprotocol/inspector npm run mcp   (ブラウザで1つずつ試す)
 *
 * 注意: stdio では標準出力が AI との会話に使われる。console.log を書くと壊れるので、
 * ログは必ず console.error に出す。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAimentTools } from "@/lib/mcp/tools";

async function main() {
  const server = new McpServer({ name: "aiment", version: "1.0.0" });
  registerAimentTools(server, { type: "agent", id: process.env.AIMENT_AGENT_NAME ?? "mcp-local" });
  await server.connect(new StdioServerTransport());
  console.error("aiment MCP server ready (stdio)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
