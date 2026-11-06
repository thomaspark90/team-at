import { NextResponse } from 'next/server';
import { del, get, put } from '@vercel/blob';
import { badRequest, dbError, forbid, requireChecklistActor } from '@/lib/checklist/access';
import { isOnCrew } from '@/lib/checklist/crew';
import { openRun, toCheck } from '@/lib/checklist/queries';
import { isStore } from '@/lib/schedule/access';
import type { ShiftType } from '@/lib/checklist/types';

export const runtime = 'nodejs';

// 항목 사진 — 화면(CameraCapture)이 앱 안 카메라로 찍은 JPEG 만 보낸다. 갤러리에서 고르는 입력은 어디에도 없다.
// 촬영 시각은 기기 값을 믿지 않고 서버가 받은 시각으로 기록한다. 저장은 private Blob.

const MAX_BYTES = 4 * 1024 * 1024; // Vercel 함수 바디 한도(4.5MB) 안쪽 — 화면에서 긴 변 1280px 로 줄여 보낸다

export async function POST(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  const form = await req.formData().catch(() => null);
  const file = form?.get('photo');
  const store = form?.get('store');
  const date = form?.get('date');
  const shiftType = form?.get('shiftType');
  const itemId = Number(form?.get('itemId'));
  if (!(file instanceof File) || file.type !== 'image/jpeg' || file.size === 0) return badRequest('사진을 받지 못했습니다.');
  if (file.size > MAX_BYTES) return badRequest('사진 용량이 너무 큽니다.');
  if (!isStore(store) || typeof date !== 'string' || (shiftType !== 'open' && shiftType !== 'close') || !Number.isInteger(itemId)) {
    return badRequest('요청이 올바르지 않습니다.');
  }

  const run = await openRun(a.svc, a, { store, date, shiftType: shiftType as ShiftType });
  if ('error' in run) return NextResponse.json({ error: run.error }, { status: run.status });
  const { data: item, error: itemErr } = await a.svc.from('checklist_items').select('id, store, shift_type').eq('id', itemId).maybeSingle();
  if (itemErr) return dbError(itemErr);
  if (!item || item.store !== store || item.shift_type !== shiftType) return badRequest('이 체크리스트의 항목이 아닙니다.');

  const { data: prev } = await a.svc.from('checklist_checks').select('photo_path').eq('run_id', run.runId).eq('item_id', itemId).maybeSingle();
  const blob = await put(`checklist/${store}/${date}/${shiftType}-${itemId}-${Date.now()}.jpg`, file, {
    access: 'private',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
  });
  const now = new Date().toISOString();
  const { data, error } = await a.svc
    .from('checklist_checks')
    .upsert(
      {
        run_id: run.runId,
        item_id: itemId,
        status: 'done',
        skip_reason: null,
        photo_path: blob.pathname,
        photo_taken_at: now,
        photo_deleted_at: null,
        done_by: a.userId,
        done_by_name: a.name,
        done_at: now,
      },
      { onConflict: 'run_id,item_id' },
    )
    .select('*')
    .single();
  if (error) {
    await del(blob.pathname).catch(() => undefined);
    return dbError(error);
  }
  if (prev?.photo_path) await del(prev.photo_path).catch((e) => console.error('[checklist] 이전 사진 삭제 실패:', e));
  return NextResponse.json({ check: toCheck(data) });
}

// GET ?checkId= — 사진 보기. 운영진 또는 그날 그 조 인원만(id 가 연번이라 검사 없이 열면 순서대로 받아갈 수 있다).
export async function GET(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  const checkId = Number(new URL(req.url).searchParams.get('checkId'));
  if (!Number.isInteger(checkId)) return badRequest('요청이 올바르지 않습니다.');
  const { data, error } = await a.svc
    .from('checklist_checks')
    .select('photo_path, checklist_runs(store, work_date, shift_type)')
    .eq('id', checkId)
    .maybeSingle();
  if (error) return dbError(error);
  if (!data?.photo_path) return NextResponse.json({ error: '사진이 없습니다.' }, { status: 404 });
  if (!a.editor) {
    const r = data.checklist_runs as unknown as { store: 'pangyo' | 'yangjae'; work_date: string; shift_type: ShiftType };
    if (!(await isOnCrew(a.svc, r.store, r.work_date, r.shift_type, a.staffId))) return forbid('볼 수 있는 권한이 없습니다.');
  }
  const blob = await get(data.photo_path, { access: 'private' });
  if (!blob) return NextResponse.json({ error: '사진이 없습니다.' }, { status: 404 });
  return new NextResponse(blob.stream, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
}
