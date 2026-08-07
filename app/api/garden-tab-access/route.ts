import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolveRole, isOwner } from '@/lib/finance/access';
import { GARDEN_TAB_KEYS } from '@/lib/garden/tabs';
import { SECTION_KEYS } from '@/lib/access/sections';

export const runtime = 'nodejs';
export const maxDuration = 15;

// 페이지 접근 권한 — 상위 섹션(sections)과 가든 하위 탭(tabs).
// GET: 내 권한(mine = 가든 탭, sections = 상위 섹션. 각각 null = 전체).
//      admin 이면 전체 사용자 목록(users)도 함께.
// PATCH: admin 전용 — { userId, email, tabs?, sections? } 부분 갱신.
//        둘 다 전체 허용이면 행 삭제, 아니면 upsert.

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

  // 내 권한 — OWNER 는 항상 전체(null)
  let mine: string[] | null = null;
  let sections: string[] | null = null;
  if (!isOwner(g.user.email)) {
    const { data } = await svc
      .from('garden_tab_access')
      .select('tabs, sections')
      .eq('user_id', g.user.id)
      .maybeSingle();
    mine = (data?.tabs as string[] | undefined) ?? null;
    sections = (data?.sections as string[] | undefined) ?? null;
  }

  const role = await resolveRole(g.supabase, g.user);
  if (role !== 'admin') return NextResponse.json({ mine, sections, isAdmin: false });

  // admin: 팀 전체 계정 + 각자의 허용 섹션·탭 (행 없으면 null = 전체)
  const { data: usersData, error: usersErr } = await svc.auth.admin.listUsers({ perPage: 200 });
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
  const { data: accessRows } = await svc.from('garden_tab_access').select('user_id, tabs, sections');
  const accessMap = new Map(
    (accessRows ?? []).map((r: { user_id: string; tabs: string[] | null; sections: string[] | null }) => [
      r.user_id,
      r,
    ]),
  );

  const users = usersData.users
    .filter((u) => !!u.email && !isOwner(u.email)) // OWNER 는 항상 전체라 목록에서 제외
    .map((u) => ({
      id: u.id,
      email: u.email!,
      tabs: accessMap.get(u.id)?.tabs ?? null,
      sections: accessMap.get(u.id)?.sections ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ mine, sections, isAdmin: true, users });
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
  const tabsIn = Array.isArray(body?.tabs) ? body.tabs.map(String) : undefined;
  const sectionsIn = Array.isArray(body?.sections) ? body.sections.map(String) : undefined;
  if (!userId || !email || (tabsIn === undefined && sectionsIn === undefined)) {
    return NextResponse.json({ error: 'userId, email 과 tabs 또는 sections 가 필요합니다.' }, { status: 400 });
  }
  if (isOwner(email)) return NextResponse.json({ error: '대표 계정은 항상 전체 접근입니다.' }, { status: 400 });

  // 전체 선택 = 제한 없음(null)로 저장 — 나중에 탭/섹션이 추가돼도 자동으로 허용된다
  const narrow = (input: string[] | undefined, all: string[], current: string[] | null) => {
    if (input === undefined) return current;
    const valid = all.filter((k) => input.includes(k));
    return valid.length === all.length ? null : valid;
  };

  const { data: existing } = await svc
    .from('garden_tab_access')
    .select('tabs, sections')
    .eq('user_id', userId)
    .maybeSingle();

  const tabs = narrow(tabsIn, GARDEN_TAB_KEYS, (existing?.tabs as string[] | null) ?? null);
  const sections = narrow(sectionsIn, SECTION_KEYS, (existing?.sections as string[] | null) ?? null);

  // 둘 다 제한 없음이면 행 삭제, 아니면 upsert
  if (tabs === null && sections === null) {
    const { error } = await svc.from('garden_tab_access').delete().eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, tabs: null, sections: null });
  }
  const { error } = await svc.from('garden_tab_access').upsert(
    { user_id: userId, email, tabs, sections, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tabs, sections });
}
