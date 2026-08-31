import { describe, it, expect } from 'vitest';
import {
  cannibalHypothesis,
  holidayHypothesis,
  niceWeatherHypothesis,
  productShareHypothesis,
  rainHypothesis,
  seasonHypothesis,
} from '@/lib/finance/hypotheses';
import type { SimpleImpact } from '@/lib/garden/weatherSales';

// 판정(verdict)은 사람이 적지 않고 숫자에서 나온다 — 그 규칙을 고정한다.
const band = (label: string, n: number, pct: number) => ({ label, n, index: 1 + pct / 100, pct });
const imp = (over: Partial<SimpleImpact> = {}): SimpleImpact => ({
  rain: [band('비 안 옴(<1mm)', 44, 0), band('비 1–5mm', 26, 3.1), band('비 5–20mm', 20, 0), band('폭우 20mm+', 11, -14)],
  temp: [band('24–28°', 28, 0.1), band('28–34°', 60, 0.5)],
  calendar: [band('공휴일 당일', 15, -3.1), band('공휴일 전날', 8, -10.2), band('공휴일 다음날', 9, -15)],
  heavyRainLoss: { won: 4_006_674, pctOfTotal: 1.6, days: 11 },
  totalSales: 248_023_510,
  days: 101,
  ...over,
});

describe('rainHypothesis', () => {
  it('잔비 무효과 + 폭우 손실 3% 미만이면 통념이 뒤집힌 것', () => {
    expect(rainHypothesis(imp())!.verdict).toBe('refuted');
  });
  it('폭우 손실이 총매출 5% 이상이면 확인됨', () => {
    const r = rainHypothesis(imp({ heavyRainLoss: { won: 20_000_000, pctOfTotal: 8, days: 11 } }))!;
    expect(r.verdict).toBe('confirmed');
  });
  it('한계에 폭우 표본 일수를 적는다', () => {
    expect(rainHypothesis(imp())!.limit).toContain('11일');
  });
});

describe('niceWeatherHypothesis', () => {
  it('어느 기온대도 +5%p를 못 넘으면 상방 없음', () => {
    expect(niceWeatherHypothesis(imp())!.verdict).toBe('refuted');
  });
  it('+10%p 넘는 구간이 있으면 확인됨 — 단 표본 10일 이상만 본다', () => {
    const withSpike = imp({ temp: [band('18–24°(쾌적)', 44, 16.6), band('24–28°', 37, 2.9)] });
    expect(niceWeatherHypothesis(withSpike)!.verdict).toBe('confirmed');
    const thin = imp({ temp: [band('18–24°(쾌적)', 4, 40), band('24–28°', 37, 2.9)] });
    expect(niceWeatherHypothesis(thin)).toBeNull(); // 쓸 수 있는 밴드가 1개뿐
  });
});

describe('holidayHypothesis', () => {
  it('내려가는 구간이 더 많으면 뒤집힘', () => {
    expect(holidayHypothesis(imp())!.verdict).toBe('refuted');
  });
  it('표본 5일 미만이면 판단 보류', () => {
    const thin = imp({ calendar: [band('공휴일 당일', 5, 0), band('공휴일 전날', 4, 4.8), band('공휴일 다음날', 4, -6.1)] });
    expect(holidayHypothesis(thin)!.verdict).toBe('insufficient');
  });
});

describe('seasonHypothesis', () => {
  it('가장 센 달 ÷ 약한 달이 1.5배 이상이면 확인됨', () => {
    const f = [0.58, 0.74, 1.06, 1.6, 1.2, 1.25, 1.04, null, null, 1.06, 0.68, 0.75];
    const r = seasonHypothesis({ factors: f, monthly: [] })!;
    expect(r.verdict).toBe('confirmed');
    expect(r.numbers.find((n) => n.label === '격차')!.value).toBe('2.8배');
  });
  it('관측된 달이 4개 미만이면 카드를 안 만든다', () => {
    expect(seasonHypothesis({ factors: [1, 1.1, null, null, null, null, null, null, null, null, null, null], monthly: [] })).toBeNull();
  });
});

describe('productShareHypothesis · cannibalHypothesis', () => {
  it('비중 15% 이상이면 확인됨, 매장 매출이 함께 오르면 순증으로 읽는다', () => {
    const r = productShareHypothesis({
      product: '브런치바', ym: '2026-08', productGross: 19_892_398, totalGross: 83_379_117,
      storeDailyBefore: 2_100_000, storeDailyAfter: 3_000_000,
    })!;
    expect(r.verdict).toBe('confirmed');
    expect(r.rule).toContain('순증');
  });
  it('잔수는 줄고 매출은 늘면 반반(잠식이되 이득)', () => {
    const r = cannibalHypothesis({ product: '브런치바', cupsBefore: 200, cupsAfter: 170, salesBefore: 2_000_000, salesAfter: 2_800_000 })!;
    expect(r.verdict).toBe('mixed');
    expect(r.rule).toContain('원두 발주');
  });
  it('잔수가 안 줄면 뒤집힘', () => {
    expect(cannibalHypothesis({ product: '브런치바', cupsBefore: 200, cupsAfter: 210, salesBefore: 2_000_000, salesAfter: 2_800_000 })!.verdict).toBe('refuted');
  });
});
