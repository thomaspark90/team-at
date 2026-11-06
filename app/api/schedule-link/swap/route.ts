import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { weekStartOf } from '@/lib/schedule/time';
import { isYmd, kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 직원 링크의 교대 요청. GET ?token → 이 지점의 최근 요청(이름·상태) / POST { token, requesterId, requesterDate, targetId, targetDate?, note }
// 세션 없음: 토큰이 지점을 증명, 이름은 본인 확인 없이 고른다(확인했어요와 같은 원칙). 승인은 운영진 화면에서.
const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status });

export async function GET(req: Request) {
  const svc = serviceClient();
  if (!svc) return bad('서버 설정 누락', 500);
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', token).maybeSingle();
  if (!link) return bad('링크가 올바르지 않습니다.', 404);
  const [q, s] = await Promise.all([
    svc.from('schedule_swap_requests').select('id, requester_id, requester_date, target_id, target_date, status, requested_at').eq('store', link.store).gte('requester_date', kstToday().slice(0, 10)).order('requested_at', { ascending: false }).limit(20),
    svc.from('schedule_staff').select('id, name'),
  ]);
  const nameOf = new Map((s.data ?? []).map((x) => [Number(x.id), x.name as string]));
  return NextResponse.json({
    requests: (q.data ?? []).map((r) => ({ id: Number(r.id), requester: nameOf.get(Number(r.requester_id)), requesterDate: r.requester_date, target: nameOf.get(Number(r.target_id)), targetDate: r.target_date, status: r.status })),
  });
}

export async function POST(req: Request) {
  const svc = serviceClient();
  if (!svc) return bad('서버 설정 누락', 500);
  const b = await req.json().catch(() => ({}));
  const token = String(b?.token ?? '');
  const requesterId = Number(b?.requesterId);
  const targetId = Number(b?.targetId);
  if (!token || !Number.isInteger(requesterId) || !Number.isInteger(targetId) || !isYmd(b?.requesterDate)) return bad('요청이 올바르지 않습니다.');
  if (requesterId === targetId) return bad('본인과는 바꿀 수 없습니다.');
  const targetDate: string | null = b?.targetDate ? (isYmd(b.targetDate) ? b.targetDate : null) : null;
  if (b?.targetDate && !targetDate) return bad('상대 날짜가 올바르지 않습니다.');
  if (b.requesterDate < kstToday()) return bad('지난 날짜는 바꿀 수 없습니다.');
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', token).maybeSingle();
  if (!link) return bad('링크가 올바르지 않습니다.', 404);
  const store = link.store as string;
  const { data: staff } = await svc.from('schedule_staff').select('id, stores, home_store, active').in('id', [requesterId, targetId]);
  const ok = (id: number) => (staff ?? []).some((s) => Number(s.id) === id && s.active && (((s.stores as string[] | null)?.length ? (s.stores as string[]) : [s.home_store]).includes(store)));
  if (!ok(requesterId) || !ok(targetId)) return bad('이 지점 근무자가 아닙니다.');
  // 배포된 주의 계획 근무가 있어야 바꿀 수 있다
  const hasShift = async (id: number, date: string) => {
    const { data: w } = await svc.from('schedule_weeks').select('status').eq('store', store).eq('week_start', weekStartOf(date)).maybeSingle();
    if (w?.status !== 'published') return false;
    const { count } = await svc.from('schedule_shifts').select('id', { count: 'exact', head: true }).eq('store', store).eq('kind', 'plan').eq('staff_id', id).eq('work_date', date);
    return !!count;
  };
  if (!(await hasShift(requesterId, b.requesterDate))) return bad('그날 배포된 근무가 없습니다.');
  if (targetDate && !(await hasShift(targetId, targetDate))) return bad('상대가 그날 근무가 없습니다.');
  const { data: dup } = await svc.from('schedule_swap_requests').select('id').eq('store', store).eq('requester_id', requesterId).eq('requester_date', b.requesterDate).eq('status', 'pending').maybeSingle();
  if (dup) return bad('같은 날 대기 중인 요청이 이미 있습니다.', 409);
  const { error } = await svc.from('schedule_swap_requests').insert({ store, requester_id: requesterId, requester_date: b.requesterDate, target_id: targetId, target_date: targetDate, note: String(b?.note ?? '').trim().slice(0, 200) });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
