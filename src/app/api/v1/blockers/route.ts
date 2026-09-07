import { NextRequest, NextResponse } from "next/server";
import { getBlockers } from "@/lib/services/blockers";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") === "resolved" ? "resolved" : "active";
  return NextResponse.json({ blockers: await getBlockers(status) });
}
