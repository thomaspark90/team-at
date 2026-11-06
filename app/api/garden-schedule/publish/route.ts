import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { weekStartOf, weekDays } from '@/lib/schedule/time';
import { snapshotOf } from '@/lib/schedule/publish-diff';
import type { Shift } from '@/lib/schedule/types';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { store, weekStart, publish } — 배포하면 직원 화면·링크에 그 주 계획이 보인다.
// 배포할 때 계획 스냅샷을 남긴다. 직전 스냅샷과 다르면 prev 로 밀어 '지난 배포 후 바뀐 칸'을 직원에게 보여 준다.
// 배포 취소는 스냅샷을 지우지 않는다(다시 배포할 때 비교 기준).
export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(b?.weekStart)) return badRequest('주가 올바르지 않습니다.');
  const publish = b?.publish !== false;
  const weekStart = weekStartOf(b.weekStart);
  const row: Record<string, unknown> = {
    store: b.store,
    week_start: weekStart,
    status: publish ? 'published' : 'draft',
    published_at: publish ? new Date().toISOString() : null,
    published_by: publish ? a.email : null,
  };
  if (publish) {
    const days = weekDays(weekStart);
    const [{ data: cur }, { data: plan, error: pErr }] = await Promise.all([
      a.svc.from('schedule_weeks').select('snapshot').eq('store', b.store).eq('week_start', weekStart).maybeSingle(),
      a.svc.from('schedule_shifts').select('work_date, staff_id, start_min, end_min, is_off').eq('store', b.store).eq('kind', 'plan').gte('work_date', days[0]).lte('work_date', days[6]),
    ]);
    if (pErr) return dbError(pErr);
    const snapshot = snapshotOf(
      (plan ?? []).map((s) => ({ date: s.work_date, staffId: Number(s.staff_id), start: s.start_min ?? undefined, end: s.end_min ?? undefined, isOff: s.is_off }) as Shift),
    );
    row.snapshot = snapshot;
    if (cur?.snapshot && JSON.stringify(cur.snapshot) !== JSON.stringify(snapshot)) row.prev_snapshot = cur.snapshot;
  }
  const { error } = await a.svc.from('schedule_weeks').upsert(row, { onConflict: 'store,week_start' });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
