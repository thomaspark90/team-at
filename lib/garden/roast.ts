import type { PurchaseRecord } from '@/lib/types';
import { daysSince } from '@/lib/types';

// 로스팅일 기준 경과일(D+) — 2026-11-03 대표 결정.
// 원두 경과일은 레시피 등록일이 아니라 로스팅일로 센다. 로스팅일이 아직 기재되지 않았으면
// 발주일 +1일로 추정한다(발주 후 0~2일 안에 로스팅되는 게 보통). 추정값은 저장하지 않고 표시할 때만 계산 —
// [수령]으로 실제 날짜를 넣으면 그 값이 우선.

export type RoastInfo = { date: string; estimated: boolean; days: number };

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// createdAt(ISO, UTC) → KST 날짜
const kstYmd = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function roastInfo(p: Pick<PurchaseRecord, 'roastDate' | 'orderDate' | 'createdAt'> | undefined | null): RoastInfo | null {
  if (!p) return null;
  if (p.roastDate) return { date: p.roastDate, estimated: false, days: daysSince(p.roastDate) };
  const order = p.orderDate ?? (p.createdAt ? kstYmd(p.createdAt) : null);
  if (!order) return null;
  const date = addDays(order, 1);
  // 추정 로스팅일이 미래(발주 당일)면 D+0 으로 본다
  return { date, estimated: true, days: daysSince(date) };
}

// 숙성 단계 — 7일 미만 숙성 중 · 7~21일 적기 · 22~30일 지남 · 31일~ 오래됨 (판매는 막지 않고 경고만)
export type RestStage = 'resting' | 'peak' | 'late' | 'old';
export const REST_START = 7;
export function restStage(days: number): RestStage {
  if (days < REST_START) return 'resting';
  if (days <= 21) return 'peak';
  if (days <= 30) return 'late';
  return 'old';
}

// 디자인 시스템 상태색(emerald·amber·destructive) 매핑
export const restClass: Record<RestStage, string> = {
  resting: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  peak: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  late: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  old: 'bg-destructive/10 text-destructive',
};

export const restTitle = (r: RoastInfo) =>
  `로스팅 ${r.date}${r.estimated ? ' (추정: 발주일+1, [수령]으로 실제 날짜 입력)' : ''} · ${
    restStage(r.days) === 'resting' ? `디게싱 중 — D+${REST_START}부터 권장` : restStage(r.days) === 'peak' ? '적기' : '시간 지남'
  }`;
