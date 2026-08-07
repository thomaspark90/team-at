import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolveRole, isOwner } from '@/lib/finance/access';
import { GARDEN_TAB_KEYS } from '@/lib/garden/tabs';

export const runtime = 'nodejs';
export const maxDuration = 15;

// 가든 하위 탭 접근 권한.
// GET: 내 허용 탭(mine: null = 전체). admin 이면 전체 사용자 목록(users)도 함께.
// PATCH: admin 전용 — { userId, email, tabs } 로 사용자별 허용 탭 저장.
//        전체 탭이면 행 삭제(= 전체 허용), 아니면 upsert.

const service = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { db: { schema: 'finance' } });
};

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  return { supabase, user };
}

export async function GET() {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const svc = service();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  // 내 허용 탭 — OWNER 는 항상 전체(null)
  let mine: string[] | null = null;
  if (!isOwner(g.user.email)) {
    const { data } = await svc.from('garden_tab_access').select('tabs').eq('user_id', g.user.id).maybeSingle();
    mine = (data?.tabs as string[] | undefined) ?? null;
  }

  const role = await resolveRole(g.supabase, g.user);
  if (role !== 'admin') return NextResponse.json({ mine, isAdmin: false });

  // admin: 팀 전체 계정 + 각자의 허용 탭 (행 없으면 null = 전체)
  const { data: usersData, error: usersErr } = await svc.auth.admin.listUsers({ perPage: 200 });
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
  const { data: accessRows } = await svc.from('garden_tab_access').select('user_id, tabs');
  const accessMap = new Map((accessRows ?? []).map((r: { user_id: string; tabs: string[] }) => [r.user_id, r.tabs]));

  const users = usersData.users
    .filter((u) => !!u.email && !isOwner(u.email)) // OWNER 는 항상 전체라 목록에서 제외
    .map((u) => ({ id: u.id, email: u.email!, tabs: accessMap.get(u.id) ?? null }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ mine, isAdmin: true, users });
}

export async function PATCH(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const role = await resolveRole(g.supabase, g.user);
  if (role !== 'admin') return NextResponse.json({ error: '관리자만 변경할 수 있습니다.' }, { status: 403 });
  const svc = service();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? '');
  const email = String(body?.email ?? '');
  const tabs = Array.isArray(body?.tabs) ? body.tabs.map(String) : null;
  if (!userId || !email || !tabs) {
    return NextResponse.json({ error: 'userId, email, tabs 가 필요합니다.' }, { status: 400 });
  }
  if (isOwner(email)) return NextResponse.json({ error: '대표 계정은 항상 전체 접근입니다.' }, { status: 400 });
  const valid = tabs.filter((t: string) => GARDEN_TAB_KEYS.includes(t));

  // 전체 허용이면 행 삭제, 아니면 upsert
  if (valid.length === GARDEN_TAB_KEYS.length) {
    const { error } = await svc.from('garden_tab_access').delete().eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, tabs: null });
  }
  const { error } = await svc.from('garden_tab_access').upsert(
    { user_id: userId, email, tabs: valid, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tabs: valid });
}
