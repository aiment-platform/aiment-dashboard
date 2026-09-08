/**
 * マイグレーションを1回だけ流す。デプロイのたびに実行する想定。
 * 実行: npm run db:migrate   (DATABASE_URL が要る)
 *
 * 起動時ではなくここで走らせる理由: Vercel は箱が立つたびに起動処理が走るので、
 * そこに置くと毎回テーブルの確認が入って遅くなる。
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb, getSql, ensureBaseRows } from "@/lib/db";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL がありません。.env.local か Vercel の環境変数に入れてください。");
    process.exit(1);
  }
  console.log(`migrating: ${url.replace(/:[^:@/]*@/, ":****@")}`);
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  await ensureBaseRows();
  console.log("done");
  await getSql().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
