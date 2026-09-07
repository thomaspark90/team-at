import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { sendPushToUsers } from '@/lib/notify';
import { profileMap, upcomingShifts } from '@/lib/teaching/queries';
import { addDays, fmtMd, kstToday } from '@/lib/teaching/kst';
import { STORES } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 매니저 출근 전날 알림 크론(매일 20시 KST = 11시 UTC, vercel.json crons) —
// 내일 출근 일정이 있으면 해당 지점 스탭에게 웹 푸시. 간편 계정은 메일함이 없어 푸시만.
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

  const profiles = await profileMap(svc);
  const staff = Array.from(profiles.values()).filter((p) => p.role === 'staff');
  const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;

  let sent = 0;
  for (const shift of shifts) {
    const targets = staff.filter((p) => p.stores.includes(shift.store)).map((p) => p.user_id);
    if (targets.length) {
      await sendPushToUsers(svc, targets, {
        title: `내일 ${shift.managerName} 매니저 ${storeLabel(shift.store)} 출근`,
        body: `${fmtMd(shift.date)} · 배우고 싶은 주제를 미리 체크해 두세요.`,
        url: '/garden/teaching',
      });
      sent += targets.length;
    }
    await sendPushToUsers(svc, [shift.managerId], {
      title: `내일 ${storeLabel(shift.store)} 출근`,
      body: `${fmtMd(shift.date)} · 교육 탭에서 그 지점 요청을 확인하세요.`,
      url: '/garden/teaching',
    });
  }
  return NextResponse.json({ ok: true, date: tomorrow, shifts: shifts.length, sent });
}
