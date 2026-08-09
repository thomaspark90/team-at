import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolveRole, isOwner, isAllowedEmail } from '@/lib/finance/access';
import { GARDEN_TAB_KEYS } from '@/lib/garden/tabs';
import { STUDIO_TAB_KEYS } from '@/lib/studio/tabs';
import { SECTION_KEYS } from '@/lib/access/sections';

export const runtime = 'nodejs';
export const maxDuration = 15;

// 페이지 접근 권한 — 상위 섹션(sections)과 가든/스탭밀 하위 탭(tabs/studioTabs).
// GET: 내 권한(mine = 가든 탭, sections = 상위 섹션. 각각 null = 전체).
//      admin 이면 전체 사용자 목록(users)과 외부 이메일 허용 목록(allowedEmails)도 함께.
// PATCH: admin 전용 — { userId, email, tabs?, sections?, studioTabs? } 부분 갱신.
//        셋 다 전체 허용이면 행 삭제, 아니면 upsert.
// POST: admin 전용 — { email } 이메일 사전 등록. auth 계정을 미리 만들어 목록에 올리고
//       (로그인 전에 권한 배정 가능), 외부 이메일이면 finance.allowed_emails 에도 넣어
//       로그인을 연다. 같은 이메일로 구글 로그인하면 기존 계정에 자동 연결된다.
// DELETE: admin 전용 —
//   { email }               외부 이메일 허용 해제(계정·권한 행은 남고 로그인만 막힘)
//   { userId, purge: true } 계정 완전 삭제 — auth 계정·권한 행·허용 목록을 모두 제거.
//     외부 계정은 허용 목록에서도 빠져 로그인이 차단된다. 팀 도메인 계정은 구글 로그인하면
//     다시 생성되므로(그때는 전체 접근) 완전 차단은 워크스페이스에서 계정을 정지해야 한다.

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

export async function GET(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const svc = service();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  // 나비는 자기 권한만 필요하다 — admin 목록 조회(listUsers)까지 돌면 매 페이지 로드가 비싸진다
  const mineOnly = new URL(req.url).searchParams.get('scope') === 'mine';

  // 내 권한 — OWNER 는 항상 전체(null)
  let mine: string[] | null = null;
  let sections: string[] | null = null;
  let mineStudio: string[] | null = null;
  if (!isOwner(g.user.email)) {
    const { data } = await svc
      .from('garden_tab_access')
      .select('tabs, sections, studio_tabs')
      .eq('user_id', g.user.id)
      .maybeSingle();
    mine = (data?.tabs as string[] | undefined) ?? null;
    sections = (data?.sections as string[] | undefined) ?? null;
    mineStudio = (data?.studio_tabs as string[] | undefined) ?? null;
  }

  const role = await resolveRole(g.supabase, g.user);
  if (mineOnly) return NextResponse.json({ mine, mineStudio, sections, isAdmin: role === 'admin' });

  // 팀 전체 계정 이메일(대표·사전 등록 계정 포함) — 항목별 담당자 등 이메일 선택 드롭다운용.
  // admin 이 아니어도 내려준다(팀 내부 정보, 미들웨어가 팀 확인을 끝낸 뒤에만 도달).
  const { data: usersData, error: usersErr } = await svc.auth.admin.listUsers({ perPage: 200 });
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
  const emails = usersData.users
    .map((u) => u.email)
    .filter((e): e is string => !!e)
    .sort();

  if (role !== 'admin') return NextResponse.json({ mine, mineStudio, sections, isAdmin: false, emails });
  const { data: accessRows } = await svc.from('garden_tab_access').select('user_id, tabs, sections, studio_tabs');
  const accessMap = new Map(
    (accessRows ?? []).map(
      (r: { user_id: string; tabs: string[] | null; sections: string[] | null; studio_tabs: string[] | null }) => [
        r.user_id,
        r,
      ],
    ),
  );

  const users = usersData.users
    .filter((u) => !!u.email && !isOwner(u.email)) // OWNER 는 항상 전체라 목록에서 제외
    .map((u) => ({
      id: u.id,
      email: u.email!,
      tabs: accessMap.get(u.id)?.tabs ?? null,
      sections: accessMap.get(u.id)?.sections ?? null,
      studioTabs: accessMap.get(u.id)?.studio_tabs ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  // 외부(비 @team-at.space) 이메일 허용 목록 — 로그인 차단/허용 표시와 허용 해제 UI 용
  const { data: allowRows } = await svc.from('allowed_emails').select('email');
  const allowedEmails = ((allowRows ?? []) as { email: string }[]).map((r) => r.email).sort();

  return NextResponse.json({ mine, mineStudio, sections, isAdmin: true, users, allowedEmails, emails });
}

// 이메일 사전 등록 — 계정이 없으면 만들어(비밀번호 없는 자리, 구글 로그인 시 자동 연결)
// 권한 목록에 올리고, 외부 이메일이면 허용 목록에도 추가해 로그인을 연다.
export async function POST(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const role = await resolveRole(g.supabase, g.user);
  if (role !== 'admin') return NextResponse.json({ error: '관리자만 추가할 수 있습니다.' }, { status: 403 });
  const svc = service();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (isOwner(email)) return NextResponse.json({ error: '대표 계정은 항상 전체 접근입니다.' }, { status: 400 });

  // 이미 로그인한 적 있는 계정이면 그대로 쓰고, 없으면 미리 생성.
  // email_confirm 을 켜야 이후 같은 이메일의 구글 로그인이 이 계정으로 연결된다.
  const { data: usersData, error: usersErr } = await svc.auth.admin.listUsers({ perPage: 200 });
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
  let target = usersData.users.find((u) => (u.email ?? '').toLowerCase() === email) ?? null;
  if (!target) {
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    target = created.user;
  }

  // 외부 이메일이면 허용 목록에 추가 — 팀 도메인은 원래 허용이라 넣지 않는다
  if (!isAllowedEmail(email)) {
    const { error } = await svc
      .from('allowed_emails')
      .upsert({ email, created_by: g.user.email ?? '' }, { onConflict: 'email' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: access } = await svc
    .from('garden_tab_access')
    .select('tabs, sections, studio_tabs')
    .eq('user_id', target.id)
    .maybeSingle();

  return NextResponse.json({
    user: {
      id: target.id,
      email,
      tabs: (access?.tabs as string[] | null) ?? null,
      sections: (access?.sections as string[] | null) ?? null,
      studioTabs: (access?.studio_tabs as string[] | null) ?? null,
    },
    allowed: !isAllowedEmail(email),
  });
}

// 외부 이메일 허용 해제 또는 계정 완전 삭제 — 상단 주석 참고.
export async function DELETE(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;
  const role = await resolveRole(g.supabase, g.user);
  if (role !== 'admin') return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 });
  const svc = service();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const body = await req.json().catch(() => ({}));

  // 계정 완전 삭제 — 잘못 등록했거나 내보낼 계정. auth·권한 행·허용 목록 일괄 제거.
  if (body?.purge === true) {
    const userId = String(body?.userId ?? '');
    if (!userId) return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
    const { data: target } = await svc.auth.admin.getUserById(userId);
    const email = (target?.user?.email ?? '').toLowerCase();
    if (!email) return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
    if (isOwner(email)) return NextResponse.json({ error: '대표 계정은 삭제할 수 없습니다.' }, { status: 400 });
    if (email === (g.user.email ?? '').toLowerCase()) {
      return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
    }

    // 송금 요청 기록은 requester_id 가 ON DELETE CASCADE 라 계정과 함께 지워진다 —
    // 기록 유실을 막기 위해 이력이 있으면 삭제를 거부한다(차단은 권한 끄기·허용 해제로).
    const { count: transferCount } = await svc
      .from('transfer_requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', userId);
    if ((transferCount ?? 0) > 0) {
      return NextResponse.json(
        { error: `이 계정의 송금 요청 기록 ${transferCount}건이 함께 삭제됩니다 — 기록 보존을 위해 삭제 대신 접근 권한을 모두 끄고(외부 계정은 허용 해제) 차단하세요.` },
        { status: 409 },
      );
    }

    const { error: delErr } = await svc.auth.admin.deleteUser(userId);
    if (delErr) {
      // 회계 기록(거래 분류·업로드·월결산 등)이 이 계정을 참조하면 DB 가 삭제를 거부한다(FK)
      const friendly = /foreign key|violates/i.test(delErr.message)
        ? '이 계정이 남긴 회계 기록이 있어 삭제할 수 없습니다 — 기록 보존을 위해 삭제 대신 접근 권한을 모두 끄고(외부 계정은 허용 해제) 차단하세요.'
        : delErr.message;
      return NextResponse.json({ error: friendly }, { status: 409 });
    }
    // 권한 행·외부 허용 목록도 함께 제거 — 외부 계정은 이걸로 재로그인까지 차단된다
    await svc.from('garden_tab_access').delete().eq('user_id', userId);
    await svc.from('allowed_emails').delete().eq('email', email);
    return NextResponse.json({ ok: true, email });
  }

  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email 이 필요합니다.' }, { status: 400 });

  const { error } = await svc.from('allowed_emails').delete().eq('email', email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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
  const studioTabsIn = Array.isArray(body?.studioTabs) ? body.studioTabs.map(String) : undefined;
  if (!userId || !email || (tabsIn === undefined && sectionsIn === undefined && studioTabsIn === undefined)) {
    return NextResponse.json({ error: 'userId, email 과 tabs·sections·studioTabs 중 하나가 필요합니다.' }, { status: 400 });
  }
  // email 은 클라이언트가 보낸 값이라 그대로 믿으면 대표 계정 보호를 우회할 수 있다 — 실제 계정으로 확인
  const { data: target } = await svc.auth.admin.getUserById(userId);
  const realEmail = target?.user?.email ?? '';
  if (!realEmail) return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
  if (isOwner(realEmail)) return NextResponse.json({ error: '대표 계정은 항상 전체 접근입니다.' }, { status: 400 });

  // 전체 선택 = 제한 없음(null)로 저장 — 나중에 탭/섹션이 추가돼도 자동으로 허용된다
  const narrow = (input: string[] | undefined, all: string[], current: string[] | null) => {
    if (input === undefined) return current;
    const valid = all.filter((k) => input.includes(k));
    return valid.length === all.length ? null : valid;
  };

  const { data: existing } = await svc
    .from('garden_tab_access')
    .select('tabs, sections, studio_tabs')
    .eq('user_id', userId)
    .maybeSingle();

  const tabs = narrow(tabsIn, GARDEN_TAB_KEYS, (existing?.tabs as string[] | null) ?? null);
  const sections = narrow(sectionsIn, SECTION_KEYS, (existing?.sections as string[] | null) ?? null);
  const studioTabs = narrow(studioTabsIn, STUDIO_TAB_KEYS, (existing?.studio_tabs as string[] | null) ?? null);

  // 셋 다 제한 없음이면 행 삭제, 아니면 upsert
  if (tabs === null && sections === null && studioTabs === null) {
    const { error } = await svc.from('garden_tab_access').delete().eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, tabs: null, sections: null, studioTabs: null });
  }
  const { error } = await svc.from('garden_tab_access').upsert(
    { user_id: userId, email: realEmail, tabs, sections, studio_tabs: studioTabs, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tabs, sections, studioTabs });
}
