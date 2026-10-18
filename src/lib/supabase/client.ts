import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * 브라우저 클라이언트(anon key, 세션은 localStorage). 공개 조회·신청 RPC와
 * 관리자 화면(RLS is_admin())에서 사용한다. RLS를 우회해야 하는 공개 로직
 * (본인확인·취소·공개 수료증 발급)은 서버 Route Handler(app/api/*)가 처리한다.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  browserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  return browserClient;
}
