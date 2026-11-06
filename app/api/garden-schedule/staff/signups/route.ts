import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { notifySignupApproved } from '@/lib/account/signup-notify';
import { ensureStaffLink, staffNameRows } from '@/lib/staff/directory';
import { rosterMatch } from '@/lib/staff/names';
import { STORES } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 15;

// 가입 신청 승인(운영진 위임, 2026-11-06) — GET 대기 목록 / POST { userId, store } 승인 / DELETE { userId } 거절.
// 운영진은 스탭 역할로만 승인한다. 매니저 역할·페이지 권한은 대표가 설정에서 바꾼다.
// 승인하면 명부에 연결되고, 명부에 없는 이름은 재직자로 추가된다.

export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const [{ data, error }, { data: roster, error: rErr }] = await Promise.all([
    a.svc.from('profiles').select('user_id, display_name, created_at').eq('status', 'pending').order('created_at'),
    a.svc.from('schedule_staff').select('name, active, home_store'),
  ]);
  if (error || rErr) return dbError((error ?? rErr)!);
  const rows = roster ?? [];
  return NextResponse.json({
    signups: (data ?? []).map((p) => ({
      userId: p.user_id as string,
      name: p.display_name as string,
      requestedAt: p.created_at as string,
      match: rosterMatch(p.display_name as string, rows as { name: string; active: boolean }[]),
      homeStore: rows.find((r) => r.name === p.display_name)?.home_store ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const userId = String(b?.userId ?? '');
  if (!userId) return badRequest('신청을 선택하세요.');
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');

  // status 조건까지 걸어, 이미 처리된 신청이나 기존 계정의 역할을 바꾸는 일이 없게 한다
  const { data: p, error } = await a.svc
    .from('profiles')
    .update({ status: 'active', role: 'staff', stores: [b.store], updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('display_name, contact_email')
    .maybeSingle();
  if (error) return dbError(error);
  if (!p) return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 409 });

  await ensureStaffLink(a.svc, { userId, name: p.display_name as string, store: b.store });
  const { data: role } = await a.svc.from('profile_roles').select('label').eq('key', 'staff').maybeSingle();
  await notifySignupApproved(a.svc, {
    name: p.display_name as string,
    contactEmail: p.contact_email as string | null,
    roleLabel: (role?.label as string | undefined) ?? '스탭',
    storeLabels: [STORES.find((s) => s.id === b.store)?.short ?? b.store],
  }).catch((e) => console.error('signup approved notify 실패:', e));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const userId = String(b?.userId ?? '');
  if (!userId) return badRequest('신청을 선택하세요.');
  // 대기 중인 신청만 지울 수 있다 — 운영진이 기존 계정을 삭제하는 길을 만들지 않는다
  const { data: p } = await a.svc.from('profiles').select('status').eq('user_id', userId).maybeSingle();
  if (p?.status !== 'pending') return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 409 });
  const { error } = await a.svc.auth.admin.deleteUser(userId);
  if (error) return dbError(error);
  await a.svc.from('garden_tab_access').delete().eq('user_id', userId);
  return NextResponse.json({ ok: true });
}
