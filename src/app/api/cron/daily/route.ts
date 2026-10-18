// Vercel Cron: M3 운영 안내(D-3) + M5 준비 안내(D-1) — 매일 09:00 KST (vercel.json: 0 0 * * * UTC)
import { NextResponse } from "next/server";
import { createServiceClient, verifyCronRequest } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { runDaily } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) return jsonError("Unauthorized", 401);
  try {
    const outcome = await runDaily(createServiceClient());
    console.log("[cron/daily]", JSON.stringify(outcome));
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("[cron/daily] 실패:", err);
    return jsonError(err instanceof Error ? err.message : "cron 실행 실패", 500);
  }
}
