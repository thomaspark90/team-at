import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { weekStartOf } from '@/lib/schedule/time';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { store, weekStart, publish } — 배포하면 직원 화면·링크에 그 주 계획이 보인다.
export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(b?.weekStart)) return badRequest('주가 올바르지 않습니다.');
  const publish = b?.publish !== false;
  const { error } = await a.svc.from('schedule_weeks').upsert(
    {
      store: b.store,
      week_start: weekStartOf(b.weekStart),
      status: publish ? 'published' : 'draft',
      published_at: publish ? new Date().toISOString() : null,
      published_by: publish ? a.email : null,
    },
    { onConflict: 'store,week_start' },
  );
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
