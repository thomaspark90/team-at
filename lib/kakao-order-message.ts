import type { PurchaseRecord } from '@/lib/types';

// 발주 카톡 문구(순수 함수) — 서버(kakao-notify)와 테스트가 같이 쓴다.
// 단톡방에 올라갈 발주 메시지 — 매입가·재료비 등 내부 원가 정보는 넣지 않는다.
// 매장에서 직접 보내던 대화체 그대로(2026-11-03): 받을 지점을 넣어 로스터리가 배송지를 되묻지 않게 한다.
// 같은 날 같은 방에 이미 발주를 보냈으면(greet: false) 인사말 없이 발주 내용만 적는다(2026-11-27 대표 지시).

const STORE_NAME = { pangyo: '판교점', yangjae: '양재천점' } as const;
const amountOf = (g?: number) => (!g ? '' : g % 1000 === 0 ? `${g / 1000}kg` : `${g}g`);

export function buildOrderMessage(r: Pick<PurchaseRecord, 'store' | 'bean' | 'settings'>, opts: { greet?: boolean } = {}): string {
  const to = r.store ? `${STORE_NAME[r.store]}으로 ` : '';
  const amount = amountOf(r.settings?.capacityG);
  const body = `${to}${r.bean}${amount ? ` ${amount}` : ''} 발주 부탁드립니다.`;
  return opts.greet === false ? body : `대표님 안녕하세요.\n${body}`;
}

// 'YYYY-MM-DD' (KST)
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

type JobLike = { room: string; status: 'pending' | 'sent' | 'failed'; createdAt: string; sentAt?: string; manual?: boolean };

/**
 * 오늘(KST) 이 방에 이미 발주 카톡이 나갔거나 나가려고 대기 중인가 — 그렇다면 다음 발주는 인사말을 뺀다.
 * 실패한 건은 방에 올라가지 않았으니 세지 않고, '직접 발주 완료'(manual)는 카톡으로 보낸 것인지 알 수 없어 세지 않는다.
 * 대기 중인 건을 세는 이유: 전송기가 오래된 것부터 보내므로 그 건이 먼저 인사말과 함께 올라간다.
 */
export function greetedToday(jobs: JobLike[], room: string, nowIso: string): boolean {
  const today = kstDay(nowIso);
  return jobs.some((j) => !j.manual && j.room === room && (j.status === 'sent' || j.status === 'pending') && kstDay(j.sentAt ?? j.createdAt) === today);
}
