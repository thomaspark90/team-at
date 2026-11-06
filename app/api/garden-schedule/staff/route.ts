import { NextResponse } from 'next/server';
import { badRequest, dbError, isStore, requireScheduleEditor } from '@/lib/schedule/access';
import { toStaff } from '@/lib/schedule/queries';
import { isStaffRole } from '@/lib/schedule/types';
import { isYmd, kstToday } from '@/lib/teaching/kst';
import { NAME_RE, normalizeName } from '@/lib/account/simple-login';
import { isOwner } from '@/lib/finance/access';
import { setAccountLeft } from '@/lib/staff/directory';

export const runtime = 'nodejs';

// 직원 명부(운영진 전용) — 재직·이름의 정본. GET / POST { name, homeStore } / PATCH { id, name?, homeStore?, joinedOn?, active?, roles? }.
// 기록 보존을 위해 삭제는 없다(재직 끄기). 계정이 연결돼 있으면 이름·지점을 맞추고, 재직을 끄면 로그인을 막는다.
export async function GET() {
  const a = await requireScheduleEditor();
  if (a instanceof NextResponse) return a;
  const { data, error } = await a.svc.from('schedule_staff').select('id, name, home_store, joined_on, active, roles, user_id').order('name');
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
      lastWorked: (last[i].data?.work_date as string | undefined) ?? null,
      account: !s.user_id ? null : rosterOnly.get(s.user_id) === false ? 'login' : 'roster',
    })),
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
