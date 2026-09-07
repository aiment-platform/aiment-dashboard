import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/lib/services/dashboard";

/** One call answers "aiment今どんな感じ?" — the exact object the dashboard renders. */
export async function GET() {
  return NextResponse.json(await getDashboardSummary());
}
