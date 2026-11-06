import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { leaveRemaining, substituteBalance } from '@/lib/schedule/time';
import { leaveExpiry } from '@/lib/schedule/leave';
import { kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 직원 링크의 '내 연차' — GET ?token (그 지점 재직자 이름 목록) / ?token&staffId (잔여·대체·신청 상태).
// 세션 없음: 토큰이 지점을 증명하고, 이름은 본인 확인 없이 고른다(확인했어요와 같은 원칙). 금액·메모는 싣지 않는다.
export async function GET(req: Request) {
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', token).maybeSingle();
  if (!link) return NextResponse.json({ error: '링크가 올바르지 않습니다.' }, { status: 404 });
  const { data: staff } = await svc.from('schedule_staff').select('id, name, stores, home_store').eq('active', true).order('name');
  const here = (staff ?? []).filter((s) => ((s.stores as string[] | null)?.length ? (s.stores as string[]) : [s.home_store]).includes(link.store));
  const staffId = Number(url.searchParams.get('staffId'));
  if (!url.searchParams.get('staffId')) return NextResponse.json({ people: here.map((s) => ({ id: Number(s.id), name: s.name })) });
  const me = here.find((s) => Number(s.id) === staffId);
  if (!me) return NextResponse.json({ error: '이 지점 근무자가 아닙니다.' }, { status: 400 });
  const [b, r, q] = await Promise.all([
    svc.from('leave_balances').select('total_days, as_of').eq('staff_id', staffId).maybeSingle(),
    svc.from('leave_records').select('leave_date, type').eq('staff_id', staffId).order('leave_date', { ascending: false }),
    svc.from('leave_requests').select('leave_date, type, status').eq('staff_id', staffId).order('requested_at', { ascending: false }).limit(10),
  ]);
  const records = (r.data ?? []).map((x) => ({ type: x.type as string, date: x.leave_date as string }));
  const total = b.data ? Number(b.data.total_days) : null;
  const asOf = (b.data?.as_of as string | null) ?? null;
  return NextResponse.json({
    name: me.name,
    total,
    remaining: leaveRemaining(total, asOf, records),
    expiresOn: asOf ? leaveExpiry(asOf) : null,
    substitute: substituteBalance(records),
    usedThisYear: records.filter((x) => x.type === 'annual' && x.date >= kstToday().slice(0, 4) + '-01-01').length,
    requests: (q.data ?? []).map((x) => ({ date: x.leave_date, type: x.type, status: x.status })),
  });
}
