import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { segmentError } from '@/lib/schedule/time';
import { PRESET_LABEL_MAX, PRESET_MAX, type ShiftPreset } from '@/lib/schedule/types';

export const runtime = 'nodejs';

// PUT { store, presets: [{ label, start, end }] } — 지점의 근무 파트 목록을 통째로 교체(순서 = 배열 순서). 운영진 전용.
// 파트끼리는 겹쳐도 된다(오픈 7–16 과 오전 파트 7–14 처럼) — 구간 검사는 하나씩만 한다.
export async function PUT(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  if (!isStore(b?.store)) return badRequest('지점을 선택하세요.');
  if (!Array.isArray(b?.presets)) return badRequest('파트 목록이 올바르지 않습니다.');
  if (b.presets.length > PRESET_MAX) return badRequest(`파트는 ${PRESET_MAX}개까지입니다.`);
  const presets: ShiftPreset[] = [];
  for (const p of b.presets) {
    const label = String(p?.label ?? '').replace(/\s+/g, ' ').trim();
    if (!label || label.length > PRESET_LABEL_MAX) return badRequest(`파트 이름은 1~${PRESET_LABEL_MAX}자입니다.`);
    const seg = { start: Number(p?.start), end: Number(p?.end) };
    const invalid = segmentError([seg]);
    if (invalid) return badRequest(`${label}: ${invalid}`);
    presets.push({ label, ...seg });
  }
  const { error: dErr } = await a.svc.from('schedule_shift_presets').delete().eq('store', b.store);
  if (dErr) return dbError(dErr);
  if (presets.length) {
    const { error } = await a.svc
      .from('schedule_shift_presets')
      .insert(presets.map((p, i) => ({ store: b.store, position: i + 1, label: p.label, start_min: p.start, end_min: p.end })));
    if (error) return dbError(error);
  }
  return NextResponse.json({ ok: true, count: presets.length });
}
