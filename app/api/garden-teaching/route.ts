import { NextResponse } from 'next/server';
import { requireActor, isActor, canManage, isManagerProfile } from '@/lib/teaching/access';
import { isFulfilled, lastReceivedMap, profileMap, upcomingShifts } from '@/lib/teaching/queries';
import { addDays, kstToday } from '@/lib/teaching/kst';

export const runtime = 'nodejs';

// 교육 탭 진입 데이터 — 역할·프로필·내 위시(받음 여부)·자유 서술·다가오는 티칭 일정(시간·교육 대상)·매니저·스탭 명단.
// 화면 하나가 역할에 따라 갈리므로(스탭/매니저·대표) 필요한 걸 한 번에 내려준다.
export async function GET() {
  const a = await requireActor();
  if (!isActor(a)) return a;
  const today = kstToday();

  const [{ data: wishRows }, { data: noteRow }, received, shifts, profiles] = await Promise.all([
    a.svc.from('teaching_wishes').select('topic_key, requested_at').eq('user_id', a.userId),
    a.svc.from('teaching_notes').select('note, updated_at').eq('user_id', a.userId).maybeSingle(),
    lastReceivedMap(a.svc, [a.userId]),
    upcomingShifts(a.svc, today, addDays(today, 42)),
    profileMap(a.svc),
  ]);

  const wishes = (wishRows ?? []).map((w) => {
    const r = received.get(`${a.userId}:${w.topic_key}`);
    return {
      topicKey: w.topic_key as string,
      requestedAt: w.requested_at as string,
      received: r && isFulfilled(w.requested_at as string, r) ? r : null,
    };
  });
  // 주제별 마지막 수강 — 위시를 끈 항목도 '언제 받았는지'는 보여준다
  const receivedAll = Array.from(received.entries())
    .filter(([k]) => k.startsWith(a.userId + ':'))
    .map(([k, r]) => ({ topicKey: k.slice(a.userId.length + 1), ...r }));

  const myStores = a.profile?.stores ?? [];
  const visibleShifts =
    !canManage(a) && myStores.length ? shifts.filter((s) => myStores.includes(s.store)) : shifts;

  const managers = Array.from(profiles.values())
    .filter((p) => isManagerProfile(a, p))
    .map((p) => ({ userId: p.user_id, name: p.display_name, stores: p.stores }));
  // 교육 대상 선택지 — 운영 권한 있는 계정에게만(스탭에겐 다른 스탭 명단을 내려주지 않는다)
  const staff = canManage(a)
    ? Array.from(profiles.values())
        .filter((p) => !isManagerProfile(a, p))
        .map((p) => ({ userId: p.user_id, name: p.display_name, stores: p.stores }))
    : [];

  return NextResponse.json({
    today,
    userId: a.userId,
    role: a.role,
    profile: a.profile
      ? {
          name: a.profile.display_name,
          stores: a.profile.stores,
          roleLabel: a.roles.find((r) => r.key === a.profile!.role)?.label ?? a.profile.role,
          simpleLogin: a.profile.simple_login,
          pinResetRequired: a.profile.pin_reset_required,
        }
      : null,
    canManage: canManage(a),
    wishes,
    receivedAll,
    note: (noteRow?.note as string | undefined) ?? '',
    shifts: visibleShifts,
    managers,
    staff,
  });
}
