import { NextResponse } from 'next/server';
import { badRequest, dbError, requireScheduleEditor } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// 교대 요청(운영진 전용). GET → 대기 전부 + 처리된 최근 30 / PATCH { id, action: approve|reject }
// 승인 = 계획 근무의 사람을 맞바꾼다(요청자 날의 근무 → 상대, 상대 날의 근무 → 요청자). 받는 쪽이 그날 이미 근무가 있으면 승인하지 않는다(운영진이 직접 고치라고 알림).
/* eslint-disable @typescript-eslint/no-explicit-any */
const toReq = (r: any) => ({ id: Number(r.id), store: r.store, requesterId: Number(r.requester_id), requesterDate: r.requester_date, targetId: Number(r.target_id), targetDate: r.target_date, note: r.note, status: r.status, requestedAt: r.requested_at, decidedAt: r.decided_at });

export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const [p, d] = await Promise.all([
    a.svc.from('schedule_swap_requests').select('*').eq('status', 'pending').order('requester_date'),
    a.svc.from('schedule_swap_requests').select('*').neq('status', 'pending').order('decided_at', { ascending: false }).limit(30),
  ]);
  if (p.error ?? d.error) return dbError((p.error ?? d.error)!);
  return NextResponse.json({ pending: (p.data ?? []).map(toReq), decided: (d.data ?? []).map(toReq) });
}

export async function PATCH(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('요청을 선택하세요.');
  if (b?.action !== 'approve' && b?.action !== 'reject') return badRequest('승인 또는 반려만 할 수 있습니다.');
  const { data: cur } = await a.svc.from('schedule_swap_requests').select('*').eq('id', id).maybeSingle();
  if (!cur) return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 });
  if (cur.status !== 'pending') return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 409 });
  if (b.action === 'approve') {
    const plan = (staffId: number, date: string) => a.svc.from('schedule_shifts').select('id').eq('store', cur.store).eq('kind', 'plan').eq('staff_id', staffId).eq('work_date', date);
    const [mine, theirsOnMyDay] = await Promise.all([plan(cur.requester_id, cur.requester_date), plan(cur.target_id, cur.requester_date)]);
    if (!mine.data?.length) return NextResponse.json({ error: '요청자의 그날 근무가 이미 없습니다. 반려하거나 직접 고치세요.' }, { status: 409 });
    if (theirsOnMyDay.data?.length) return NextResponse.json({ error: '상대가 그날 이미 근무가 있어 맞바꿀 수 없습니다. 직접 고치세요.' }, { status: 409 });
    let theirs: { id: number }[] = [];
    if (cur.target_date) {
      const [t, mineOnTheirDay] = await Promise.all([plan(cur.target_id, cur.target_date), plan(cur.requester_id, cur.target_date)]);
      if (!t.data?.length) return NextResponse.json({ error: '상대의 그날 근무가 이미 없습니다.' }, { status: 409 });
      if (mineOnTheirDay.data?.length) return NextResponse.json({ error: '요청자가 상대 날에 이미 근무가 있어 맞바꿀 수 없습니다.' }, { status: 409 });
      theirs = t.data as any;
    }
    const u1 = await a.svc.from('schedule_shifts').update({ staff_id: cur.target_id, source: 'app', updated_by: a.email }).in('id', mine.data.map((x: any) => x.id));
    if (u1.error) return dbError(u1.error);
    if (theirs.length) {
      const u2 = await a.svc.from('schedule_shifts').update({ staff_id: cur.requester_id, source: 'app', updated_by: a.email }).in('id', theirs.map((x) => x.id));
      if (u2.error) return dbError(u2.error);
    }
  }
  const { error } = await a.svc.from('schedule_swap_requests').update({ status: b.action === 'approve' ? 'approved' : 'rejected', decided_by: a.email, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
