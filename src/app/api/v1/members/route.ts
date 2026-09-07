import { NextResponse } from "next/server";
import { listMembers } from "@/lib/services/members";

export async function GET() {
  return NextResponse.json({ members: await listMembers() });
}
