import { NextResponse } from 'next/server';
import { badRequest, dbError, forbid, requireChecklistActor } from '@/lib/checklist/access';
import { canTakeOver, overrideFromMembers } from '@/lib/checklist/assignment';
import { loadCrews, saveOverride } from '@/lib/checklist/crew';
import { isClosedDay, isEnabledStore } from '@/lib/checklist/logic';
import { loadCrewPlan } from '@/lib/checklist/queries';
import { isStore } from '@/lib/schedule/access';
import { isYmd, kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 조 구성 — 근무표는 바꾸지 않고 이 체크리스트의 조·책임자만 덧씌운다.
// GET ?store&date — 조 편성 화면(운영진).
// POST { store, date, shiftType, action }
//   set: { members, leadId } — 운영진. 오늘 이후, 미제출만.
//   handoff: { toStaffId } — 책임자 또는 운영진. 오늘, 미제출만.
//   takeover: {} — 지점 직원. 오늘, 미제출만. 맡은 사람이 책임자가 된다(자리를 비운 사람에게 제출이 묶이지 않게).

export async function GET(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  if (!a.editor) return forbid();
  const u = new URL(req.url).searchParams;
  const store = u.get('store');
  const date = u.get('date');
  if (!isStore(store) || !isYmd(date)) return badRequest('요청이 올바르지 않습니다.');
  try {
    return NextResponse.json(await loadCrewPlan(a.svc, store, date));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const idList = (v: unknown): number[] | null => (Array.isArray(v) && v.every(Number.isInteger) ? Array.from(new Set(v as number[])) : null);

export async function POST(req: Request) {
  const a = await requireChecklistActor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => null);
  if (!b || !isStore(b.store) || !isYmd(b.date) || (b.shiftType !== 'open' && b.shiftType !== 'close')) return badRequest('요청이 올바르지 않습니다.');
  const { store, date, shiftType } = b;
  const today = kstToday();
  if (!isEnabledStore(store) || isClosedDay(store, date)) return badRequest('이 날짜·지점은 체크리스트가 없습니다.');

  const { data: run, error: runErr } = await a.svc.from('checklist_runs').select('submitted_at').eq('store', store).eq('work_date', date).eq('shift_type', shiftType).maybeSingle();
  if (runErr) return dbError(runErr);
  if (run?.submitted_at) return NextResponse.json({ error: '이미 제출된 체크리스트입니다. 다시 연 뒤에 바꿔 주세요.' }, { status: 409 });

  try {
    const crews = await loadCrews(a.svc, date);
    const crew = crews.of(store, shiftType);

    if (b.action === 'set') {
      if (!a.editor) return forbid();
      if (date < today) return badRequest('지난 날짜는 바꿀 수 없습니다.');
      const members = idList(b.members);
      if (!members || !members.every((id) => crews.people.has(id))) return badRequest('근무자가 올바르지 않습니다.');
      const leadId = b.leadId == null ? null : Number(b.leadId);
      // 조에서 뺀 사람의 대신 맡기 기록은 지운다 — 남겨 두면 다시 조에 들어온다
      const dropped = crew.takeovers.map((t) => t.staffId).filter((id) => !members.includes(id));
      if (dropped.length) {
        const { error } = await a.svc.from('checklist_takeovers').delete().eq('store', store).eq('work_date', date).eq('shift_type', shiftType).in('staff_id', dropped);
        if (error) return dbError(error);
      }
      const kept = crew.takeovers.map((t) => t.staffId).filter((id) => members.includes(id));
      await saveOverride(a.svc, store, date, shiftType, overrideFromMembers(crew.autoIds, kept, members, leadId), a.name);
      return NextResponse.json({ ok: true });
    }

    if (date !== today) return badRequest('오늘 체크리스트만 바꿀 수 있습니다.');

    if (b.action === 'handoff') {
      if (!a.editor && crew.leadId !== a.staffId) return forbid('책임자만 넘길 수 있습니다.');
      const to = Number(b.toStaffId);
      if (!crew.memberIds.includes(to)) return badRequest('같은 조 근무자에게만 넘길 수 있습니다.');
      if (!crews.people.get(to)?.linked) return badRequest('로그인 계정이 없는 근무자에게는 넘길 수 없습니다.');
      await saveOverride(a.svc, store, date, shiftType, { ...crew.override, leadStaffId: to }, a.name);
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'takeover') {
      if (a.staffId == null) return forbid('근무자 명부에 계정이 연결되어 있지 않습니다.');
      const onCrew = crew.memberIds.includes(a.staffId); // 이미 조원이면 소속 지점과 무관하게 책임을 받을 수 있다
      if (!onCrew && !canTakeOver(a, store)) return forbid('이 지점 직원만 대신 맡을 수 있습니다.');
      if (!onCrew) {
        const { error } = await a.svc
          .from('checklist_takeovers')
          .upsert({ store, work_date: date, shift_type: shiftType, staff_id: a.staffId, staff_name: a.name, taken_by: a.userId }, { onConflict: 'store,work_date,shift_type,staff_id', ignoreDuplicates: true });
        if (error) return dbError(error);
      }
      const removed = crew.override.removed.filter((id) => id !== a.staffId);
      await saveOverride(a.svc, store, date, shiftType, { ...crew.override, removed, leadStaffId: a.staffId }, a.name);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return badRequest('요청이 올바르지 않습니다.');
}
