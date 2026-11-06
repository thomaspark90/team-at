import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { segmentError } from '@/lib/schedule/time';
import type { Segment } from '@/lib/schedule/types';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// PUT { store, date, staffId, kind, segments: [{start,end}], off? } — 한 사람·하루·지점의 칸을 통째로 교체.
//  · segments 빈 배열 + off 없음: 계획은 근무 삭제, 실제는 기록 삭제(= 계획대로로 복귀)
//  · off(실제 전용): 계획이 있었지만 근무하지 않음
// 앱에서 고친 칸은 source='app' 이 되어 시트 재이관이 덮어쓰지 않는다.
export async function PUT(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const { store, date, kind } = b ?? {};
  const staffId = Number(b?.staffId);
  const off = b?.off === true;
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(date)) return badRequest('날짜가 올바르지 않습니다.');
  if (kind !== 'plan' && kind !== 'actual') return badRequest('계획/실제 구분이 올바르지 않습니다.');
  if (!Number.isInteger(staffId)) return badRequest('근무자를 선택하세요.');
  if (off && kind !== 'actual') return badRequest('쉬었음은 실제 근무에만 기록합니다.');
  const segments: Segment[] = Array.isArray(b?.segments) ? b.segments.map((s: Segment) => ({ start: Number(s?.start), end: Number(s?.end) })) : [];
  const invalid = segmentError(segments);
  if (invalid) return badRequest(invalid);

  const match = { work_date: date, store, staff_id: staffId, kind };
  const { error: delErr } = await a.svc.from('schedule_shifts').delete().match(match);
  if (delErr) return dbError(delErr);
  const rows: Record<string, unknown>[] = off
    ? [{ ...match, is_off: true, updated_by: a.email }]
    : segments.map((s) => ({ ...match, start_min: s.start, end_min: s.end, updated_by: a.email }));
  if (rows.length) {
    const { error } = await a.svc.from('schedule_shifts').insert(rows);
    if (error) return dbError(error);
  }
  return NextResponse.json({ ok: true });
}
