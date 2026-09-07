import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, forbid } from '@/lib/teaching/access';
import { isYmd } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';

// 매니저 출근 일정 — POST { date, store, managerId? } / DELETE { id }
// 매니저는 자기 일정만, 대표(admin)는 managerId 를 지정해 누구 일정이든 넣고 뺀다.
// 하루 한 지점(unique manager_id+date) — 같은 날 다시 넣으면 지점만 바뀐다.
export async function POST(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const date = body?.date;
  const store = String(body?.store ?? '') as StoreId;
  if (!isYmd(date)) return NextResponse.json({ error: '날짜가 올바르지 않습니다.' }, { status: 400 });
  if (!STORES.some((s) => s.id === store)) return NextResponse.json({ error: '지점을 선택하세요.' }, { status: 400 });

  let managerId = a.userId;
  if (a.role === 'admin' && body?.managerId) {
    managerId = String(body.managerId);
    const { data: p } = await a.svc.from('profiles').select('role').eq('user_id', managerId).maybeSingle();
    if (p?.role !== 'manager') return NextResponse.json({ error: '매니저 계정이 아닙니다.' }, { status: 400 });
  } else if (a.role !== 'manager') {
    return NextResponse.json({ error: '일정을 넣을 매니저를 선택하세요.' }, { status: 400 });
  }

  const { data, error } = await a.svc
    .from('teaching_shifts')
    .upsert({ manager_id: managerId, date, store, created_by: a.userId }, { onConflict: 'manager_id,date' })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });
  let q = a.svc.from('teaching_shifts').delete().eq('id', id);
  if (a.role !== 'admin') q = q.eq('manager_id', a.userId);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
