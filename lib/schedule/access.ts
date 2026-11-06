import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { isOwner } from '@/lib/finance/access';
import { requireGardenTab } from '@/lib/access/guard';
import { STORES, type StoreId } from '@/lib/types';

// 스케줄 권한 판정 — 탭(schedule)이 있으면 배포된 계획을 볼 수 있고,
// 작성·배포·실제 기록·메모·연차는 대표 + finance.schedule_editors 계정만.
// RLS 는 정책 없이 닫혀 있어 모든 접근이 이 판정 뒤의 service role 로만 일어난다.

export interface ScheduleActor {
  userId: string;
  email: string;
  editor: boolean;
  svc: SupabaseClient;
}

export async function requireScheduleActor(): Promise<ScheduleActor | NextResponse> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(session, user, 'schedule');
  if (denied) return denied;
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const email = (user.email ?? '').toLowerCase();
  let editor = isOwner(user.email);
  if (!editor) {
    const { data } = await svc.from('schedule_editors').select('email').eq('email', email).maybeSingle();
    editor = !!data;
  }
  return { userId: user.id, email, editor, svc };
}

/** 작성 권한까지 필요한 라우트용. */
export async function requireScheduleEditor(): Promise<ScheduleActor | NextResponse> {
  const a = await requireScheduleActor();
  if (a instanceof NextResponse) return a;
  if (!a.editor) return NextResponse.json({ error: '스케줄 작성 권한이 없습니다.' }, { status: 403 });
  return a;
}

export const isStore = (s: unknown): s is StoreId => STORES.some((x) => x.id === s);
export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
export const dbError = (e: { message: string }) => NextResponse.json({ error: e.message }, { status: 500 });
