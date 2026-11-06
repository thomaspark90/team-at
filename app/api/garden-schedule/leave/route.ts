import { NextResponse } from 'next/server';
import { badRequest, dbError, requireScheduleEditor } from '@/lib/schedule/access';
import { LEAVE_LABEL } from '@/lib/schedule/types';
import { isYmd, kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 연차·휴무(운영진 전용). 총개수는 입력값 — 산식이 정해지지 않아 자동 계산하지 않는다.
// GET / PUT { staffId, total } / POST { staffId, date, type, note } / DELETE { id }
export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const [b, r] = await Promise.all([
    a.svc.from('leave_balances').select('staff_id, total_days, as_of'),
    a.svc.from('leave_records').select('id, staff_id, leave_date, type, note, source').order('leave_date', { ascending: false }),
  ]);
  if (b.error ?? r.error) return dbError((b.error ?? r.error)!);
  return NextResponse.json({
    balances: (b.data ?? []).map((x) => ({ staffId: Number(x.staff_id), total: Number(x.total_days), asOf: x.as_of })),
    records: (r.data ?? []).map((x) => ({ id: Number(x.id), staffId: Number(x.staff_id), date: x.leave_date, type: x.type, note: x.note, source: x.source })),
  });
}

export async function PUT(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const staffId = Number(b?.staffId);
  if (!Number.isInteger(staffId)) return badRequest('근무자를 선택하세요.');
  if (b?.total === null || b?.total === '') {
    const { error } = await a.svc.from('leave_balances').delete().eq('staff_id', staffId);
    return error ? dbError(error) : NextResponse.json({ ok: true });
  }
  const total = Number(b?.total);
  if (!Number.isFinite(total) || total < 0 || total * 2 !== Math.floor(total * 2)) return badRequest('총 연차는 0.5개 단위로 넣어주세요.');
  // 기준일은 처음 입력한 날 유지 — 총개수만 고쳐도 이미 쓴 연차가 잔여에서 빠지지 않는 일이 없게
  const { data: cur } = await a.svc.from('leave_balances').select('as_of').eq('staff_id', staffId).maybeSingle();
  const { error } = await a.svc
    .from('leave_balances')
    .upsert({ staff_id: staffId, total_days: total, as_of: cur?.as_of ?? kstToday(), updated_at: new Date().toISOString() });
  return error ? dbError(error) : NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const staffId = Number(b?.staffId);
  if (!Number.isInteger(staffId)) return badRequest('근무자를 선택하세요.');
  if (!isYmd(b?.date)) return badRequest('날짜를 선택하세요.');
  if (!(b?.type in LEAVE_LABEL)) return badRequest('종류를 선택하세요.');
  const { error } = await a.svc
    .from('leave_records')
    .insert({ staff_id: staffId, leave_date: b.date, type: b.type, note: String(b?.note ?? '').trim() });
  if (error?.code === '23505') return NextResponse.json({ error: '같은 날 같은 종류의 기록이 이미 있습니다.' }, { status: 409 });
  return error ? dbError(error) : NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('기록을 선택하세요.');
  const { error } = await a.svc.from('leave_records').delete().eq('id', id);
  return error ? dbError(error) : NextResponse.json({ ok: true });
}
