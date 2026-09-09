import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, forbid } from '@/lib/teaching/access';
import { TEACHING_TOPIC_KEYS } from '@/lib/teaching/topics';

export const runtime = 'nodejs';

// 교육 코멘트 — 시간 칸·참여 인원별. 그 일정의 티칭 스태프 본인 또는 대표만 쓴다.
//  PUT    { shiftId, hour, userId, level?(1~3|null), topics?: string[], comment }
//         topics 는 이 시간에 다룬 주제 — 저장 시 teaching_sessions(+attendee) 를 만들어 '받음'과 연결. 고치면 이전 세션은 지우고 다시 만든다.
//  DELETE { shiftId, hour, userId }  코멘트와 연결 세션 삭제.

async function loadShift(svc: import('@supabase/supabase-js').SupabaseClient, shiftId: number) {
  const { data } = await svc.from('teaching_shifts').select('id, manager_id, date, store').eq('id', shiftId).maybeSingle();
  return data as { id: number; manager_id: string; date: string; store: string } | null;
}

export async function PUT(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const shiftId = Number(body?.shiftId);
  const hour = Number(body?.hour);
  const userId = String(body?.userId ?? '');
  if (!Number.isFinite(shiftId) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !userId) {
    return NextResponse.json({ error: 'shiftId·hour·userId 가 필요합니다.' }, { status: 400 });
  }
  const shift = await loadShift(a.svc, shiftId);
  if (!shift) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 });
  if (a.role !== 'admin' && shift.manager_id !== a.userId) return forbid('자기 일정에만 코멘트를 남길 수 있어요.');

  // 참여 인원(칸 지정 ∪ 일정 지정)만 대상
  const [{ data: slotTr }, { data: shiftTr }] = await Promise.all([
    a.svc.from('teaching_shift_slot_trainees').select('user_id').eq('shift_id', shiftId).eq('hour', hour).eq('user_id', userId),
    a.svc.from('teaching_shift_trainees').select('user_id').eq('shift_id', shiftId).eq('user_id', userId),
  ]);
  if (!(slotTr ?? []).length && !(shiftTr ?? []).length) {
    return NextResponse.json({ error: '이 시간의 참여 인원이 아닙니다. 먼저 인원 칩을 켜주세요.' }, { status: 400 });
  }

  const levelRaw = body?.level;
  const level = levelRaw === null || levelRaw === undefined || levelRaw === '' ? null : Number(levelRaw);
  if (level !== null && !(level >= 1 && level <= 3)) return NextResponse.json({ error: '진행 단계가 올바르지 않습니다.' }, { status: 400 });
  const valid = new Set(TEACHING_TOPIC_KEYS);
  const topics: string[] = Array.isArray(body?.topics) ? Array.from(new Set(body.topics.map(String).filter((k: string) => valid.has(k)))) : [];
  const comment = String(body?.comment ?? '').trim().slice(0, 1000);
  if (!comment && !level && topics.length === 0) return NextResponse.json({ error: '코멘트·진행 단계·다룬 주제 중 하나는 적어주세요.' }, { status: 400 });

  // 기존 코멘트의 연결 세션 제거
  const { data: prev } = await a.svc
    .from('teaching_slot_comments')
    .select('id, session_ids')
    .eq('shift_id', shiftId)
    .eq('hour', hour)
    .eq('user_id', userId)
    .maybeSingle();
  const oldIds = ((prev?.session_ids as number[] | null) ?? []).filter(Boolean);
  if (oldIds.length) await a.svc.from('teaching_sessions').delete().in('id', oldIds);

  // 다룬 주제 → 세션(받음 처리). memo 에 코멘트 앞부분을 남겨 집계 화면 '최근 교육 기록'에서도 보이게.
  const sessionIds: number[] = [];
  for (const topicKey of topics) {
    const { data: created, error } = await a.svc
      .from('teaching_sessions')
      .insert({ topic_key: topicKey, date: shift.date, store: shift.store, manager_id: a.userId, memo: comment.slice(0, 300) })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await a.svc.from('teaching_session_attendees').insert({ session_id: created.id, user_id: userId });
    sessionIds.push(created.id as number);
  }

  const now = new Date().toISOString();
  const { error } = await a.svc.from('teaching_slot_comments').upsert(
    { shift_id: shiftId, hour, user_id: userId, author_id: a.userId, level, topics, comment, session_ids: sessionIds, updated_at: now },
    { onConflict: 'shift_id,hour,user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sessions: sessionIds.length });
}

export async function DELETE(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const shiftId = Number(body?.shiftId);
  const hour = Number(body?.hour);
  const userId = String(body?.userId ?? '');
  if (!Number.isFinite(shiftId) || !Number.isInteger(hour) || !userId) return NextResponse.json({ error: 'shiftId·hour·userId 가 필요합니다.' }, { status: 400 });
  const shift = await loadShift(a.svc, shiftId);
  if (!shift) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 });
  if (a.role !== 'admin' && shift.manager_id !== a.userId) return forbid('자기 일정의 코멘트만 지울 수 있어요.');
  const { data: prev } = await a.svc
    .from('teaching_slot_comments')
    .select('id, session_ids')
    .eq('shift_id', shiftId)
    .eq('hour', hour)
    .eq('user_id', userId)
    .maybeSingle();
  if (!prev) return NextResponse.json({ ok: true });
  const oldIds = ((prev.session_ids as number[] | null) ?? []).filter(Boolean);
  if (oldIds.length) await a.svc.from('teaching_sessions').delete().in('id', oldIds);
  const { error } = await a.svc.from('teaching_slot_comments').delete().eq('id', prev.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
