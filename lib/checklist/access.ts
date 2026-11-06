import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { isOwner } from '@/lib/finance/access';
import { requireGardenTab } from '@/lib/access/guard';
import type { StoreId } from '@/lib/types';

// 체크리스트 권한 — 탭(checklist)이 있으면 자기 배정분, 운영진(대표 + schedule_editors)은 전체 열람·조 수정·항목 관리·대리 체크.
// 항목 관리는 운영진 또는 탭(checklist_items)이 켜진 계정. 항목 관리 탭만 받은 계정도 이 판정을 통과한다.
// 근무자와 로그인 계정은 명부의 연결 값(schedule_staff.user_id)으로만 잇는다. 이름으로 판정하지 않는다.
// RLS 는 정책 없이 닫혀 있어 모든 접근이 이 판정 뒤의 service role 로만 일어난다.

export interface ChecklistActor {
  userId: string;
  name: string;
  editor: boolean;
  canManageItems: boolean;
  staffId: number | null; // 명부에 연결되지 않았으면 null
  staff: { active: boolean; stores: StoreId[] } | null; // stores = 명부의 근무 지점
  stores: string[]; // 계정에 지정된 지점
  svc: SupabaseClient;
}

export async function requireChecklistActor(): Promise<ChecklistActor | NextResponse> {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(session, user, ['checklist', 'checklist_items']);
  if (denied) return denied;
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const email = (user.email ?? '').toLowerCase();
  const [{ data: profile }, { data: editorRow }, { data: staff }] = await Promise.all([
    svc.from('profiles').select('display_name, stores').eq('user_id', user.id).maybeSingle(),
    svc.from('schedule_editors').select('email').eq('email', email).maybeSingle(),
    svc.from('schedule_staff').select('id, name, active, home_store, stores').eq('user_id', user.id).maybeSingle(),
  ]);
  const editor = isOwner(user.email) || !!editorRow;
  return {
    userId: user.id,
    name: (staff?.name as string | undefined) ?? (profile?.display_name as string | undefined) ?? email.split('@')[0],
    editor,
    canManageItems: editor || (await requireGardenTab(session, user, 'checklist_items')) === null,
    staffId: staff ? Number(staff.id) : null,
    staff: staff ? { active: !!staff.active, stores: (Array.isArray(staff.stores) && staff.stores.length ? staff.stores : [staff.home_store]) as StoreId[] } : null,
    stores: (profile?.stores as string[] | null) ?? [],
    svc,
  };
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
export const forbid = (error = '권한이 없습니다.') => NextResponse.json({ error }, { status: 403 });
export const dbError = (e: { message: string }) => NextResponse.json({ error: e.message }, { status: 500 });
