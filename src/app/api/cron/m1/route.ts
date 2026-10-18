// Vercel Cron: M1 신청 결과 안내 — 매일 18:00 KST (vercel.json: 0 9 * * * UTC)
import { NextResponse } from "next/server";
import { createServiceClient, verifyCronRequest } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { runM1 } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) return jsonError("Unauthorized", 401);
  try {
    const outcome = await runM1(createServiceClient());
    console.log("[cron/m1]", JSON.stringify(outcome));
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("[cron/m1] 실패:", err);
    return jsonError(err instanceof Error ? err.message : "cron 실행 실패", 500);
  }
}
