"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 관리자 전용 서버 API(app/api/admin/*) 호출. 현재 로그인 세션의 access token을
 * Bearer로 실어 보내고, 서버는 is_admin()으로 다시 검증한다.
 */
export async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");

  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `요청 처리 중 오류가 발생했습니다. (${res.status})`);
  }
  return data as T;
}

/** 공개 API(app/api/*) 호출 — 오류 응답의 error 메시지를 그대로 던진다. */
export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "요청 처리 중 오류가 발생했습니다.");
  }
  return data as T;
}
