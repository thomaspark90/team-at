import { NextResponse } from 'next/server';
import { fallbackRecipients } from '@/lib/notify';

export const runtime = 'nodejs';

// 네이버페이 무인 수집기 실패 알림 — 수집기(로컬 Mac)가 실패 시 호출하면
// Resend 로 대표(NOTIFY_EMAIL 폴백 수신자)에게 이메일을 보낸다.
export async function POST(req: Request) {
  const token = process.env.NAVERPAY_INGEST_TOKEN;
  if (!token) return NextResponse.json({ error: 'NAVERPAY_INGEST_TOKEN 설정 필요' }, { status: 500 });
  if (req.headers.get('x-naverpay-token') !== token) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  let reason = '알 수 없는 오류';
  let detail = '';
  try {
    const body = await req.json();
    if (body?.reason) reason = String(body.reason).slice(0, 200);
    if (body?.detail) detail = String(body.detail).slice(0, 500);
  } catch { /* 본문 없이도 발송 */ }

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ emailed: 0, skipped: 'RESEND_API_KEY 없음' });

  const to = fallbackRecipients();
  const isSession = /세션/.test(reason);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'team at <goodday@our-hour.me>',
      to,
      subject: `[네이버페이 수집 실패] ${reason}`,
      html: `
      <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
        <p>오늘 네이버페이 지출 자동 수집이 실패했어요.</p>
        <p><strong>사유:</strong> ${reason}</p>
        ${detail ? `<p style="color:#666">${detail}</p>` : ''}
        ${isSession ? `
        <p><strong>복구 방법 (약 30초):</strong></p>
        <ol>
          <li>브라우저에서 <a href="https://pay.naver.com/pc/history">네이버페이 결제내역</a> 접속(로그인)</li>
          <li>개발자도구(⌥⌘I) → Network → 아무 요청 우클릭 → Copy → <strong>Copy as cURL</strong></li>
          <li>Mac의 <code>~/Projects/naverpay-export/쿠키갱신.command</code> 더블클릭</li>
        </ol>
        <p>복구하면 놓친 기간까지 자동으로 따라잡아요.</p>` : `
        <p>반복되면 Claude에게 "네이버페이 수집 실패 확인해줘"라고 요청하세요. (로그: ~/Projects/naverpay-export/out/sync.log)</p>`}
      </div>`,
    }),
  });

  return NextResponse.json({ emailed: res.ok ? to.length : 0, ok: res.ok });
}
