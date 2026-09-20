import { NextResponse } from "next/server";
import { listContacts } from "@/lib/services/contacts";

/** 連絡先の一覧(エージェント用)。書き込みは画面から。 */
export async function GET() {
  return NextResponse.json({ contacts: await listContacts() });
}
