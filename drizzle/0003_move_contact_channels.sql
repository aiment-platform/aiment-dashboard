-- 以前の4列(handle / discord / email / url)を、contact_links の行に移す。
-- 消すのは次の 0004。この移し替えが先に走るので、データは失われない。
-- ID は 'cl_' + 元の連絡先ID + 種類(一意になる)。YouTube の URL は youtube として移す。
INSERT INTO "contact_links" ("id", "contact_id", "channel", "value", "sort_order", "created_at")
SELECT 'cl_' || "id" || '_x', "id", 'x', "handle", 0, "created_at" FROM "contacts" WHERE "handle" IS NOT NULL AND "handle" <> '';
--> statement-breakpoint
INSERT INTO "contact_links" ("id", "contact_id", "channel", "value", "sort_order", "created_at")
SELECT 'cl_' || "id" || '_discord', "id", 'discord', "discord", 1, "created_at" FROM "contacts" WHERE "discord" IS NOT NULL AND "discord" <> '';
--> statement-breakpoint
INSERT INTO "contact_links" ("id", "contact_id", "channel", "value", "sort_order", "created_at")
SELECT 'cl_' || "id" || '_email', "id", 'email', "email", 2, "created_at" FROM "contacts" WHERE "email" IS NOT NULL AND "email" <> '';
--> statement-breakpoint
INSERT INTO "contact_links" ("id", "contact_id", "channel", "value", "sort_order", "created_at")
SELECT 'cl_' || "id" || '_url', "id",
       CASE WHEN "url" ~* '(youtube\.com|youtu\.be)' THEN 'youtube' ELSE 'url' END,
       "url", 3, "created_at"
FROM "contacts" WHERE "url" IS NOT NULL AND "url" <> '';
