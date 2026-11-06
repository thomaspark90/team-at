import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { clockedIn, kstDate, kstMinutes, roundedSegment } from '@/lib/schedule/clock';
import { kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 출퇴근(태블릿) — GET ?token → 오늘 상태(이름·출근 시각) / POST { token, staffId, kind: in|out }
// 퇴근을 누르면 그날 실제 근무(30분 반올림, source=clock)가 기록돼 운영진이 '실제'를 손으로 고칠 일이 준다.
// 세션 없음: 토큰이 지점을 증명, 이름은 본인 확인 없이 고른다(링크 화면 원칙). 지난 날짜·시각 수정은 운영진 화면에서.
const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status });

async function ctx(token: string) {
  const svc = serviceClient();
  if (!svc) return null;
  const { data: link } = await svc.from('schedule_share_links').select('store').eq('token', token).maybeSingle();
  if (!link) return null;
  const store = link.store as string;
  const today = kstToday();
  const [staff, ev] = await Promise.all([
    svc.from('schedule_staff').select('id, name, stores, home_store').eq('active', true).order('name'),
    svc.from('schedule_clock_events').select('staff_id, kind, at').eq('store', store).eq('work_date', today).order('at'),
  ]);
  const people = (staff.data ?? []).filter((s) => ((s.stores as string[] | null)?.length ? (s.stores as string[]) : [s.home_store]).includes(store)).map((s) => ({ id: Number(s.id), name: s.name as string }));
  const events = (ev.data ?? []).map((e) => ({ staffId: Number(e.staff_id), kind: e.kind as 'in' | 'out', at: e.at as string }));
  return { svc, store, today, people, events };
}

const fmt = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });

export async function GET(req: Request) {
  const c = await ctx(new URL(req.url).searchParams.get('token') ?? '');
  if (!c) return bad('링크가 올바르지 않습니다.', 404);
  const on = clockedIn(c.events);
  const done = new Set(c.events.filter((e) => e.kind === 'out').map((e) => e.staffId));
  return NextResponse.json({
    today: c.today,
    people: c.people.map((p) => ({ ...p, in: on.get(p.id) ? fmt(on.get(p.id)!) : null, done: !on.has(p.id) && done.has(p.id) })),
  });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const c = await ctx(String(b?.token ?? ''));
  if (!c) return bad('링크가 올바르지 않습니다.', 404);
  const staffId = Number(b?.staffId);
  if (!c.people.some((p) => p.id === staffId)) return bad('이 지점 근무자가 아닙니다.');
  if (b?.kind !== 'in' && b?.kind !== 'out') return bad('출근 또는 퇴근만 누를 수 있습니다.');
  const on = clockedIn(c.events);
  if (b.kind === 'in' && on.has(staffId)) return bad('이미 출근 상태입니다.', 409);
  if (b.kind === 'out' && !on.has(staffId)) return bad('출근 기록이 없습니다. 출근을 먼저 누르세요.', 409);
  const now = new Date().toISOString();
  const { error } = await c.svc.from('schedule_clock_events').insert({ store: c.store, staff_id: staffId, work_date: c.today, kind: b.kind, at: now });
  if (error) return bad(error.message, 500);
  let segment: { start: number; end: number } | null = null;
  if (b.kind === 'out') {
    const inAt = on.get(staffId)!;
    segment = roundedSegment(kstMinutes(inAt), kstMinutes(now));
    // 그날 실제 근무를 통째로 교체(여러 번 출퇴근하면 처음 출근~마지막 퇴근이 아니라 마지막 구간만 남는다 — 분할근무는 운영진이 고친다)
    const match = { work_date: kstDate(inAt), store: c.store, staff_id: staffId, kind: 'actual' };
    await c.svc.from('schedule_shifts').delete().match(match);
    const { error: iErr } = await c.svc.from('schedule_shifts').insert({ ...match, start_min: segment.start, end_min: segment.end, source: 'clock', updated_by: 'clock' });
    if (iErr) return bad(iErr.message, 500);
  }
  return NextResponse.json({ ok: true, at: fmt(now), segment });
}
