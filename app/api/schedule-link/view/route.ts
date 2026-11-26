import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { weekStartOf } from '@/lib/schedule/time';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { token, weekStart, visitor } — 직원 링크 열람 기록. 세션 없음: 토큰이 지점을 증명한다.
// visitor 는 기기가 만든 임의 값(이름 아님) — 몇 대가 봤는지만 센다.
export async function POST(req: Request) {
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const token = String(b?.token ?? '');
  if (!token || !isYmd(b?.weekStart)) return NextResponse.json({ error: '요청이 올바르지 않습니다.' }, { status: 400 });
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', token).maybeSingle();
  if (!link) return NextResponse.json({ error: '링크가 올바르지 않습니다.' }, { status: 404 });
  const visitor = String(b?.visitor ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const { error } = await svc.from('schedule_link_views').insert({ store: link.store, week_start: weekStartOf(b.weekStart), visitor });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
