import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { store, from, to, kind, overwrite? } — 하루 근무(한 지점)를 다른 날로 복사. 표 머리의 복사·붙여넣기가 쓴다.
//  · kind='plan': 계획 → 계획. kind='actual': 실제 기록이 있으면 그것, 없으면 계획(화면의 '실제' 보기와 같은 값).
//  · 붙여넣는 날에 이미 같은 종류의 기록이 있으면 overwrite 없이는 409 — 작성한 내용을 말없이 지우지 않는다.
//  · 퇴사 처리된 사람과 '쉼' 표시는 복사하지 않는다.
export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const { store, from, to, kind } = b ?? {};
  if (!isStore(store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(from) || !isYmd(to)) return badRequest('날짜가 올바르지 않습니다.');
  if (from === to) return badRequest('같은 날에는 붙여넣을 수 없습니다.');
  if (kind !== 'plan' && kind !== 'actual') return badRequest('계획/실제 구분이 올바르지 않습니다.');

  const { data: src, error: sErr } = await a.svc
    .from('schedule_shifts')
    .select('staff_id, kind, start_min, end_min, schedule_staff!inner(active)')
    .eq('store', store)
    .eq('work_date', from)
    .eq('is_off', false);
  if (sErr) return dbError(sErr);
  const active = (src ?? []).filter((r) => (r.schedule_staff as unknown as { active: boolean }).active);
  const actual = active.filter((r) => r.kind === 'actual');
  const source = kind === 'actual' && actual.length ? actual : active.filter((r) => r.kind === 'plan');
  if (!source.length) return badRequest('복사할 근무가 없는 날입니다.');

  const { count, error: cErr } = await a.svc
    .from('schedule_shifts')
    .select('id', { count: 'exact', head: true })
    .eq('store', store)
    .eq('work_date', to)
    .eq('kind', kind);
  if (cErr) return dbError(cErr);
  if ((count ?? 0) > 0 && b?.overwrite !== true) {
    return NextResponse.json({ error: '붙여넣는 날에 이미 기록이 있습니다.', existing: count }, { status: 409 });
  }
  if ((count ?? 0) > 0) {
    const { error } = await a.svc.from('schedule_shifts').delete().eq('store', store).eq('work_date', to).eq('kind', kind);
    if (error) return dbError(error);
  }
  const { error } = await a.svc.from('schedule_shifts').insert(
    source.map((r) => ({ work_date: to, store, staff_id: r.staff_id, kind, start_min: r.start_min, end_min: r.end_min, updated_by: a.email })),
  );
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, copied: source.length, people: new Set(source.map((r) => r.staff_id)).size });
}
