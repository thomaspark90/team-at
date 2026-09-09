import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, forbid } from '@/lib/teaching/access';
import { isHm, isYmd } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';

// 티칭 일정 — POST { date, store, managerId?, startTime?, endTime?, traineeIds? } / DELETE { id }
// 매니저는 자기 일정만, 대표(admin)는 managerId 를 지정해 누구 일정이든 넣고 뺀다.
// 하루 한 지점(unique manager_id+date) — 같은 날 다시 넣으면 지점·시간·교육 대상이 통째로 바뀐다.
// startTime/endTime 은 'HH:MM'(KST), traineeIds 는 승인된 스탭(교육 운영 권한 없는 역할)만 받는다.
export async function POST(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const date = body?.date;
  const store = String(body?.store ?? '') as StoreId;
  if (!isYmd(date)) return NextResponse.json({ error: '날짜가 올바르지 않습니다.' }, { status: 400 });
  if (!STORES.some((s) => s.id === store)) return NextResponse.json({ error: '지점을 선택하세요.' }, { status: 400 });
  const startTime = body?.startTime ? String(body.startTime) : null;
  const endTime = body?.endTime ? String(body.endTime) : null;
  if ((startTime && !isHm(startTime)) || (endTime && !isHm(endTime))) {
    return NextResponse.json({ error: '시간은 HH:MM 형식으로 넣어주세요.' }, { status: 400 });
  }
  if (startTime && endTime && endTime <= startTime) return NextResponse.json({ error: '종료 시각이 시작보다 빨라요.' }, { status: 400 });
  const wantIds: string[] = Array.isArray(body?.traineeIds) ? Array.from(new Set(body.traineeIds.map(String))) : [];

  let managerId = a.userId;
  if (a.role === 'admin' && body?.managerId) {
    managerId = String(body.managerId);
    const { data: p } = await a.svc.from('profiles').select('role').eq('user_id', managerId).maybeSingle();
    if (!p || !a.manageKeys.has(p.role as string)) return NextResponse.json({ error: '교육 운영 권한이 있는 계정이 아닙니다.' }, { status: 400 });
  } else if (a.role === 'admin') {
    return NextResponse.json({ error: '일정을 넣을 매니저를 선택하세요.' }, { status: 400 });
  }

  // 교육 대상: 승인된 스탭만(매니저급·대기 계정은 걸러냄)
  let traineeIds: string[] = [];
  if (wantIds.length) {
    const { data: staff } = await a.svc.from('profiles').select('user_id, role').in('user_id', wantIds).eq('status', 'active');
    traineeIds = (staff ?? []).filter((p) => !a.manageKeys.has(p.role as string)).map((p) => p.user_id as string);
    if (traineeIds.length !== wantIds.length) return NextResponse.json({ error: '교육 대상은 승인된 스탭만 고를 수 있어요.' }, { status: 400 });
  }

  const { data, error } = await a.svc
    .from('teaching_shifts')
    .upsert(
      { manager_id: managerId, date, store, start_time: startTime, end_time: endTime, created_by: a.userId },
      { onConflict: 'manager_id,date' },
    )
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 교육 대상은 통째로 교체
  const shiftId = data.id as number;
  await a.svc.from('teaching_shift_trainees').delete().eq('shift_id', shiftId);
  if (traineeIds.length) {
    const { error: trErr } = await a.svc.from('teaching_shift_trainees').insert(traineeIds.map((user_id) => ({ shift_id: shiftId, user_id })));
    if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: shiftId });
}

export async function DELETE(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });
  let q = a.svc.from('teaching_shifts').delete().eq('id', id);
  if (a.role !== 'admin') q = q.eq('manager_id', a.userId);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
