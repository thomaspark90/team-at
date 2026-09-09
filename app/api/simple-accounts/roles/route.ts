import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { resolveRole } from '@/lib/finance/access';
import { ROLE_LABEL_RE, loadRoles } from '@/lib/account/roles';

export const runtime = 'nodejs';

// 역할 관리 — admin(대표) 전용. /settings › 간편 계정 › 역할.
// GET: 역할 목록 · POST { label, canManage } · PATCH { key, label?, canManage? } · DELETE { key }
// builtin(스탭·매니저)은 이름·권한만 고칠 수 있고 삭제는 안 된다. 사용 중인 역할도 삭제 불가.

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

const cleanLabel = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export async function GET() {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  return NextResponse.json({ roles: await loadRoles(g.svc) });
}

export async function POST(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const label = cleanLabel(body?.label);
  if (!ROLE_LABEL_RE.test(label)) return NextResponse.json({ error: '역할 이름은 한글·영문·숫자 1~10자입니다.' }, { status: 400 });
  const canManage = body?.canManage === true;
  const key = `r-${randomBytes(4).toString('hex')}`;
  const { data: maxRow } = await g.svc.from('profile_roles').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const { error } = await g.svc
    .from('profile_roles')
    .insert({ key, label, can_manage: canManage, builtin: false, sort: ((maxRow?.sort as number | undefined) ?? 100) + 10 });
  if (error) {
    return NextResponse.json({ error: /unique|duplicate/i.test(error.message) ? '같은 이름의 역할이 이미 있어요.' : error.message }, { status: 409 });
  }
  return NextResponse.json({ ok: true, key, roles: await loadRoles(g.svc) });
}

export async function PATCH(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key ?? '');
  if (!key) return NextResponse.json({ error: 'key 가 필요합니다.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body?.label !== undefined) {
    const label = cleanLabel(body.label);
    if (!ROLE_LABEL_RE.test(label)) return NextResponse.json({ error: '역할 이름은 한글·영문·숫자 1~10자입니다.' }, { status: 400 });
    patch.label = label;
  }
  if (body?.canManage !== undefined) patch.can_manage = body.canManage === true;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '바꿀 내용이 없습니다.' }, { status: 400 });
  const { error } = await g.svc.from('profile_roles').update(patch).eq('key', key);
  if (error) {
    return NextResponse.json({ error: /unique|duplicate/i.test(error.message) ? '같은 이름의 역할이 이미 있어요.' : error.message }, { status: 409 });
  }
  return NextResponse.json({ ok: true, roles: await loadRoles(g.svc) });
}

export async function DELETE(req: Request) {
  const g = await requireAdmin();
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key ?? '');
  if (!key) return NextResponse.json({ error: 'key 가 필요합니다.' }, { status: 400 });
  const { data: role } = await g.svc.from('profile_roles').select('key, builtin, label').eq('key', key).maybeSingle();
  if (!role) return NextResponse.json({ error: '역할을 찾을 수 없습니다.' }, { status: 404 });
  if (role.builtin) return NextResponse.json({ error: '기본 역할(스탭·매니저)은 삭제할 수 없어요. 이름만 바꾸세요.' }, { status: 400 });
  const { count } = await g.svc.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', key);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `'${role.label}' 역할을 쓰는 계정이 ${count}명 있어요. 먼저 다른 역할로 바꾼 뒤 삭제하세요.` }, { status: 409 });
  }
  const { error } = await g.svc.from('profile_roles').delete().eq('key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, roles: await loadRoles(g.svc) });
}
