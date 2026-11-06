import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { weekDays, weekStartOf } from '@/lib/schedule/time';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { token, weekStart, staffId } — 직원 링크의 '확인했어요'. 세션 없음: 토큰이 지점을 증명한다.
// 이름은 본인 확인 없이 고른다(2026-11-06 대표 결정 — 링크 화면 안에서만). 그 주 그 지점에 근무가 있는 사람만 받는다.
export async function POST(req: Request) {
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const token = String(b?.token ?? '');
  const staffId = Number(b?.staffId);
  if (!token || !isYmd(b?.weekStart) || !Number.isInteger(staffId)) return NextResponse.json({ error: '요청이 올바르지 않습니다.' }, { status: 400 });
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', token).maybeSingle();
  if (!link) return NextResponse.json({ error: '링크가 올바르지 않습니다.' }, { status: 404 });
  const weekStart = weekStartOf(b.weekStart);
  const days = weekDays(weekStart);
  const { data: week } = await svc.from('schedule_weeks').select('status, published_at').eq('store', link.store).eq('week_start', weekStart).maybeSingle();
  if (week?.status !== 'published' || !week.published_at) return NextResponse.json({ error: '아직 배포되지 않은 주입니다.' }, { status: 409 });
  const { count } = await svc
    .from('schedule_shifts')
    .select('id', { count: 'exact', head: true })
    .eq('store', link.store)
    .eq('kind', 'plan')
    .eq('staff_id', staffId)
    .gte('work_date', days[0])
    .lte('work_date', days[6]);
  if (!count) return NextResponse.json({ error: '이 주에 근무가 없는 사람입니다.' }, { status: 400 });
  const { error } = await svc
    .from('schedule_publish_acks')
    .upsert({ store: link.store, week_start: weekStart, staff_id: staffId, published_at: week.published_at, acked_at: new Date().toISOString() }, { onConflict: 'store,week_start,staff_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
