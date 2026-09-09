import { NextResponse } from 'next/server';
import { requireActor, isActor, forbid } from '@/lib/teaching/access';

export const runtime = 'nodejs';

// 시간 칸 메모 — PUT { shiftId, hour(0~23), note }. 대표(admin)만.
// 빈 note 는 칸 삭제. 일정이 없으면 404.
export async function PUT(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (a.role !== 'admin') return forbid('세부 스케줄은 대표만 적을 수 있습니다.');
  const body = await req.json().catch(() => ({}));
  const shiftId = Number(body?.shiftId);
  const hour = Number(body?.hour);
  const note = String(body?.note ?? '').trim().slice(0, 200);
  if (!Number.isFinite(shiftId)) return NextResponse.json({ error: 'shiftId 가 필요합니다.' }, { status: 400 });
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return NextResponse.json({ error: '시간이 올바르지 않습니다.' }, { status: 400 });

  const { data: shift } = await a.svc.from('teaching_shifts').select('id').eq('id', shiftId).maybeSingle();
  if (!shift) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 });

  const q = note
    ? a.svc.from('teaching_shift_slots').upsert({ shift_id: shiftId, hour, note, updated_at: new Date().toISOString() }, { onConflict: 'shift_id,hour' })
    : a.svc.from('teaching_shift_slots').delete().eq('shift_id', shiftId).eq('hour', hour);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
