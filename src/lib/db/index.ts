import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { newId, nowIso } from "@/lib/ids";

export type Db = BetterSQLite3Database<typeof schema>;

// Cached on globalThis so Next.js dev HMR doesn't open a new connection per reload.
const globalForDb = globalThis as unknown as { __aimentDb?: Db };

function open(): Db {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "aiment.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  ensureWorkspace(db);
  return db;
}

/** The workspace is a singleton; create it on first boot so `npm run dev` needs zero setup. */
function ensureWorkspace(db: Db) {
  const existing = db.select().from(schema.workspace).all();
  if (existing.length === 0) {
    db.insert(schema.workspace)
      .values({ id: "workspace", name: "aiment", createdAt: nowIso() })
      .run();
    db.insert(schema.members)
      .values({ id: newId("mem"), name: "Founder", role: "Founder", createdAt: nowIso() })
      .run();
  }
}

export function getDb(): Db {
  if (!globalForDb.__aimentDb) {
    globalForDb.__aimentDb = open();
  }
  return globalForDb.__aimentDb;
}

export { schema };
