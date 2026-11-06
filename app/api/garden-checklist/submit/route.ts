import { NextResponse } from 'next/server';
import { badRequest, dbError, requireChecklistActor } from '@/lib/checklist/access';
import { itemsDue, unfinishedItems } from '@/lib/checklist/logic';
import { loadCrews } from '@/lib/checklist/crew';
import { loadItems, openRun, toCheck } from '@/lib/checklist/queries';
import { isStore } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// POST { store, date, shiftType } — 제출(책임자 또는 운영진). 빠진 항목이 있으면 막고, 그 시점 항목을 함께 저장해 기록을 고정한다.
export async function POST(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => null);
  if (!b || !isStore(b.store) || (b.shiftType !== 'open' && b.shiftType !== 'close')) return badRequest('요청이 올바르지 않습니다.');
  const run = await openRun(a.svc, a, { store: b.store, date: b.date, shiftType: b.shiftType });
  if ('error' in run) return NextResponse.json({ error: run.error }, { status: run.status });
  if (!a.editor) {
    const crews = await loadCrews(a.svc, b.date);
    if (crews.of(b.store, b.shiftType).leadId !== a.staffId) return NextResponse.json({ error: '제출은 오늘의 책임자가 합니다.' }, { status: 403 });
  }

  const [items, checksRes] = await Promise.all([
    loadItems(a.svc, b.store),
    a.svc.from('checklist_checks').select('*').eq('run_id', run.runId),
  ]);
  if (checksRes.error) return dbError(checksRes.error);
  const due = itemsDue(items.filter((i) => i.shiftType === b.shiftType), b.date);
  const missing = unfinishedItems(due, (checksRes.data ?? []).map(toCheck));
  if (missing.length) return NextResponse.json({ error: `아직 ${missing.length}개 남았습니다.`, missing: missing.map((i) => i.id) }, { status: 400 });

  const submittedAt = new Date().toISOString();
  const { error } = await a.svc
    .from('checklist_runs')
    .update({ submitted_at: submittedAt, submitted_by_name: a.name, items_snapshot: due })
    .eq('id', run.runId)
    .is('submitted_at', null);
  if (error) return dbError(error);
  return NextResponse.json({ submittedAt, submittedByName: a.name });
}
