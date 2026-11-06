import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { badRequest, dbError, requireChecklistActor } from '@/lib/checklist/access';
import { openRun, toCheck } from '@/lib/checklist/queries';
import { isStore } from '@/lib/schedule/access';

export const runtime = 'nodejs';

// POST { store, date, shiftType, itemId, action: 'done' | 'skip' | 'clear', reason? }
// 사진 필수 항목의 완료는 여기로 못 온다 — /photo 로 촬영본을 보내야 완료가 된다.
export async function POST(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => null);
  if (!b || !isStore(b.store) || (b.shiftType !== 'open' && b.shiftType !== 'close')) return badRequest('요청이 올바르지 않습니다.');
  const itemId = Number(b.itemId);
  if (!Number.isInteger(itemId)) return badRequest('항목이 올바르지 않습니다.');

  const run = await openRun(a.svc, a, { store: b.store, date: b.date, shiftType: b.shiftType });
  if ('error' in run) return NextResponse.json({ error: run.error }, { status: run.status });

  const { data: item, error: itemErr } = await a.svc.from('checklist_items').select('id, store, shift_type, photo_required').eq('id', itemId).maybeSingle();
  if (itemErr) return dbError(itemErr);
  if (!item || item.store !== b.store || item.shift_type !== b.shiftType) return badRequest('이 체크리스트의 항목이 아닙니다.');

  const { data: prev } = await a.svc.from('checklist_checks').select('photo_path').eq('run_id', run.runId).eq('item_id', itemId).maybeSingle();
  const dropPhoto = async () => {
    if (prev?.photo_path) await del(prev.photo_path).catch((e) => console.error('[checklist] 사진 삭제 실패:', e));
  };

  if (b.action === 'clear') {
    const { error } = await a.svc.from('checklist_checks').delete().eq('run_id', run.runId).eq('item_id', itemId);
    if (error) return dbError(error);
    await dropPhoto();
    return NextResponse.json({ check: null });
  }

  if (b.action !== 'done' && b.action !== 'skip') return badRequest('요청이 올바르지 않습니다.');
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 300) : '';
  if (b.action === 'skip' && !reason) return badRequest('못 한 사유를 적어주세요.');
  if (b.action === 'done' && item.photo_required) return badRequest('사진을 찍어야 완료됩니다.');

  const { data, error } = await a.svc
    .from('checklist_checks')
    .upsert(
      {
        run_id: run.runId,
        item_id: itemId,
        status: b.action === 'done' ? 'done' : 'skipped',
        skip_reason: b.action === 'skip' ? reason : null,
        photo_path: null,
        photo_taken_at: null,
        photo_deleted_at: null,
        done_by: a.userId,
        done_by_name: a.name,
        done_at: new Date().toISOString(),
      },
      { onConflict: 'run_id,item_id' },
    )
    .select('*')
    .single();
  if (error) return dbError(error);
  await dropPhoto();
  return NextResponse.json({ check: toCheck(data) });
}
