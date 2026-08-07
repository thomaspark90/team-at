import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { PIPELINES, judgeIngest, readIngestHealth, shouldAlert, markAlerted, type IngestPipeline } from '@/lib/ingest-health';
import { notifyGardenEvent, recipientEmails } from '@/lib/notify';
import { APP_URL } from '@/lib/app-url';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 수집기 상태 크론(매일 10시 KST, vercel.json crons) — 지연/실패를 능동적으로 알린다.
// 회계 홈 카드는 열어봐야 보이고, 수집기 실패 alert 는 로컬 Mac 이 아예 꺼져 있으면 오지 않는다.
// 이 크론은 서버 쪽 기록만으로 '무소식'을 감지하므로 Mac 꺼짐 사각지대까지 잡는다.
// 같은 문제는 하루 한 번만(alert-state) — 인증은 Vercel 크론의 CRON_SECRET Bearer 헤더.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const health = await readIngestHealth();
  const label = new Map(PIPELINES.map((p) => [p.key, p.label]));
  const problems = health
    .map((h) => ({ pipeline: h.pipeline, ...judgeIngest(h), lastSuccessAt: h.lastSuccessAt }))
    // 'none'(도입 직후 기록 없음)은 알리지 않는다 — 첫 수신 전 매일 울리는 오탐 방지
    .filter((p) => p.status === 'late' || p.status === 'failed');

  if (problems.length === 0) return NextResponse.json({ ok: true, alerted: [] });

  // 중복 방지 — 최근에 이미 알린 파이프라인은 제외
  const fresh: typeof problems = [];
  for (const p of problems) {
    if (await shouldAlert(p.pipeline as IngestPipeline)) fresh.push(p);
  }
  if (fresh.length === 0) return NextResponse.json({ ok: true, alerted: [], skipped: '최근 알림 있음' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 설정 필요' }, { status: 500 });
  const supabase = createServiceClient(url, serviceKey);

  const lines = fresh.map((p) => {
    const name = label.get(p.pipeline as IngestPipeline) ?? p.pipeline;
    const state = p.status === 'failed' ? '실패' : '지연';
    return `[${name}] ${state} — ${p.note}`;
  });

  // 수신자: 송금 담당(재무 알림 수신자)과 동일 목록 — 회계 데이터 파이프라인이므로
  const emails = await recipientEmails(supabase, 'transfer');
  await notifyGardenEvent(supabase, {
    emails,
    subject: `[자동 수집 이상] ${lines[0]}${fresh.length > 1 ? ` 외 ${fresh.length - 1}건` : ''}`,
    html: `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
      <p><strong>자동 수집 파이프라인에 이상이 감지됐어요.</strong></p>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      <p>지연은 로컬 Mac이 꺼져 있거나 launchd 가 멈췄을 가능성이 높아요. Mac을 켜고 다음 실행(19시)을 기다리거나,
      Claude에게 "수집기 상태 확인해줘"라고 요청하세요.</p>
      <p><a href="${APP_URL}/dashboard">회계 홈에서 상태 보기 →</a></p>
    </div>`,
    push: {
      title: '자동 수집 이상',
      body: lines.join(' · ').slice(0, 100),
      url: '/dashboard',
    },
  });
  await markAlerted(fresh.map((p) => p.pipeline as IngestPipeline));

  return NextResponse.json({ ok: true, alerted: fresh.map((p) => p.pipeline) });
}
