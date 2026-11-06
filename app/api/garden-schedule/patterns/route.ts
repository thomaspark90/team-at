import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { segmentError } from '@/lib/schedule/time';
import type { PatternDay } from '@/lib/schedule/types';

export const runtime = 'nodejs';

// 고정 근무 패턴(운영진 전용). GET ?store → { patterns: { [staffId]: PatternDay[] } } / PUT { store, staffId, days: PatternDay[] } — 그 사람·지점 패턴 통째로 교체.
export async function GET(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const store = new URL(req.url).searchParams.get('store');
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  const { data, error } = await a.svc.from('schedule_staff_patterns').select('staff_id, dow, start_min, end_min').eq('store', store).order('dow');
  if (error) return dbError(error);
  const patterns: Record<number, PatternDay[]> = {};
  for (const r of data ?? []) (patterns[Number(r.staff_id)] ??= []).push({ dow: r.dow, start: r.start_min, end: r.end_min });
  return NextResponse.json({ patterns });
}

export async function PUT(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  const staffId = Number(b?.staffId);
  if (!Number.isInteger(staffId)) return badRequest('근무자를 선택하세요.');
  if (!Array.isArray(b?.days)) return badRequest('패턴이 올바르지 않습니다.');
  const days: PatternDay[] = b.days.map((d: PatternDay) => ({ dow: Number(d?.dow), start: Number(d?.start), end: Number(d?.end) }));
  if (days.some((d) => !Number.isInteger(d.dow) || d.dow < 0 || d.dow > 6)) return badRequest('요일이 올바르지 않습니다.');
  if (new Set(days.map((d) => d.dow)).size !== days.length) return badRequest('같은 요일이 두 번 있습니다.');
  for (const d of days) {
    const e = segmentError([{ start: d.start, end: d.end }]);
    if (e) return badRequest(e);
  }
  const { error: dErr } = await a.svc.from('schedule_staff_patterns').delete().eq('store', b.store).eq('staff_id', staffId);
  if (dErr) return dbError(dErr);
  if (days.length) {
    const { error } = await a.svc.from('schedule_staff_patterns').insert(days.map((d) => ({ staff_id: staffId, store: b.store, dow: d.dow, start_min: d.start, end_min: d.end })));
    if (error) return dbError(error);
  }
  return NextResponse.json({ ok: true });
}
