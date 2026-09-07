import { NextResponse } from 'next/server';
import { requireActor, isActor } from '@/lib/teaching/access';
import { NAME_RE, normalizeName } from '@/lib/account/simple-login';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';

// 내 프로필 — 구글 로그인 팀 계정이 교육 탭을 처음 쓸 때 이름·지점을 스스로 등록한다(역할은 staff 고정).
// 간편 계정은 대표가 발급 시 정하므로 지점만 고칠 수 있고 이름은 못 바꾼다(로그인 ID 이기 때문).
export async function POST(req: Request) {
  const a = await requireActor();
  if (!isActor(a)) return a;
  const body = await req.json().catch(() => ({}));
  const stores = Array.isArray(body?.stores)
    ? (body.stores.map(String).filter((s: string) => STORES.some((x) => x.id === s)) as StoreId[])
    : [];
  if (stores.length === 0) return NextResponse.json({ error: '지점을 하나 이상 선택하세요.' }, { status: 400 });

  if (a.profile) {
    const patch: Record<string, unknown> = { stores: Array.from(new Set(stores)), updated_at: new Date().toISOString() };
    if (!a.profile.simple_login && body?.name !== undefined) {
      const name = normalizeName(body.name);
      if (!NAME_RE.test(name)) return NextResponse.json({ error: '이름은 한글·영문·숫자 1~12자입니다.' }, { status: 400 });
      patch.display_name = name;
    }
    const { error } = await a.svc.from('profiles').update(patch).eq('user_id', a.userId);
    if (error) return NextResponse.json({ error: /unique|duplicate/i.test(error.message) ? '같은 이름이 이미 있습니다.' : error.message }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  const name = normalizeName(body?.name);
  if (!NAME_RE.test(name)) return NextResponse.json({ error: '이름은 한글·영문·숫자 1~12자입니다.' }, { status: 400 });
  const { error } = await a.svc.from('profiles').insert({
    user_id: a.userId,
    display_name: name,
    role: 'staff',
    stores: Array.from(new Set(stores)),
    simple_login: false,
    created_by: a.email,
  });
  if (error) return NextResponse.json({ error: /unique|duplicate/i.test(error.message) ? '같은 이름이 이미 있습니다.' : error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
