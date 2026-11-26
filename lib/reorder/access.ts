import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { requireGardenTab } from '@/lib/access/guard';

// 발주 권한 — 가든 탭 `reorder` 가 켜진 계정만(대표·매니저, 2026-11-26 대표 결정).
// RLS 는 정책 없이 닫혀 있어 모든 접근이 이 판정 뒤의 service role 로만 일어난다.

export interface ReorderActor {
  userId: string;
  name: string;
  svc: SupabaseClient;
}

export async function requireReorderActor(): Promise<ReorderActor | NextResponse> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(session, user, 'reorder');
  if (denied) return denied;
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const { data: profile } = await svc.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle();
  return {
    userId: user.id,
    name: (profile?.display_name as string | undefined) ?? (user.email ?? '').split('@')[0],
    svc,
  };
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
export const dbError = (e: { message: string }) => NextResponse.json({ error: e.message }, { status: 500 });
