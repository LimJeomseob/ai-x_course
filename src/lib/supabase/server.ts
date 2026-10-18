import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트(service role). Route Handler(app/api/*)에서만 import한다.
 * SUPABASE_SERVICE_ROLE_KEY는 Vercel 서버 환경변수에만 존재해야 한다(PRD §10, §11).
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase 서버 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 없습니다.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface AdminIdentity {
  email: string;
}

/**
 * 관리자 API 인증: 브라우저가 보낸 `Authorization: Bearer <access_token>`으로
 * 사용자 컨텍스트 클라이언트를 만들어 is_admin()(admin_users allowlist)을 확인한다.
 * 실패 시 null — 호출 측에서 401/403을 반환한다.
 */
export async function verifyAdminRequest(req: Request): Promise<AdminIdentity | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user?.email) return null;

  const { data: isAdmin, error } = await userClient.rpc("is_admin");
  if (error || isAdmin !== true) return null;

  return { email: userData.user.email };
}

/** Vercel Cron 요청 검증 — Vercel은 `Authorization: Bearer <CRON_SECRET>`을 붙여 호출한다. */
export function verifyCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
