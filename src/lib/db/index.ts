import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Postgres への接続。
 *
 * Vercel は「リクエストが来たら箱を立てて、終わったら捨てる」作りなので、
 * ファイル(SQLite)は使えない。代わりに外のPostgres(Neon など)につなぐ。
 *
 * ・接続は globalThis に載せて使い回す。開発中のホットリロードや、
 *   温まった箱への次のリクエストで、毎回つなぎ直さないため。
 * ・max: 1 — 箱ひとつにつき1本だけ。多数の箱が同時に立っても接続を食い潰さない。
 * ・prepare: false — Neon/Supabase の接続プーラ(pgbouncer)は
 *   プリペアドステートメントを跨いで使えないので必須。
 * ・マイグレーションはここでは走らせない(src/scripts/migrate.ts でデプロイ時に1回)。
 */
const globalForDb = globalThis as unknown as {
  __aimentSql?: ReturnType<typeof postgres>;
  __aimentDb?: Db;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL が設定されていません。.env.local(ローカル) か Vercel の環境変数に、" +
        "Postgres の接続文字列を入れてください。詳しくは .env.example を参照。",
    );
  }
  return url;
}

export function getSql() {
  if (!globalForDb.__aimentSql) {
    globalForDb.__aimentSql = postgres(connectionString(), {
      max: 1,
      idle_timeout: 20,
      prepare: false,
      // 「そのテーブルはもうある」等の NOTICE はログに要らない
      onnotice: () => {},
    });
  }
  return globalForDb.__aimentSql;
}

export function getDb(): Db {
  if (!globalForDb.__aimentDb) {
    globalForDb.__aimentDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__aimentDb;
}

/**
 * 土台の行(ワークスペース1行 + アカウント3人)を用意する。
 * 起動のたびに走らせるとリクエストが遅くなるので、マイグレーションと同じく
 * デプロイ時(src/scripts/migrate.ts)から呼ぶ。
 */
export async function ensureBaseRows(): Promise<void> {
  const { nowIso } = await import("@/lib/ids");
  const { ACCOUNTS } = await import("@/lib/accounts");
  const { inArray } = await import("drizzle-orm");
  const db = getDb();

  const ws = await db.select().from(schema.workspace);
  if (ws.length === 0) {
    await db
      .insert(schema.workspace)
      .values({ id: "workspace", name: "aiment", createdAt: nowIso() });
  }

  const ids = ACCOUNTS.map((a) => a.id);
  const have = new Set(
    (await db.select().from(schema.members).where(inArray(schema.members.id, ids))).map((m) => m.id),
  );
  const missing = ACCOUNTS.filter((a) => !have.has(a.id));
  if (missing.length > 0) {
    await db.insert(schema.members).values(
      missing.map((a) => ({
        id: a.id,
        name: a.name,
        role: null,
        email: null,
        authUserId: null,
        isActive: 1,
        createdAt: nowIso(),
      })),
    );
  }
}

export { schema };
