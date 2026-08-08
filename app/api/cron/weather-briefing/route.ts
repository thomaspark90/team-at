import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchForecastDays, wmoLabel } from '@/lib/garden/weatherForecast';
import { buildWeatherComments } from '@/lib/garden/weatherComment';
import { KR_HOLIDAYS } from '@/lib/garden/krHolidays';
import { notifyGardenEvent, recipientEmails } from '@/lib/notify';
import { APP_URL } from '@/lib/app-url';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 주간 발주 브리핑 크론(매주 월 08시 KST = 일 23시 UTC, vercel.json crons) —
// 이번 주 날씨 요약 + 발주 판단 코멘트를 원두(stock) 알림 수신자에게 이메일+웹푸시로 보낸다.
// 대시보드를 열지 않아도 발주 판단 재료가 도착하는 게 목적. 인증은 Vercel 크론의 CRON_SECRET.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 설정 필요' }, { status: 500 });
  }
  const supabase = createServiceClient(url, serviceKey);

  const emails = await recipientEmails(supabase, 'stock');
  if (emails.length === 0) return NextResponse.json({ ok: true, skipped: '수신자 없음' });

  let days;
  try {
    days = await fetchForecastDays();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '예보 조회 실패' }, { status: 502 });
  }
  const week = days.slice(0, 7);
  const comments = buildWeatherComments(days);
  const headline = comments.length > 0 ? comments.join(' / ') : '특이 신호 없음 — 평온한 한 주 예보';

  const dayLine = (d: (typeof week)[number]) => {
    const dow = new Date(d.ymd + 'T00:00:00Z').getUTCDay();
    const holiday = KR_HOLIDAYS.has(d.ymd);
    const md = `${Number(d.ymd.slice(5, 7))}/${Number(d.ymd.slice(8, 10))}`;
    const rain = (d.rainProb ?? 0) >= 30 || d.rainMm >= 1 ? ` · 비 ${d.rainProb ?? 0}%${d.rainMm >= 1 ? ` ${Math.round(d.rainMm)}mm` : ''}` : '';
    return `${md}(${DOW[dow]}${holiday ? '·휴' : ''}) ${wmoLabel(d.code)} ${Math.round(d.tMax)}°/${Math.round(d.tMin)}°${rain}`;
  };

  const html =
    `<p><strong>${headline}</strong></p>` +
    `<p>${week.map(dayLine).join('<br/>')}</p>` +
    `<p style="color:#888">가든 대시보드 날씨 스트립 · <a href="${APP_URL}/garden">${APP_URL}/garden</a></p>`;

  await notifyGardenEvent(supabase, {
    emails,
    subject: `[가든] 주간 날씨 브리핑 — ${headline.slice(0, 40)}${headline.length > 40 ? '…' : ''}`,
    html,
    push: { title: '가든 주간 날씨 브리핑', body: headline, url: `${APP_URL}/garden` },
  });

  return NextResponse.json({ ok: true, sent: emails.length, headline });
}
