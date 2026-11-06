import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { toStaff } from '@/lib/schedule/queries';
import { isDutyTag, isStaffRole } from '@/lib/schedule/types';
import { isYmd, kstToday } from '@/lib/teaching/kst';
import { NAME_RE, isSimpleEmail, normalizeName } from '@/lib/account/simple-login';
import { isOwner } from '@/lib/finance/access';
import { setAccountLeft } from '@/lib/staff/directory';

export const runtime = 'nodejs';

/** 명부에 연결할 수 있는 로그인 계정 — 승인된 간편 계정 + 구글 계정. 교육 명부 전용·대기·퇴사 계정은 제외. */
async function linkableAccounts(svc: SupabaseClient, staff: { id: unknown; user_id: unknown }[]) {
  const [{ data: users, error }, { data: profiles }] = await Promise.all([
    svc.auth.admin.listUsers({ perPage: 200 }),
    svc.from('profiles').select('user_id, display_name, status, roster_only'),
  ]);
  if (error) throw new Error(error.message);
  const profileOf = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const linkedTo = new Map(staff.filter((s) => s.user_id).map((s) => [s.user_id as string, Number(s.id)]));
  return users.users
    .filter((u) => {
      const p = profileOf.get(u.id);
      return !u.banned_until && (!p || (p.status === 'active' && !p.roster_only));
    })
    .map((u) => {
      const name = (profileOf.get(u.id)?.display_name as string | undefined) ?? null;
      const email = isSimpleEmail(u.email) ? null : (u.email ?? null);
      return { userId: u.id, name, label: name && email ? `${name} (${email})` : (name ?? email ?? u.id), linkedStaffId: linkedTo.get(u.id) ?? null };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

// 직원 명부(운영진 전용) — 재직·이름의 정본. GET / POST { name, homeStore } / PATCH { id, name?, homeStore?, joinedOn?, active?, roles?, dutyTag?, userId? }.
// 기록 보존을 위해 삭제는 없다(재직 끄기). 계정이 연결돼 있으면 이름·지점을 맞추고, 재직을 끄면 로그인을 막는다.
export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const { data, error } = await a.svc.from('schedule_staff').select('id, name, home_store, joined_on, active, roles, duty_tag, user_id').order('name');
  if (error) return dbError(error);
  const userIds = (data ?? []).map((s) => s.user_id).filter(Boolean) as string[];
  const { data: profiles } = userIds.length
    ? await a.svc.from('profiles').select('user_id, roster_only').in('user_id', userIds)
    : { data: [] as { user_id: string; roster_only: boolean }[] };
  const rosterOnly = new Map((profiles ?? []).map((p) => [p.user_id as string, !!p.roster_only]));
  // 마지막 근무일 — 사람당 한 건만 읽는다(staff_id, work_date 인덱스). 작성 중인 미래 계획은 세지 않는다.
  const today = kstToday();
  const last = await Promise.all(
    (data ?? []).map((s) =>
      a.svc
        .from('schedule_shifts')
        .select('work_date')
        .eq('staff_id', s.id)
        .eq('is_off', false)
        .lte('work_date', today)
        .order('work_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  return NextResponse.json({
    staff: (data ?? []).map((s, i) => ({
      ...toStaff(s),
      userId: (s.user_id as string | null) ?? null,
      lastWorked: (last[i].data?.work_date as string | undefined) ?? null,
      account: !s.user_id ? null : rosterOnly.get(s.user_id) === false ? 'login' : 'roster',
    })),
    accounts: await linkableAccounts(a.svc, data ?? []),
    today,
  });
}

export async function POST(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const name = String(b?.name ?? '').trim();
  if (!name) return badRequest('이름을 입력하세요.');
  if (!isStore(b?.homeStore)) return badRequest('지점을 선택하세요.');
  const { data, error } = await a.svc.from('schedule_staff').insert({ name, home_store: b.homeStore }).select().single();
  if (error?.code === '23505') return NextResponse.json({ error: '이미 있는 이름입니다.' }, { status: 409 });
  if (error) return dbError(error);
  // 교육 명부 등에 같은 이름의 계정이 이미 있으면 연결
  const { data: p } = await a.svc.from('profiles').select('user_id').eq('display_name', name).maybeSingle();
  if (p) await a.svc.from('schedule_staff').update({ user_id: p.user_id }).eq('id', data.id);
  return NextResponse.json({ staff: toStaff(data) });
}

export async function PATCH(req: Request) {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const b = await req.json().catch(() => ({}));
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return badRequest('근무자를 선택하세요.');
  const { data: cur } = await a.svc.from('schedule_staff').select('name, home_store, active, user_id').eq('id', id).maybeSingle();
  if (!cur) return NextResponse.json({ error: '근무자를 찾을 수 없습니다.' }, { status: 404 });
  const userId = cur.user_id as string | null;
  const patch: Record<string, unknown> = {};
  if (typeof b?.active === 'boolean') patch.active = b.active;
  if (b?.homeStore !== undefined) {
    if (!isStore(b.homeStore)) return badRequest('지점이 올바르지 않습니다.');
    patch.home_store = b.homeStore;
  }
  if (b?.roles !== undefined) {
    if (!Array.isArray(b.roles) || !b.roles.every(isStaffRole)) return badRequest('역할이 올바르지 않습니다.');
    patch.roles = Array.from(new Set(b.roles));
  }
  if (b?.dutyTag !== undefined) {
    if (b.dutyTag !== null && !isDutyTag(b.dutyTag)) return badRequest('책임 태그가 올바르지 않습니다.');
    patch.duty_tag = b.dutyTag;
  }
  if (b?.userId !== undefined) {
    // 계정 연결 — 체크리스트 담당 판정의 기준. 이름이 달라도, 구글 계정이어도 운영진이 직접 잇는다.
    if (b.userId !== null) {
      if (typeof b.userId !== 'string') return badRequest('계정이 올바르지 않습니다.');
      const { data: other } = await a.svc.from('schedule_staff').select('name').eq('user_id', b.userId).neq('id', id).maybeSingle();
      if (other) return NextResponse.json({ error: `이 계정은 이미 ${other.name}님에게 연결돼 있습니다.` }, { status: 409 });
      const { data: u, error: uErr } = await a.svc.auth.admin.getUserById(b.userId);
      if (uErr || !u?.user) return badRequest('계정을 찾을 수 없습니다.');
      // 탭을 지정해 둔 계정은 새 탭이 꺼져 있어, 연결하면서 체크리스트를 켠다
      const { data: access } = await a.svc.from('garden_tab_access').select('tabs').eq('user_id', b.userId).maybeSingle();
      if (Array.isArray(access?.tabs) && !access.tabs.includes('checklist')) {
        const { error: tabErr } = await a.svc.from('garden_tab_access').update({ tabs: [...access.tabs, 'checklist'], updated_at: new Date().toISOString() }).eq('user_id', b.userId);
        if (tabErr) return dbError(tabErr);
      }
    }
    patch.user_id = b.userId;
  }
  if (b?.joinedOn !== undefined) {
    if (b.joinedOn !== null && !isYmd(b.joinedOn)) return badRequest('입사일이 올바르지 않습니다.');
    patch.joined_on = b.joinedOn;
  }
  let profileName: string | null = null;
  if (b?.name !== undefined) {
    const name = userId ? normalizeName(b.name) : String(b.name).trim();
    if (!name) return badRequest('이름을 입력하세요.');
    if (userId && name !== cur.name) {
      if (!NAME_RE.test(name)) return badRequest('이름은 한글·영문·숫자 1~12자입니다.');
      const { data: dup } = await a.svc.from('profiles').select('user_id').eq('display_name', name).neq('user_id', userId).maybeSingle();
      if (dup) return NextResponse.json({ error: '같은 이름의 계정이 이미 있습니다.' }, { status: 409 });
      profileName = name;
    }
    patch.name = name;
  }

  // 재직 변경 — 계정을 먼저 처리해, 로그인은 열린 채 퇴사로만 표시되는 일이 없게 한다
  if (userId && typeof b?.active === 'boolean' && b.active !== cur.active) {
    if (!b.active) {
      if (userId === a.userId) return badRequest('본인 계정은 퇴사 처리할 수 없습니다.');
      const { data: u } = await a.svc.auth.admin.getUserById(userId);
      if (isOwner(u?.user?.email)) return badRequest('대표 계정은 퇴사 처리할 수 없습니다.');
    }
    try {
      await setAccountLeft(a.svc, userId, !b.active);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : '계정 처리에 실패했습니다.' }, { status: 500 });
    }
  }

  const { error } = await a.svc.from('schedule_staff').update(patch).eq('id', id);
  if (error?.code === '23505') return NextResponse.json({ error: '이미 있는 이름입니다.' }, { status: 409 });
  if (error) return dbError(error);

  if (userId && (profileName || patch.home_store)) {
    const profilePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (profileName) profilePatch.display_name = profileName;
    if (patch.home_store && patch.home_store !== cur.home_store) {
      // 계정의 지점은 여러 개일 수 있어, 예전 기본 지점만 새 지점으로 바꾼다
      const { data: p } = await a.svc.from('profiles').select('stores').eq('user_id', userId).maybeSingle();
      if (p) {
        profilePatch.stores = Array.from(new Set(((p.stores as string[]) ?? []).map((x) => (x === cur.home_store ? patch.home_store : x)).concat(patch.home_store as string)));
      }
    }
    const { error: pErr } = await a.svc.from('profiles').update(profilePatch).eq('user_id', userId);
    if (pErr) return dbError(pErr);
  }
  return NextResponse.json({ ok: true });
}
