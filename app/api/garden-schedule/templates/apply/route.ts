import { NextResponse } from 'next/server';
import { badRequest, dbError, requireScheduleEditor } from '@/lib/schedule/access';
import { weekDays, weekStartOf } from '@/lib/schedule/time';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { id, weekStart, overwrite? } — 템플릿을 그 주의 계획으로 넣는다. 지점은 템플릿의 것.
// 이미 계획이 있으면 overwrite 없이는 409. 저장 뒤 퇴사한 사람은 뺀다(skipped 로 알려 준다).
export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('템플릿을 선택하세요.');
  if (!isYmd(b?.weekStart)) return badRequest('주가 올바르지 않습니다.');
  const { data: t } = await a.svc.from('schedule_week_templates').select('store, name, shifts').eq('id', id).maybeSingle();
  if (!t) return NextResponse.json({ error: '템플릿을 찾을 수 없습니다.' }, { status: 404 });
  const days = weekDays(weekStartOf(b.weekStart));
  const rows = (Array.isArray(t.shifts) ? t.shifts : []) as { dow: number; s: number; a: number; b: number }[];

  const { count, error: cErr } = await a.svc
    .from('schedule_shifts')
    .select('id', { count: 'exact', head: true })
    .eq('store', t.store)
    .eq('kind', 'plan')
    .gte('work_date', days[0])
    .lte('work_date', days[6]);
  if (cErr) return dbError(cErr);
  if ((count ?? 0) > 0 && b?.overwrite !== true) return NextResponse.json({ error: '이미 작성한 계획이 있습니다.', existing: count }, { status: 409 });

  const ids = Array.from(new Set(rows.map((r) => r.s)));
  const { data: staff } = await a.svc.from('schedule_staff').select('id').in('id', ids).eq('active', true);
  const active = new Set((staff ?? []).map((s) => Number(s.id)));
  const usable = rows.filter((r) => active.has(r.s) && r.dow >= 0 && r.dow < 7);
  if (!usable.length) return badRequest('템플릿에 넣을 수 있는 근무가 없습니다(모두 퇴사자).');

  if ((count ?? 0) > 0) {
    const { error } = await a.svc.from('schedule_shifts').delete().eq('store', t.store).eq('kind', 'plan').gte('work_date', days[0]).lte('work_date', days[6]);
    if (error) return dbError(error);
  }
  const { error } = await a.svc.from('schedule_shifts').insert(
    usable.map((r) => ({ work_date: days[r.dow], store: t.store, staff_id: r.s, kind: 'plan', start_min: r.a, end_min: r.b, updated_by: a.email })),
  );
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, name: t.name, copied: usable.length, skipped: ids.length - active.size });
}
