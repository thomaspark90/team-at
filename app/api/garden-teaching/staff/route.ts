import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, forbid } from '@/lib/teaching/access';
import { lastReceivedMap, isFulfilled } from '@/lib/teaching/queries';
import { TEACHING_TOPIC_KEYS } from '@/lib/teaching/topics';
import { NAME_RE, newInternalEmail, normalizeName, pinToPassword, newPin } from '@/lib/account/simple-login';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 15;

// 지점별 근무자 명부 — 운영 권한(대표·매니저) 전용.
//  GET  ?store=pangyo            지점 스탭 상세(배우고 싶은 것·우선순위·메모·로그인 여부)
//  POST { name, stores }         명부 등록 — 로그인 없는 스탭 프로필(roster_only). 교육 대상·기록에 바로 쓸 수 있다.
//  PATCH { userId, name?, stores?, topics?, priorities?, note? }
//                                대표가 대신 적는 '배우고 싶은 것'(설문 결과 옮기기). topics 는 전체 집합(빠지면 삭제),
//                                priorities 는 { topicKey: 1|2|3|null }, note 는 자유 서술.
//  DELETE { userId }             명부 등록 계정만 삭제(직접 가입·발급 계정은 설정에서).

const STORE_IDS = STORES.map((s) => s.id);
const parseStores = (v: unknown): StoreId[] | null => {
  if (!Array.isArray(v)) return null;
  const out = Array.from(new Set(v.map(String).filter((s): s is StoreId => (STORE_IDS as string[]).includes(s))));
  return out.length ? out : null;
};

export async function GET(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const store = new URL(req.url).searchParams.get('store') as StoreId | null;

  let q = a.svc
    .from('profiles')
    .select('user_id, display_name, role, stores, simple_login, roster_only, status, contact_email')
    .eq('status', 'active');
  if (store && STORE_IDS.includes(store)) q = q.contains('stores', [store]);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const staffRows = (rows ?? []).filter((p) => !a.manageKeys.has(p.role as string));
  const ids = staffRows.map((p) => p.user_id as string);

  const [{ data: wishRows }, { data: noteRows }, received] = await Promise.all([
    ids.length
      ? a.svc.from('teaching_wishes').select('user_id, topic_key, requested_at, priority').in('user_id', ids)
      : Promise.resolve({ data: [] as { user_id: string; topic_key: string; requested_at: string; priority: number | null }[] }),
    ids.length
      ? a.svc.from('teaching_notes').select('user_id, note').in('user_id', ids)
      : Promise.resolve({ data: [] as { user_id: string; note: string }[] }),
    lastReceivedMap(a.svc, ids),
  ]);
  const wishesOf = new Map<string, { topicKey: string; priority: number | null; received: boolean }[]>();
  for (const w of wishRows ?? []) {
    const list = wishesOf.get(w.user_id as string) ?? [];
    list.push({
      topicKey: w.topic_key as string,
      priority: (w.priority as number | null) ?? null,
      received: isFulfilled(w.requested_at as string, received.get(`${w.user_id}:${w.topic_key}`)),
    });
    wishesOf.set(w.user_id as string, list);
  }
  const noteOf = new Map((noteRows ?? []).map((n) => [n.user_id as string, n.note as string]));

  const staff = staffRows
    .map((p) => ({
      userId: p.user_id as string,
      name: p.display_name as string,
      stores: p.stores as StoreId[],
      rosterOnly: !!p.roster_only,
      simpleLogin: !!p.simple_login,
      contactEmail: (p.contact_email as string | null) ?? null,
      wishes: (wishesOf.get(p.user_id as string) ?? []).sort((x, y) => (x.priority ?? 9) - (y.priority ?? 9)),
      note: noteOf.get(p.user_id as string) ?? '',
    }))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'));
  return NextResponse.json({ staff });
}

export async function POST(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const name = normalizeName(body?.name);
  const stores = parseStores(body?.stores);
  if (!NAME_RE.test(name)) return NextResponse.json({ error: '이름은 한글·영문·숫자 1~12자입니다.' }, { status: 400 });
  if (!stores) return NextResponse.json({ error: '지점을 하나 이상 선택하세요.' }, { status: 400 });

  const { data: dup } = await a.svc.from('profiles').select('user_id, status').eq('display_name', name).maybeSingle();
  if (dup) {
    return NextResponse.json(
      { error: dup.status === 'pending' ? `'${name}'은 가입 신청 중이에요. 설정 › 승인 대기에서 승인하세요.` : `'${name}' 이름이 이미 있어요. "박연재(판교)"처럼 구분해 주세요.` },
      { status: 409 },
    );
  }

  // 로그인 없는 명부 계정 — auth 계정은 FK(교육 대상·참석·위시) 때문에 만들되, 비밀번호는 아무도 모르는 값
  const email = newInternalEmail();
  let password: string;
  try {
    password = pinToPassword(email, newPin()) + newPin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '서버 설정 누락' }, { status: 500 });
  }
  const { data: created, error: createErr } = await a.svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, roster_only: true },
  });
  if (createErr || !created.user) return NextResponse.json({ error: createErr?.message ?? '계정 생성 실패' }, { status: 500 });
  const userId = created.user.id;
  const { error: profErr } = await a.svc.from('profiles').insert({
    user_id: userId,
    display_name: name,
    role: 'staff',
    stores,
    simple_login: false,
    roster_only: true,
    pin_reset_required: false,
    status: 'active',
    created_by: a.email || 'roster',
  });
  if (profErr) {
    await a.svc.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  // 나중에 로그인을 열었을 때의 기본 권한(가든 섹션 + 교육 탭)
  await a.svc
    .from('garden_tab_access')
    .upsert({ user_id: userId, email, sections: ['garden'], tabs: ['teaching'], updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return NextResponse.json({ ok: true, userId, name, stores });
}

export async function PATCH(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? '');
  if (!userId) return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
  const { data: profile } = await a.svc.from('profiles').select('user_id, display_name, role, status').eq('user_id', userId).maybeSingle();
  if (!profile || profile.status !== 'active' || a.manageKeys.has(profile.role as string)) {
    return NextResponse.json({ error: '지점 스탭 계정이 아닙니다.' }, { status: 404 });
  }
  const now = new Date().toISOString();

  // 프로필(이름·지점)
  const patch: Record<string, unknown> = {};
  if (body?.name !== undefined) {
    const name = normalizeName(body.name);
    if (!NAME_RE.test(name)) return NextResponse.json({ error: '이름은 한글·영문·숫자 1~12자입니다.' }, { status: 400 });
    patch.display_name = name;
  }
  if (body?.stores !== undefined) {
    const stores = parseStores(body.stores);
    if (!stores) return NextResponse.json({ error: '지점을 하나 이상 선택하세요.' }, { status: 400 });
    patch.stores = stores;
  }
  if (Object.keys(patch).length) {
    const { error } = await a.svc.from('profiles').update({ ...patch, updated_at: now }).eq('user_id', userId);
    if (error) return NextResponse.json({ error: /unique|duplicate/i.test(error.message) ? '같은 이름이 이미 있어요.' : error.message }, { status: 409 });
  }

  // 배우고 싶은 것(전체 집합 교체) — 있던 항목은 requested_at 유지, 새 항목은 지금
  const valid = new Set(TEACHING_TOPIC_KEYS);
  if (Array.isArray(body?.topics)) {
    const topics: string[] = Array.from(new Set(body.topics.map(String).filter((k: string) => valid.has(k))));
    const { data: existing } = await a.svc.from('teaching_wishes').select('topic_key').eq('user_id', userId);
    const have = new Set((existing ?? []).map((w) => w.topic_key as string));
    const toDelete = Array.from(have).filter((k) => !topics.includes(k));
    const toInsert = topics.filter((k) => !have.has(k));
    if (toDelete.length) await a.svc.from('teaching_wishes').delete().eq('user_id', userId).in('topic_key', toDelete);
    if (toInsert.length) {
      const { error } = await a.svc.from('teaching_wishes').insert(toInsert.map((k) => ({ user_id: userId, topic_key: k, requested_at: now })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  // 우선순위 — { topicKey: 1|2|3|null }. 같은 순위가 둘이면 나중 것이 덮는다(화면에서 막음).
  if (body?.priorities && typeof body.priorities === 'object') {
    for (const [key, v] of Object.entries(body.priorities as Record<string, unknown>)) {
      if (!valid.has(key)) continue;
      const p = v === null || v === '' ? null : Number(v);
      if (p !== null && !(p >= 1 && p <= 3)) continue;
      await a.svc.from('teaching_wishes').update({ priority: p }).eq('user_id', userId).eq('topic_key', key);
    }
  }
  if (body?.note !== undefined) {
    const note = String(body.note ?? '').slice(0, 500);
    const { error } = await a.svc.from('teaching_notes').upsert({ user_id: userId, note, updated_at: now }, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  if (!canManage(a)) return forbid();
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? '');
  if (!userId) return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
  const { data: profile } = await a.svc.from('profiles').select('user_id, roster_only, simple_login').eq('user_id', userId).maybeSingle();
  if (!profile) return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
  if (!profile.roster_only) {
    return NextResponse.json({ error: '직접 가입·발급한 계정은 설정 › 간편 계정에서 삭제하세요.' }, { status: 400 });
  }
  const { error } = await a.svc.auth.admin.deleteUser(userId); // 프로필·위시·교육 대상·참석 기록 cascade
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await a.svc.from('garden_tab_access').delete().eq('user_id', userId);
  return NextResponse.json({ ok: true });
}
