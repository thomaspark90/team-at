import { NextResponse } from 'next/server';
import { badRequest, dbError, forbid, requireChecklistActor } from '@/lib/checklist/access';
import { isStore } from '@/lib/schedule/access';
import { kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// POST { store, date, shiftType } — 당일 제출 다시 열기(운영진). 체크는 그대로 두고, 되돌린 사람·시각과 이전 제출을 남긴다.
export async function POST(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  if (!a.editor) return forbid();
  const b = await req.json().catch(() => null);
  if (!b || !isStore(b.store) || (b.shiftType !== 'open' && b.shiftType !== 'close')) return badRequest('요청이 올바르지 않습니다.');
  if (b.date !== kstToday()) return badRequest('당일 제출만 다시 열 수 있습니다.');

  const { data: run, error } = await a.svc
    .from('checklist_runs')
    .select('id, submitted_at, submitted_by_name')
    .eq('store', b.store)
    .eq('work_date', b.date)
    .eq('shift_type', b.shiftType)
    .maybeSingle();
  if (error) return dbError(error);
  if (!run?.submitted_at) return badRequest('제출되지 않은 체크리스트입니다.');

  const { error: logErr } = await a.svc.from('checklist_reopens').insert({
    run_id: run.id,
    reopened_by: a.userId,
    reopened_by_name: a.name,
    prev_submitted_at: run.submitted_at,
    prev_submitted_by_name: run.submitted_by_name,
  });
  if (logErr) return dbError(logErr);
  const { error: upErr } = await a.svc.from('checklist_runs').update({ submitted_at: null, submitted_by_name: null, items_snapshot: null }).eq('id', run.id);
  if (upErr) return dbError(upErr);
  return NextResponse.json({ ok: true });
}
