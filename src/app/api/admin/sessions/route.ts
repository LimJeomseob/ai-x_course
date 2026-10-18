// 관리자 세션 관리(PRD §9.4) — zoom_link(3차)·prelearning_url(5차)·notes 조회/수정.
// 두 링크 컬럼은 공개 역할에 SELECT 권한이 없으므로 service role로만 다룬다.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, verifyAdminRequest } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await verifyAdminRequest(req))) return jsonError("관리자 인증이 필요합니다.", 401);
  const { data, error } = await createServiceClient()
    .from("workshops")
    .select(
      "id, round, round_label, topic, start_at, notes, zoom_link, prelearning_url, day:workshop_days(day_code, day_label, notes, is_online)"
    )
    .order("round");
  if (error) return jsonError("세션 정보를 불러오지 못했습니다.", 500);
  return NextResponse.json({ sessions: data ?? [] });
}

const optionalUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || /^https?:\/\//.test(v), "http(s)로 시작하는 URL을 입력해 주세요.")
  .transform((v) => (v === "" ? null : v));

const patchSchema = z.object({
  id: z.string().uuid(),
  zoom_link: optionalUrl.optional(),
  prelearning_url: optionalUrl.optional(),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(req: Request) {
  if (!(await verifyAdminRequest(req))) return jsonError("관리자 인증이 필요합니다.", 401);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);

  const { id, ...fields } = parsed.data;
  const { error } = await createServiceClient().from("workshops").update(fields).eq("id", id);
  if (error) return jsonError("저장에 실패했습니다.", 500);
  return NextResponse.json({ ok: true });
}
