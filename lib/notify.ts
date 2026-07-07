// 송금 요청 알림 — 이메일(Resend) + 웹 푸시. 실패해도 요청 등록은 막지 않는다(전부 무시).
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OWNER_EMAIL } from '@/lib/finance/access';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

export interface TransferNotice {
  vendorName: string;
  amount: number;
  requesterEmail: string;
  bank: string | null;
  accountNo: string | null;
  accountHolder: string | null;
  itemsSummary: string | null;
}

// env 폴백 수신자 — notify_recipients 테이블이 비었거나 없을 때만 사용
export const fallbackRecipients = () =>
  (process.env.NOTIFY_EMAIL ?? OWNER_EMAIL)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// 수신자 목록 — admin이 송금 관리 화면에서 지정(finance.notify_recipients). 비면 env/대표 폴백.
export async function recipientEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.schema('finance').from('notify_recipients').select('email');
  const fromDb = (data ?? []).map((r) => String(r.email).trim().toLowerCase()).filter(Boolean);
  return fromDb.length > 0 ? fromDb : fallbackRecipients();
}

async function sendEmail(supabase: SupabaseClient, n: TransferNotice) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // 키 없으면 조용히 스킵

  // 이메일 알림을 끈 수신자는 제외 (설정 행 없으면 기본 켜짐)
  const to = await recipientEmails(supabase);
  const { data: prefs } = await supabase
    .schema('finance')
    .from('notify_prefs')
    .select('email,email_enabled')
    .in('email', to);
  const off = new Set(
    (prefs ?? []).filter((p) => !p.email_enabled).map((p) => String(p.email).toLowerCase())
  );
  const finalTo = to.filter((e) => !off.has(e.toLowerCase()));
  if (finalTo.length === 0) return;

  const account = [n.bank, n.accountNo, n.accountHolder && `(${n.accountHolder})`]
    .filter(Boolean)
    .join(' ');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'team at <goodday@our-hour.me>', // Resend에 our-hour.me 도메인 검증돼 있음(ourhour-contract와 같은 계정)
      to: finalTo,
      subject: `[송금 요청] ${n.vendorName} ${won(n.amount)}`,
      html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${n.vendorName}</strong> — <strong>${won(n.amount)}</strong></p>
          <p>계좌: ${account || '미확인 (거래처에 확인 필요)'}</p>
          ${n.itemsSummary ? `<p>품목: ${n.itemsSummary}</p>` : ''}
          <p>요청: ${n.requesterEmail}</p>
          <p><a href="https://team-at-apps.vercel.app/studio">송금 대시보드 열기 →</a></p>
        </div>`,
    }),
  });
}

async function sendPush(supabase: SupabaseClient, n: TransferNotice) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails(`mailto:${OWNER_EMAIL}`, pub, priv);

  const { data: subs } = await supabase
    .schema('finance')
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .in('email', await recipientEmails(supabase));
  if (!subs?.length) return;

  const payload = JSON.stringify({
    title: `송금 요청 · ${n.vendorName}`,
    body: `${won(n.amount)} — ${n.requesterEmail.split('@')[0]} 등록`,
    url: '/studio',
  });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (e) {
        // 410 Gone/404 = 구독 만료 → 정리
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await supabase.schema('finance').from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    })
  );
}

// 등록 API 에서 호출 — 어떤 실패도 등록 자체를 막지 않음
export async function notifyTransferRequest(supabase: SupabaseClient, n: TransferNotice) {
  const results = await Promise.allSettled([sendEmail(supabase, n), sendPush(supabase, n)]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('transfer notify 실패:', r.reason);
  }
}
