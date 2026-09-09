import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, forbid } from '@/lib/teaching/access';
import { isFulfilled, lastReceivedMap, nameResolver, profileMap } from '@/lib/teaching/queries';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';

// 매니저·대표용 지점 집계 — ?store=pangyo
//  · topics: 주제별로 아직 못 받은(열린) 요청자 실명 목록
//  · notes: 스탭 자유 서술
//  · sessions: 이 지점의 최근 교육 기록(참석자 실명)
export async function GET(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const store = new URL(req.url).searchParams.get('store') as StoreId | null;
  if (!store || !STORES.some((s) => s.id === store)) return NextResponse.json({ error: '지점을 선택하세요.' }, { status: 400 });

  const profiles = await profileMap(a.svc);
  const staff = Array.from(profiles.values()).filter((p) => !a.manageKeys.has(p.role) && p.stores.includes(store));
  const staffIds = staff.map((p) => p.user_id);
  const nameOf = (id: string) => profiles.get(id)?.display_name ?? '이름 없음';
  const anyNameOf = nameResolver(a.svc, profiles); // 매니저 자리에 대표(프로필 없음)가 올 수 있다

  const [{ data: wishRows }, { data: noteRows }, received, { data: sessionRows }] = await Promise.all([
    staffIds.length
      ? a.svc.from('teaching_wishes').select('user_id, topic_key, requested_at, priority').in('user_id', staffIds)
      : Promise.resolve({ data: [] as { user_id: string; topic_key: string; requested_at: string; priority: number | null }[] }),
    staffIds.length
      ? a.svc.from('teaching_notes').select('user_id, note, updated_at').in('user_id', staffIds).neq('note', '')
      : Promise.resolve({ data: [] as { user_id: string; note: string; updated_at: string }[] }),
    lastReceivedMap(a.svc, staffIds),
    a.svc
      .from('teaching_sessions')
      .select('id, topic_key, date, store, manager_id, memo, created_at')
      .eq('store', store)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(30),
  ]);

  const byTopic = new Map<string, { userId: string; name: string; requestedAt: string; priority: number | null }[]>();
  for (const w of wishRows ?? []) {
    if (isFulfilled(w.requested_at as string, received.get(`${w.user_id}:${w.topic_key}`))) continue;
    const list = byTopic.get(w.topic_key as string) ?? [];
    list.push({ userId: w.user_id as string, name: nameOf(w.user_id as string), requestedAt: w.requested_at as string, priority: (w.priority as number | null) ?? null });
    byTopic.set(w.topic_key as string, list);
  }
  // 우선순위(1·2·3)가 붙은 사람이 먼저, 그다음 요청순
  const topics = Array.from(byTopic.entries()).map(([topicKey, wanters]) => ({
    topicKey,
    wanters: wanters.sort((x, y) => (x.priority ?? 9) - (y.priority ?? 9) || x.requestedAt.localeCompare(y.requestedAt)),
  }));

  const sessionIds = (sessionRows ?? []).map((s) => s.id as number);
  const { data: attRows } = sessionIds.length
    ? await a.svc.from('teaching_session_attendees').select('session_id, user_id').in('session_id', sessionIds)
    : { data: [] as { session_id: number; user_id: string }[] };
  const attendeesOf = new Map<number, { userId: string; name: string }[]>();
  for (const r of attRows ?? []) {
    const list = attendeesOf.get(r.session_id as number) ?? [];
    list.push({ userId: r.user_id as string, name: nameOf(r.user_id as string) });
    attendeesOf.set(r.session_id as number, list);
  }

  return NextResponse.json({
    store,
    staff: staff.map((p) => ({ userId: p.user_id, name: p.display_name })),
    topics,
    notes: (noteRows ?? []).map((n) => ({ userId: n.user_id as string, name: nameOf(n.user_id as string), note: n.note as string, updatedAt: n.updated_at as string })),
    sessions: await Promise.all(
      (sessionRows ?? []).map(async (s) => ({
        id: s.id as number,
        topicKey: s.topic_key as string,
        date: s.date as string,
        store: s.store as StoreId,
        managerId: s.manager_id as string,
        managerName: await anyNameOf(s.manager_id as string),
        memo: s.memo as string,
        attendees: attendeesOf.get(s.id as number) ?? [],
      })),
    ),
  });
}
