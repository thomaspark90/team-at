import { NextResponse } from 'next/server';
import { requireActor, isActor, forbid } from '@/lib/teaching/access';

export const runtime = 'nodejs';

// 시간 칸 — PUT { shiftId, hour(0~23), note?, traineeIds? }. 대표(admin)만.
//  · note: 빈 문자열이면 메모 칸 삭제(참여 인원은 유지). 생략하면 메모는 건드리지 않는다.
//  · traineeIds: 그 시간에 참여할 스탭 전체 집합(빈 배열 = 아무도 지정 안 함). 생략하면 인원은 건드리지 않는다.
//    지점 스탭(교육 운영 권한 없는 승인 계정)만 받는다.
export async function PUT(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (a.role !== 'admin') return forbid('세부 스케줄은 대표만 적을 수 있습니다.');
  const body = await req.json().catch(() => ({}));
  const shiftId = Number(body?.shiftId);
  const hour = Number(body?.hour);
  if (!Number.isFinite(shiftId)) return NextResponse.json({ error: 'shiftId 가 필요합니다.' }, { status: 400 });
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return NextResponse.json({ error: '시간이 올바르지 않습니다.' }, { status: 400 });

  const { data: shift } = await a.svc.from('teaching_shifts').select('id, store').eq('id', shiftId).maybeSingle();
  if (!shift) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 });

  if (body?.note !== undefined) {
    const note = String(body.note ?? '').trim().slice(0, 200);
    const q = note
      ? a.svc.from('teaching_shift_slots').upsert({ shift_id: shiftId, hour, note, updated_at: new Date().toISOString() }, { onConflict: 'shift_id,hour' })
      : a.svc.from('teaching_shift_slots').delete().eq('shift_id', shiftId).eq('hour', hour);
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(body?.traineeIds)) {
    const wantIds: string[] = Array.from(new Set(body.traineeIds.map(String)));
    let validIds: string[] = [];
    if (wantIds.length) {
      const { data: staff } = await a.svc.from('profiles').select('user_id, role').in('user_id', wantIds).eq('status', 'active');
      validIds = (staff ?? []).filter((p) => !a.manageKeys.has(p.role as string)).map((p) => p.user_id as string);
      if (validIds.length !== wantIds.length) return NextResponse.json({ error: '참여 인원은 승인된 스탭만 고를 수 있어요.' }, { status: 400 });
    }
    const { error: delErr } = await a.svc.from('teaching_shift_slot_trainees').delete().eq('shift_id', shiftId).eq('hour', hour);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    if (validIds.length) {
      const { error } = await a.svc
        .from('teaching_shift_slot_trainees')
        .insert(validIds.map((user_id) => ({ shift_id: shiftId, hour, user_id })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
