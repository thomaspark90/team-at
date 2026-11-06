import { NextResponse } from 'next/server';
import { requireChecklistActor } from '@/lib/checklist/access';
import { loadDay } from '@/lib/checklist/queries';
import { isYmd, kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// GET ?date=YYYY-MM-DD — 하루치 체크리스트. 직원은 오늘 자기 배정분만, 다른 날짜는 운영진만.
export async function GET(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  const asked = new URL(req.url).searchParams.get('date');
  const date = a.editor && isYmd(asked) ? asked : kstToday();
  try {
    return NextResponse.json(await loadDay(a.svc, date, a));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
