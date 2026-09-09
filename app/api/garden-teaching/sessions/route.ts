import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, forbid } from '@/lib/teaching/access';
import { TEACHING_TOPIC_KEYS } from '@/lib/teaching/topics';
import { isYmd } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';

// "교육함" 기록 — POST { topicKey, date, store, attendeeIds: string[], memo? } / DELETE { id }
// 참석 스탭의 해당 주제 위시가 '받음'으로 바뀐다(requested_at 이전 기록은 무시 — lib/teaching/queries.ts).
export async function POST(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const topicKey = String(body?.topicKey ?? '');
  const date = body?.date;
  const store = String(body?.store ?? '') as StoreId;
  const attendeeIds: string[] = Array.isArray(body?.attendeeIds) ? Array.from(new Set(body.attendeeIds.map(String))) : [];
  const memo = String(body?.memo ?? '').slice(0, 300);
  if (!TEACHING_TOPIC_KEYS.includes(topicKey)) return NextResponse.json({ error: '주제가 올바르지 않습니다.' }, { status: 400 });
  if (!isYmd(date)) return NextResponse.json({ error: '날짜가 올바르지 않습니다.' }, { status: 400 });
  if (!STORES.some((s) => s.id === store)) return NextResponse.json({ error: '지점을 선택하세요.' }, { status: 400 });
  if (attendeeIds.length === 0) return NextResponse.json({ error: '참석한 스탭을 한 명 이상 고르세요.' }, { status: 400 });

  // 참석자는 스탭급(교육 운영 권한 없는 역할) 프로필만
  const { data: staff } = await a.svc.from('profiles').select('user_id, role').in('user_id', attendeeIds).eq('status', 'active');
  const validIds = (staff ?? []).filter((p) => !a.manageKeys.has(p.role as string)).map((p) => p.user_id as string);
  if (validIds.length === 0) return NextResponse.json({ error: '참석자가 스탭 계정이 아닙니다.' }, { status: 400 });

  // 대표가 기록하면 매니저 자리에 대표 계정이 들어간다(이름은 '대표'로 표시)
  const { data: created, error } = await a.svc
    .from('teaching_sessions')
    .insert({ topic_key: topicKey, date, store, manager_id: a.userId, memo })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: attErr } = await a.svc
    .from('teaching_session_attendees')
    .insert(validIds.map((user_id) => ({ session_id: created.id, user_id })));
  if (attErr) {
    await a.svc.from('teaching_sessions').delete().eq('id', created.id);
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: created.id, attendees: validIds.length });
}

export async function DELETE(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });
  let q = a.svc.from('teaching_sessions').delete().eq('id', id);
  if (a.role !== 'admin') q = q.eq('manager_id', a.userId);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
