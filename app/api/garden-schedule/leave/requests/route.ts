import { NextResponse } from 'next/server';
import { badRequest, dbError, requireScheduleEditor } from '@/lib/schedule/access';
import { LEAVE_REQUEST_TYPES, type LeaveRequest } from '@/lib/schedule/types';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 연차 신청(운영진 전용 — 지금은 대신 접수). GET / POST { staffId, date, type, note } / PATCH { id, action: approve|reject, note? }
// 승인 = leave_records 에 기록 + 상태 approved. 같은 날 같은 종류 기록이 이미 있으면 기록은 두고 승인만 표시한다.
// 승인하면 그날 계획 근무는 지운다(연차/병가/오프 = 근무 없음). 계획이 들어 있으면 force 없이는 409 로 알려 확인을 받는다.
/* eslint-disable @typescript-eslint/no-explicit-any */
const toReq = (r: any): LeaveRequest => ({
  id: Number(r.id),
  staffId: Number(r.staff_id),
  date: r.leave_date,
  type: r.type,
  note: r.note,
  status: r.status,
  source: r.source,
  requestedAt: r.requested_at,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
});

export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  // 대기는 전부, 처리된 것은 최근 60건
  const [p, d] = await Promise.all([
    a.svc.from('leave_requests').select('*').eq('status', 'pending').order('leave_date'),
    a.svc.from('leave_requests').select('*').neq('status', 'pending').order('decided_at', { ascending: false }).limit(60),
  ]);
  if (p.error ?? d.error) return dbError((p.error ?? d.error)!);
  return NextResponse.json({ pending: (p.data ?? []).map(toReq), decided: (d.data ?? []).map(toReq) });
}

export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const staffId = Number(b?.staffId);
  if (!Number.isInteger(staffId)) return badRequest('근무자를 선택하세요.');
  if (!isYmd(b?.date)) return badRequest('날짜를 선택하세요.');
  const type = b?.type ?? 'annual';
  if (!LEAVE_REQUEST_TYPES.includes(type)) return badRequest('종류가 올바르지 않습니다.');
  const { data: dup } = await a.svc.from('leave_requests').select('id').eq('staff_id', staffId).eq('leave_date', b.date).eq('status', 'pending').maybeSingle();
  if (dup) return NextResponse.json({ error: '같은 날 대기 중인 신청이 이미 있습니다.' }, { status: 409 });
  const { data, error } = await a.svc
    .from('leave_requests')
    .insert({ staff_id: staffId, leave_date: b.date, type, note: String(b?.note ?? '').trim(), source: 'editor', requested_by: a.email })
    .select('*')
    .single();
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, request: toReq(data) });
}

export async function PATCH(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('신청을 선택하세요.');
  if (b?.action !== 'approve' && b?.action !== 'reject') return badRequest('승인 또는 반려만 할 수 있습니다.');
  const { data: cur } = await a.svc.from('leave_requests').select('*').eq('id', id).maybeSingle();
  if (!cur) return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  if (cur.status !== 'pending') return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 409 });
  if (b.action === 'approve') {
    const { data: planned } = await a.svc.from('schedule_shifts').select('id, store').eq('staff_id', cur.staff_id).eq('work_date', cur.leave_date).eq('kind', 'plan');
    if (planned?.length) {
      if (b?.force !== true) return NextResponse.json({ error: '그날 계획 근무가 들어 있습니다.', conflict: planned.length, stores: Array.from(new Set(planned.map((p) => p.store))) }, { status: 409 });
      const { error: dErr } = await a.svc.from('schedule_shifts').delete().in('id', planned.map((p) => p.id));
      if (dErr) return dbError(dErr);
    }
    const { error } = await a.svc
      .from('leave_records')
      .insert({ staff_id: cur.staff_id, leave_date: cur.leave_date, type: cur.type, note: cur.note });
    if (error && error.code !== '23505') return dbError(error);
  }
  const { error } = await a.svc
    .from('leave_requests')
    .update({ status: b.action === 'approve' ? 'approved' : 'rejected', decided_by: a.email, decided_at: new Date().toISOString(), decision_note: String(b?.note ?? '').trim() })
    .eq('id', id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, removedShifts: b.action === 'approve' ? Number(b?.force === true) : 0 });
}
