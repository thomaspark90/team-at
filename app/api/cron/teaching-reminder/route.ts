import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { sendPushToUsers } from '@/lib/notify';
import { profileMap, upcomingShifts } from '@/lib/teaching/queries';
import { addDays, fmtMd, fmtRange, kstToday } from '@/lib/teaching/kst';
import { STORES } from '@/lib/types';
import { loadRoles, manageRoleKeys } from '@/lib/account/roles';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 매니저 출근 전날 알림 크론(매일 20시 KST = 11시 UTC, vercel.json crons) —
// 내일 일정이 있으면 교육 대상 스탭(지정 없으면 해당 지점 스탭 전원)에게 웹 푸시. 간편 계정은 메일함이 없어 푸시만.
// 매니저 본인에게도 '내일 ○○점 출근' 리마인드를 보낸다. 인증은 CRON_SECRET Bearer.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 설정 필요' }, { status: 500 });

  const tomorrow = addDays(kstToday(), 1);
  const shifts = await upcomingShifts(svc, tomorrow, tomorrow);
  if (shifts.length === 0) return NextResponse.json({ ok: true, date: tomorrow, sent: 0, skipped: '내일 출근 일정 없음' });

  const [profiles, roles] = await Promise.all([profileMap(svc), loadRoles(svc)]);
  const manageKeys = manageRoleKeys(roles);
  const staff = Array.from(profiles.values()).filter((p) => !manageKeys.has(p.role));
  const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

  let sent = 0;
  for (const shift of shifts) {
    const when = [fmtMd(shift.date), fmtRange(shift.startTime, shift.endTime)].filter(Boolean).join(' ');
    const targets = shift.trainees.length
      ? shift.trainees.map((t) => t.userId)
      : staff.filter((p) => p.stores.includes(shift.store)).map((p) => p.user_id);
    if (targets.length) {
      await sendPushToUsers(svc, targets, {
        title: `내일 ${shift.managerName} 매니저 ${storeLabel(shift.store)} 교육`,
        body: `${when} · 배우고 싶은 주제를 미리 체크해 두세요.`,
        url: '/garden/teaching',
      });
      sent += targets.length;
    }
    const who = shift.trainees.map((t) => t.name).join(', ');
    await sendPushToUsers(svc, [shift.managerId], {
      title: `내일 ${storeLabel(shift.store)} 교육`,
      body: `${when}${who ? ` · ${who}` : ''} — 교육 탭에서 준비할 주제를 확인하세요.`,
      url: '/garden/teaching',
    });
  }
  return NextResponse.json({ ok: true, date: tomorrow, shifts: shifts.length, sent });
}
