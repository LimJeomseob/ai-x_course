// Vercel Cron: M4 운영 당일 최종 안내 — 매일 08:00 KST (vercel.json: 0 23 * * * UTC, 전날 실행)
import { NextResponse } from "next/server";
import { createServiceClient, verifyCronRequest } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { runM4 } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!verifyCronRequest(req)) return jsonError("Unauthorized", 401);
  try {
    const outcome = await runM4(createServiceClient());
    console.log("[cron/m4]", JSON.stringify(outcome));
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("[cron/m4] 실패:", err);
    return jsonError(err instanceof Error ? err.message : "cron 실행 실패", 500);
  }
}
