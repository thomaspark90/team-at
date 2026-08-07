import { NextResponse } from 'next/server';
import { fallbackRecipients } from '@/lib/notify';
import { recordIngestFailure } from '@/lib/ingest-health';

export const runtime = 'nodejs';

// 리뷰 무인 수집기 실패 알림 — 쿠팡/네이버페이 alert 와 동일 패턴.
// 지금까지 리뷰 수집기는 실패해도 보고 채널이 없었다(로그 파일뿐) — 이 라우트가 그 구멍을 메운다.
export async function POST(req: Request) {
  const token = process.env.REVIEW_INGEST_TOKEN;
  if (!token) return NextResponse.json({ error: 'REVIEW_INGEST_TOKEN 설정 필요' }, { status: 500 });
  if (req.headers.get('x-review-token') !== token) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  let reason = '알 수 없는 오류';
  let detail = '';
  try {
    const body = await req.json();
    if (body?.reason) reason = String(body.reason).slice(0, 200);
    if (body?.detail) detail = String(body.detail).slice(0, 500);
  } catch { /* 본문 없이도 발송 */ }

  await recordIngestFailure('reviews', reason); // 회계 홈 상태 카드에 실패로 표시

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ emailed: 0, skipped: 'RESEND_API_KEY 없음' });

  const to = fallbackRecipients();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'team at <goodday@our-hour.me>',
      to,
      subject: `[리뷰 수집 실패] ${reason}`,
      html: `
      <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
        <p>네이버 스마트플레이스 리뷰 자동 수집이 실패했어요.</p>
        <p><strong>사유:</strong> ${reason}</p>
        ${detail ? `<p style="color:#666">${detail}</p>` : ''}
        <p>반복되면 Claude에게 "리뷰 수집 실패 확인해줘"라고 요청하세요. (로그: ~/Projects/naver-review-manager/out/sync.log)</p>
      </div>`,
    }),
  });

  return NextResponse.json({ emailed: res.ok ? to.length : 0, ok: res.ok });
}
