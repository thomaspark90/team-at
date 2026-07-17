// 송금 요청 알림 — 이메일(Resend) + 웹 푸시. 실패해도 요청 등록/처리는 막지 않는다(전부 무시).
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OWNER_EMAIL } from '@/lib/finance/access';

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const APP_URL = 'https://team-at-apps.vercel.app/dashboard/transfer';

export interface TransferNotice {
  brandLabel?: string; // 스탭밀 | 가든서비스 — 구분 도입 전 호출부 호환 위해 선택
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

export type NotifyTopic = 'transfer' | 'stock';

// 수신자 목록 — admin이 송금 관리 화면에서 지정(finance.notify_recipients), 종류(송금/원두)별 토글.
// 테이블이 아예 비면 env/대표 폴백. 등록은 있는데 해당 종류가 전부 꺼져 있으면 빈 목록(의도 존중).
export async function recipientEmails(
  supabase: SupabaseClient,
  topic: NotifyTopic = 'transfer'
): Promise<string[]> {
  const { data } = await supabase.schema('finance').from('notify_recipients').select('*');
  const rows = data ?? [];
  if (rows.length === 0) return fallbackRecipients();
  const col = topic === 'stock' ? 'stock_enabled' : 'transfer_enabled';
  return rows
    .filter((r) => (r as Record<string, unknown>)[col] ?? true) // 컬럼 없는 구 스키마 = 전부 수신
    .map((r) => String(r.email).trim().toLowerCase())
    .filter(Boolean);
}

// 이메일 알림을 끈 사용자 제외 (notify_prefs 행 없으면 기본 켜짐)
async function filterEmailEnabled(supabase: SupabaseClient, emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const { data: prefs } = await supabase
    .schema('finance')
    .from('notify_prefs')
    .select('email,email_enabled')
    .in('email', emails);
  const off = new Set(
    (prefs ?? []).filter((p) => !p.email_enabled).map((p) => String(p.email).toLowerCase())
  );
  return emails.filter((e) => !off.has(e.toLowerCase()));
}

async function sendEmailTo(supabase: SupabaseClient, to: string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // 키 없으면 조용히 스킵
  const finalTo = await filterEmailEnabled(supabase, to);
  if (finalTo.length === 0) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'team at <goodday@our-hour.me>', // Resend에 our-hour.me 도메인 검증돼 있음(ourhour-contract와 같은 계정)
      to: finalTo,
      subject,
      html,
    }),
  });
}

async function sendPushTo(
  supabase: SupabaseClient,
  emails: string[],
  payload: { title: string; body: string; url: string }
) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || emails.length === 0) return;
  webpush.setVapidDetails(`mailto:${OWNER_EMAIL}`, pub, priv);

  const { data: subs } = await supabase
    .schema('finance')
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .in('email', emails);
  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
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

// 원두 재고 임계 도달(20%/0%) → 지정 수신자에게 이메일+웹푸시. garden-beans API에서 호출.
// 송금 알림과 같은 수신자 목록(notify_recipients)·푸시 구독을 재사용한다.
export async function notifyBeanStockLow(
  supabase: SupabaseClient,
  n: { bean: string; alerts: { storeLabel: string; level: number }[]; byEmail: string }
) {
  if (n.alerts.length === 0) return;
  const line = n.alerts
    .map((a) => `${a.storeLabel} ${a.level === 0 ? '소진(0%)' : `재고 ${a.level}%`}`)
    .join(' · ');
  const by = n.byEmail ? n.byEmail.split('@')[0] : '';
  const gardenUrl = 'https://team-at-apps.vercel.app/garden';
  const recipientsP = recipientEmails(supabase, 'stock');
  const results = await Promise.allSettled([
    recipientsP.then((to) =>
      sendEmailTo(
        supabase,
        to,
        `[원두 재고] ${n.bean} — ${line}`,
        `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${n.bean}</strong></p>
          <p>${line}</p>
          <p>${
            n.alerts.some((a) => a.level === 0)
              ? '소진 지점은 대시보드에서 빠지고 필터 레시피에서만 보여요. 재발주를 검토해 주세요.'
              : '재고가 얼마 남지 않았어요. 재발주를 검토해 주세요.'
          }</p>
          ${by ? `<p>업데이트: ${by}</p>` : ''}
          <p><a href="${gardenUrl}">가든 대시보드 열기 →</a></p>
        </div>`
      )
    ),
    recipientsP.then((to) =>
      sendPushTo(supabase, to, {
        title: `원두 재고 · ${n.bean}`,
        body: `${line}${by ? ` — ${by} 업데이트` : ''}`,
        url: '/garden',
      })
    ),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('stock notify 실패:', r.reason);
  }
}

// 새 송금 요청 → 담당자(수신자 목록)에게. 등록 API 에서 호출 — 어떤 실패도 등록을 막지 않음.
export async function notifyTransferRequest(supabase: SupabaseClient, n: TransferNotice) {
  const account = [n.bank, n.accountNo, n.accountHolder && `(${n.accountHolder})`]
    .filter(Boolean)
    .join(' ');
  const recipientsP = recipientEmails(supabase);
  const results = await Promise.allSettled([
    recipientsP.then((to) =>
      sendEmailTo(
        supabase,
        to,
        `[송금 요청${n.brandLabel ? ` · ${n.brandLabel}` : ''}] ${n.vendorName} ${won(n.amount)}`,
        `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${n.vendorName}</strong> — <strong>${won(n.amount)}</strong></p>
          ${n.brandLabel ? `<p>브랜드: ${n.brandLabel}</p>` : ''}
          <p>계좌: ${account || '미확인 (거래처에 확인 필요)'}</p>
          ${n.itemsSummary ? `<p>품목: ${n.itemsSummary}</p>` : ''}
          <p>요청: ${n.requesterEmail}</p>
          <p><a href="${APP_URL}">송금 대시보드 열기 →</a></p>
        </div>`
      )
    ),
    recipientsP.then((to) =>
      sendPushTo(supabase, to, {
        title: `송금 요청 · ${n.vendorName}`,
        body: `${n.brandLabel ? `[${n.brandLabel}] ` : ''}${won(n.amount)} — ${n.requesterEmail.split('@')[0]} 등록`,
        url: '/dashboard/transfer',
      })
    ),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('transfer notify 실패:', r.reason);
  }
}

// 이체 완료 → 요청한 직원에게 역방향 알림. 본인이 완료 처리한 건 스킵.
export async function notifyTransferDone(
  supabase: SupabaseClient,
  n: { vendorName: string; amount: number; requesterEmail: string; doneByEmail: string }
) {
  const requester = n.requesterEmail.trim().toLowerCase();
  if (!requester || requester === n.doneByEmail.trim().toLowerCase()) return;
  const doneBy = n.doneByEmail.split('@')[0];
  const results = await Promise.allSettled([
    sendEmailTo(
      supabase,
      [requester],
      `[이체 완료] ${n.vendorName} ${won(n.amount)}`,
      `
      <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
        <p>요청하신 송금이 이체 완료됐어요.</p>
        <p><strong>${n.vendorName}</strong> — <strong>${won(n.amount)}</strong></p>
        <p>처리: ${doneBy}</p>
        <p><a href="${APP_URL}">송금 대시보드 열기 →</a></p>
      </div>`
    ),
    sendPushTo(supabase, [requester], {
      title: `이체 완료 · ${n.vendorName}`,
      body: `${won(n.amount)} — ${doneBy}님이 이체했어요`,
      url: '/dashboard/transfer',
    }),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.error('transfer done notify 실패:', r.reason);
  }
}
