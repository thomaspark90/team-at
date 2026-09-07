import { NextResponse } from 'next/server';
import { requireActor, isActor } from '@/lib/teaching/access';
import { TEACHING_TOPIC_KEYS } from '@/lib/teaching/topics';

export const runtime = 'nodejs';

// 내 위시리스트 저장 — { topics: string[], note?: string, rerequest?: string[] }
//  · topics: 원하는 주제 전체 집합(빠진 건 삭제, 새로 든 건 requested_at=now, 있던 건 유지)
//  · rerequest: 이미 받은 주제를 다시 요청 — requested_at 을 지금으로 갱신해 매니저 집계에 다시 뜬다
export async function PUT(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!a.profile) return NextResponse.json({ error: '먼저 이름과 지점을 등록하세요.' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const valid = new Set(TEACHING_TOPIC_KEYS);
  const topics: string[] = Array.isArray(body?.topics)
    ? Array.from(new Set(body.topics.map(String).filter((k: string) => valid.has(k))))
    : [];
  const rerequest: string[] = Array.isArray(body?.rerequest)
    ? body.rerequest.map(String).filter((k: string) => valid.has(k))
    : [];
  const now = new Date().toISOString();

  const { data: existing } = await a.svc.from('teaching_wishes').select('topic_key').eq('user_id', a.userId);
  const have = new Set((existing ?? []).map((w) => w.topic_key as string));
  const toDelete = Array.from(have).filter((k) => !topics.includes(k));
  const toInsert = topics.filter((k) => !have.has(k));

  if (toDelete.length) {
    const { error } = await a.svc.from('teaching_wishes').delete().eq('user_id', a.userId).in('topic_key', toDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (toInsert.length) {
    const { error } = await a.svc
      .from('teaching_wishes')
      .insert(toInsert.map((k) => ({ user_id: a.userId, topic_key: k, requested_at: now })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const bump = rerequest.filter((k) => topics.includes(k) && have.has(k));
  if (bump.length) {
    const { error } = await a.svc.from('teaching_wishes').update({ requested_at: now }).eq('user_id', a.userId).in('topic_key', bump);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body?.note !== undefined) {
    const note = String(body.note ?? '').slice(0, 500);
    const { error } = await a.svc
      .from('teaching_notes')
      .upsert({ user_id: a.userId, note, updated_at: now }, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
