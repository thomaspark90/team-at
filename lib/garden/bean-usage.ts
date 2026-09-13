import { KR_HOLIDAYS } from '@/lib/garden/krHolidays';
import { beanOf, type Bean, type ItemRow } from '@/lib/garden/menu-sales';

// 원두 일 사용량(발주 참고) — finance.pos_items 의 에스프레소 메뉴 잔수로 산출(2026-09-13 대표 지시).
// 산식: kg/일 = (판매 잔수 + 샷추가 잔수) × 1샷 20g × (1 + 로스 10%) ÷ 1,000
//   · 1잔 = 1샷(20g), 샷추가 옵션 = +1샷. 연하게는 같은 도즈로 본다.
//   · 브루잉(드립)은 별도 봉지라 제외. 원두 구분은 옵션 문자열(스테이/라이트/디카페인, menu-sales.beanOf).
//   · 창: 지점의 마지막 판매일 기준 최근 28일. 매출 행이 없는 날(휴무)은 일수에서 뺀다.
//   · 주말 = 토·일·공휴일(krHolidays), 주중 = 나머지 영업일.
// 판교는 옵션에 원두명이 없어 자동으로 빠진다(잔수 0 → 지점 생략).

export const BEAN_USAGE_DOSE_G = 20;
export const BEAN_USAGE_LOSS_RATE = 0.1;
export const BEAN_USAGE_WINDOW_DAYS = 28;

export interface UsageStat {
  days: number; // 집계 영업일 수
  shotsPerDay: number; // 일평균 샷수(샷추가 포함)
  kgPerDay: number; // 로스 포함 kg/일
  minKg: number;
  maxKg: number;
}

export interface BeanUsage {
  bean: Bean;
  weekday: UsageStat;
  weekend: UsageStat;
  overall: UsageStat;
}

export interface StoreBeanUsage {
  store: string;
  from: string; // YYYY-MM-DD
  to: string;
  doseG: number;
  lossRate: number;
  beans: BeanUsage[];
}

const BEAN_ORDER: Bean[] = ['스테이(메인)', '라이트(시즈널)', '디카페인'];

const addDays = (ymd: string, n: number): string =>
  new Date(new Date(ymd + 'T00:00:00Z').getTime() + n * 86_400_000).toISOString().slice(0, 10);

const isWeekendOrHoliday = (ymd: string): boolean => {
  const dow = new Date(ymd + 'T00:00:00Z').getUTCDay();
  return dow === 0 || dow === 6 || KR_HOLIDAYS.has(ymd);
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function statOf(shotsByDay: number[], doseG: number, lossRate: number): UsageStat {
  if (shotsByDay.length === 0) return { days: 0, shotsPerDay: 0, kgPerDay: 0, minKg: 0, maxKg: 0 };
  const toKg = (shots: number) => (shots * doseG * (1 + lossRate)) / 1000;
  const avg = shotsByDay.reduce((s, v) => s + v, 0) / shotsByDay.length;
  return {
    days: shotsByDay.length,
    shotsPerDay: Math.round(avg * 10) / 10,
    kgPerDay: round2(toKg(avg)),
    minKg: round2(toKg(Math.min(...shotsByDay))),
    maxKg: round2(toKg(Math.max(...shotsByDay))),
  };
}

/** 지점별 원두 일 사용량 — 잔수가 있는 지점만 돌려준다. */
export function computeBeanUsage(
  rows: ItemRow[],
  opts: { doseG?: number; lossRate?: number; windowDays?: number } = {},
): StoreBeanUsage[] {
  const doseG = opts.doseG ?? BEAN_USAGE_DOSE_G;
  const lossRate = opts.lossRate ?? BEAN_USAGE_LOSS_RATE;
  const windowDays = opts.windowDays ?? BEAN_USAGE_WINDOW_DAYS;

  // 지점별 마지막 판매일(업로드 지연이 있어 오늘이 아니라 데이터 기준)
  const lastByStore = new Map<string, string>();
  for (const r of rows) {
    const store = r.store ?? '';
    if (!store) continue;
    const cur = lastByStore.get(store);
    if (!cur || r.sale_date > cur) lastByStore.set(store, r.sale_date);
  }

  const out: StoreBeanUsage[] = [];
  for (const [store, to] of Array.from(lastByStore)) {
    const from = addDays(to, -(windowDays - 1));
    const openDays = new Set<string>();
    // 날짜 → 원두 → 샷수
    const shots = new Map<string, Map<Bean, number>>();
    for (const r of rows) {
      if ((r.store ?? '') !== store || r.sale_date < from || r.sale_date > to) continue;
      openDays.add(r.sale_date);
      if (r.category !== 'COFFEE' || r.product.startsWith('브루잉')) continue;
      const bean = beanOf(r.option);
      if (bean === '기타') continue;
      const qty = Number(r.qty) || 0;
      const n = qty * (r.option.includes('샷추가') ? 2 : 1);
      const day = shots.get(r.sale_date) ?? new Map<Bean, number>();
      day.set(bean, (day.get(bean) ?? 0) + n);
      shots.set(r.sale_date, day);
    }

    const beans: BeanUsage[] = [];
    for (const bean of BEAN_ORDER) {
      const weekday: number[] = [];
      const weekend: number[] = [];
      for (const d of Array.from(openDays)) {
        const v = shots.get(d)?.get(bean) ?? 0;
        (isWeekendOrHoliday(d) ? weekend : weekday).push(v);
      }
      const all = [...weekday, ...weekend];
      if (all.reduce((s, v) => s + v, 0) === 0) continue;
      beans.push({
        bean,
        weekday: statOf(weekday, doseG, lossRate),
        weekend: statOf(weekend, doseG, lossRate),
        overall: statOf(all, doseG, lossRate),
      });
    }
    if (beans.length === 0) continue;
    out.push({ store, from, to, doseG, lossRate, beans });
  }
  return out;
}
