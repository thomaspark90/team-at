import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { resolveRole, isOwner } from '@/lib/finance/access';
import { NAME_RE, newInternalEmail, newPin, normalizeName, pinToPassword } from '@/lib/account/simple-login';
import { STORES, type StoreId } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 15;

// 간편 계정 관리 — admin(대표) 전용. /settings 의 '간편 계정' 섹션이 사용.
// GET: 프로필 전체(간편 계정 + 프로필만 있는 구글 계정)
// POST { name, role, stores }: 계정 발급 — 내부 이메일 auth 계정 + 프로필 + 기본 권한(가든 섹션·교육 탭).
//   응답의 pin 은 이때 한 번만 보여준다(저장하지 않음). 첫 로그인 때 본인이 바꿔야 한다.
// PATCH { userId, name?, role?, stores?, resetPin? }: 프로필 수정 / 비밀번호 초기화(새 pin 응답, 잠금 해제).
// DELETE { userId }: 간편 계정 삭제(auth 계정·프로필·요청·기록 cascade + 권한 행). 구글 계정 프로필은 프로필만 삭제.

const STORE_IDS = STORES.map((s) => s.id);

async function requireAdmin() {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  if ((await resolveRole(session, user)) !== 'admin') {
    return { error: NextResponse.json({ error: '관리자만 할 수 있습니다.' }, { status: 403 }) };
  }
  const svc = serviceClient();
  if (!svc) return { error: NextResponse.json({ error: '서버 설정 누락' }, { status: 500 }) };
  return { user, svc };
}

const parseStores = (v: unknown): StoreId[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.map(String).filter((s): s is StoreId => (STORE_IDS as string[]).includes(s));
  return out.length ? Array.from(new Set(out)) : null;
};
const parseRole = (v: unknown): 'staff' | 'manager' | null => (v === 'staff' || v === 'manager' ? v : null);

export async function GET() {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const { data, error } = await g.svc
    .from('profiles')
    .select('user_id, display_name, role, stores, simple_login, pin_reset_required, locked_until, created_at')
    .order('role', { ascending: false })
    .order('display_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const name = normalizeName(body?.name);
  const role = parseRole(body?.role);
  const stores = parseStores(body?.stores);
  if (!NAME_RE.test(name)) return NextResponse.json({ error: '이름은 한글·영문·숫자 1~12자입니다.' }, { status: 400 });
  if (!role || !stores) return NextResponse.json({ error: '역할과 지점을 선택하세요.' }, { status: 400 });

  const { data: dup } = await g.svc.from('profiles').select('user_id').eq('display_name', name).maybeSingle();
  if (dup) return NextResponse.json({ error: `'${name}' 이름이 이미 있습니다. "박연재(판교)"처럼 구분해 주세요.` }, { status: 409 });

  const email = newInternalEmail();
  const pin = newPin();
  let password: string;
  try {
    password = pinToPassword(email, pin);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '서버 설정 누락' }, { status: 500 });
  }
  const { data: created, error: createErr } = await g.svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, simple_login: true },
  });
  if (createErr || !created.user) return NextResponse.json({ error: createErr?.message ?? '계정 생성 실패' }, { status: 500 });
  const userId = created.user.id;

  const { error: profErr } = await g.svc.from('profiles').insert({
    user_id: userId,
    display_name: name,
    role,
    stores,
    simple_login: true,
    pin_reset_required: true,
    created_by: g.user.email ?? '',
  });
  if (profErr) {
    await g.svc.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  // 기본 권한: 가든 섹션 + 교육 탭만. 이후 '페이지 접근 권한'에서 넓힐 수 있다.
  await g.svc
    .from('garden_tab_access')
    .upsert({ user_id: userId, email, sections: ['garden'], tabs: ['teaching'], updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  return NextResponse.json({ ok: true, userId, name, role, stores, pin });
}

export async function PATCH(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? '');
  if (!userId) return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
  const { data: profile } = await g.svc
    .from('profiles')
    .select('user_id, display_name, simple_login')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body?.name !== undefined) {
    const name = normalizeName(body.name);
    if (!NAME_RE.test(name)) return NextResponse.json({ error: '이름은 한글·영문·숫자 1~12자입니다.' }, { status: 400 });
    if (name !== profile.display_name) {
      const { data: dup } = await g.svc.from('profiles').select('user_id').eq('display_name', name).maybeSingle();
      if (dup) return NextResponse.json({ error: `'${name}' 이름이 이미 있습니다.` }, { status: 409 });
    }
    patch.display_name = name;
  }
  if (body?.role !== undefined) {
    const role = parseRole(body.role);
    if (!role) return NextResponse.json({ error: '역할이 올바르지 않습니다.' }, { status: 400 });
    patch.role = role;
  }
  if (body?.stores !== undefined) {
    const stores = parseStores(body.stores);
    if (!stores) return NextResponse.json({ error: '지점을 하나 이상 선택하세요.' }, { status: 400 });
    patch.stores = stores;
  }

  let pin: string | undefined;
  if (body?.resetPin === true) {
    if (!profile.simple_login) return NextResponse.json({ error: '간편 계정만 초기화할 수 있습니다.' }, { status: 400 });
    const { data: authUser } = await g.svc.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
    pin = newPin();
    const { error } = await g.svc.auth.admin.updateUserById(userId, { password: pinToPassword(email, pin) });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    patch.pin_reset_required = true;
    patch.failed_attempts = 0;
    patch.locked_until = null;
  }

  const { error } = await g.svc.from('profiles').update(patch).eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pin });
}

export async function DELETE(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? '');
  if (!userId) return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
  if (userId === g.user.id) return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
  const { data: profile } = await g.svc.from('profiles').select('user_id, simple_login').eq('user_id', userId).maybeSingle();
  if (!profile) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });

  if (profile.simple_login) {
    const { data: authUser } = await g.svc.auth.admin.getUserById(userId);
    if (isOwner(authUser?.user?.email)) return NextResponse.json({ error: '대표 계정은 삭제할 수 없습니다.' }, { status: 400 });
    // auth 삭제로 프로필·위시·일정·기록이 cascade 된다
    const { error } = await g.svc.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await g.svc.from('garden_tab_access').delete().eq('user_id', userId);
    return NextResponse.json({ ok: true });
  }
  // 구글 계정은 프로필만 지운다 — 계정 자체는 '페이지 접근 권한'에서 다룬다
  const { error } = await g.svc.from('profiles').delete().eq('user_id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
