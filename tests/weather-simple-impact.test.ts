import { describe, it, expect } from 'vitest';
import { simpleImpact, type DayPoint } from '@/lib/garden/weatherSales';

// 지수 = 그날 매출 ÷ (같은 달·같은 요일 중앙값). 계절·요일·성장이 자동으로 빠지는 게 핵심.
const noHoliday = () => false;

// 2026-06-01(월) 부터 n일
const mk = (i: number, sales: number, rain = 0, tmax = 25): DayPoint => ({
  date: new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10),
  rain,
  tmax,
  sales,
});

describe('simpleImpact', () => {
  it('요일·계절이 빠진다 — 요일마다 매출이 달라도 지수는 1', () => {
    // 요일별 기본 매출이 100~700으로 다르지만 4주 반복 → 전부 지수 1.0
    const days = Array.from({ length: 28 }, (_, i) => mk(i, ((i % 7) + 1) * 100));
    const r = simpleImpact(days, noHoliday)!;
    const dry = r.rain.find((b) => b.label === '비 안 옴(<1mm)')!;
    expect(dry.n).toBe(28);
    expect(dry.index).toBeCloseTo(1, 2);
  });

  it('폭우일만 절반으로 떨어뜨리면 그 밴드만 0.5, 손실은 빠진 금액과 같다', () => {
    // 5주 중 목요일 한 번만 폭우 — 그래야 그 요일의 '평소'(중앙값)가 멀쩡한 날로 잡힌다
    const days = Array.from({ length: 35 }, (_, i) => {
      const heavy = i === 3;
      return mk(i, heavy ? 500 : 1000, heavy ? 30 : 0);
    });
    const r = simpleImpact(days, noHoliday)!;
    expect(r.rain.find((b) => b.label === '폭우 20mm+')).toBeUndefined(); // 1일이라 밴드는 안 나옴
    expect(r.heavyRainLoss.days).toBe(1);
    expect(r.heavyRainLoss.won).toBe(500); // 평소 1,000 − 실제 500
  });

  it('한 요일에 조건이 몰리면 지수가 효과를 흡수한다 (방법의 한계 — 고정해 둔다)', () => {
    // 목요일이 전부 폭우면 그 요일의 중앙값 자체가 낮아져 지수가 1로 나온다.
    // 그래서 밴드 지수는 '같은 달·같은 요일에 비교 대상이 있을 때만' 의미가 있다.
    const days = Array.from({ length: 28 }, (_, i) => {
      const heavy = i % 7 === 3;
      return mk(i, heavy ? 500 : 1000, heavy ? 30 : 0);
    });
    const r = simpleImpact(days, noHoliday)!;
    expect(r.rain.find((b) => b.label === '폭우 20mm+')!.index).toBeCloseTo(1, 2);
    expect(r.heavyRainLoss.won).toBe(0);
  });

  it('관측 3일 미만 밴드는 숫자를 내놓지 않는다', () => {
    const days = Array.from({ length: 28 }, (_, i) => mk(i, 1000, i === 0 ? 30 : 0));
    const r = simpleImpact(days, noHoliday)!;
    expect(r.rain.find((b) => b.label === '폭우 20mm+')).toBeUndefined();
  });

  it('표본이 20일 미만이면 null', () => {
    expect(simpleImpact(Array.from({ length: 10 }, (_, i) => mk(i, 1000)), noHoliday)).toBeNull();
  });
});

describe('simpleImpact — 이상치', () => {
  it('밴드 대표값은 중앙값 — 하루가 밴드를 만들지 못한다', () => {
    // 35일 중 5일만 조건(각기 다른 요일), 그중 하루만 매출 4배. 평균이면 +60%대가 되지만
    // 중앙값이면 평소(0%)로 남아야 한다.
    const days = Array.from({ length: 35 }, (_, i) => {
      const flagged = i < 5;
      const spike = i === 0;
      return mk(i, spike ? 4000 : 1000, flagged ? 3 : 0); // 비 1–5mm 밴드로 태깅
    });
    const r = simpleImpact(days, noHoliday)!;
    const b = r.rain.find((x) => x.label === '비 1–5mm')!;
    expect(b.n).toBe(5);
    expect(b.pct).toBe(0); // 중앙값 = 1.00
  });
});
