import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { isYmd } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// PUT { store, date, note } — 날짜 메모(운영진 전용). 빈 값이면 삭제. 앱에서 고치면 시트 재이관이 덮어쓰지 않는다.
export async function PUT(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  if (!isYmd(b?.date)) return badRequest('날짜가 올바르지 않습니다.');
  const note = String(b?.note ?? '').trim();
  const q = a.svc.from('schedule_day_notes');
  const { error } = note
    ? await q.upsert({ store: b.store, work_date: b.date, note, source: 'app', updated_at: new Date().toISOString() }, { onConflict: 'store,work_date' })
    : await q.delete().match({ store: b.store, work_date: b.date });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
