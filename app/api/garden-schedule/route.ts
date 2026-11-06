import { NextResponse } from 'next/server';
import { badRequest, isStore, requireScheduleActor } from '@/lib/schedule/access';
import { loadWeek } from '@/lib/schedule/queries';
import { weekStartOf } from '@/lib/schedule/time';
import { isYmd, kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// GET ?store=yangjae&week=YYYY-MM-DD — 주간 스케줄. 공개 범위는 loadWeek 가 판정한다.
export async function GET(req: Request) {
  const a = await requireScheduleActor();
  if (a instanceof NextResponse) return a;
  const url = new URL(req.url);
  const store = url.searchParams.get('store');
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  const week = url.searchParams.get('week');
  const weekStart = weekStartOf(isYmd(week) ? week : kstToday());
  try {
    return NextResponse.json(await loadWeek(a.svc, store, weekStart, a.editor));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
