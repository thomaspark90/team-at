import { describe, expect, it } from 'vitest';
import {
  FLAVORS,
  RATIO_STEPS,
  ROAST_AMPLITUDES,
  THEORY_SOURCES,
  aromaShape,
  concentrationAt,
  cupSummary,
  flavorAt,
} from '@/lib/garden/extraction-theory';

describe('측정값', () => {
  it('Schmieder 적합식이 논문 파라미터대로 계산된다', () => {
    expect(concentrationAt('caffeine', 20)).toBeCloseTo(4.08, 2);
    expect(concentrationAt('trigonelline', 40)).toBeCloseTo(0.56, 2);
    expect(concentrationAt('tds', 40) / 10).toBeCloseTo(2.52, 2); // g/100 g
  });

  it('끊는 지점 요약이 표 2 질량에서 나온다', () => {
    const [one, two, three] = cupSummary();
    expect(one.yieldPct).toBeCloseTo(14.6, 1);
    expect(two.yieldPct).toBeCloseTo(19.4, 1);
    expect(three.yieldPct).toBeCloseTo(21.0, 1);
    expect(two.cupTdsPct).toBeCloseTo(9.7, 1);
    expect(one.caffeineShare).toBeCloseTo(62.3, 1);
    expect(three.caffeineShare).toBe(100);
  });
});

describe('배전도별 모식도', () => {
  it('중배전→중강배전 비율이 콜드브루 근거 배율을 유지한다', () => {
    const { medium: m, mediumDark: d } = ROAST_AMPLITUDES;
    expect(d.acidity / m.acidity).toBeCloseTo(0.86, 1);
    expect(d.bitterFast / m.bitterFast).toBeCloseTo(1.5, 1);
  });

  it('모든 구간에서 눈금 범위 안에 있다', () => {
    for (const roast of ['medium', 'mediumDark', 'dark'] as const) {
      for (const r of RATIO_STEPS) {
        const v = flavorAt(roast, r);
        for (const f of FLAVORS) {
          expect(v[f.key]).toBeGreaterThanOrEqual(0);
          expect(v[f.key]).toBeLessThanOrEqual(1.05);
        }
      }
    }
  });

  it('쓴맛은 후반 상승이 아니라 초반이 더 높다', () => {
    for (const roast of ['medium', 'mediumDark', 'dark'] as const) {
      expect(flavorAt(roast, 0.2).bitterness).toBeGreaterThan(flavorAt(roast, 3).bitterness);
    }
  });

  it('향미는 측정 끝 전후가 끊기지 않고 첫 방울 뒤에 정점이 온다', () => {
    expect(aromaShape(1.84)).toBeCloseTo(aromaShape(1.85), 1);
    expect(aromaShape(0.8)).toBeGreaterThan(aromaShape(0));
    expect(aromaShape(3)).toBeLessThan(aromaShape(0.8));
  });
});

describe('출처', () => {
  it('모든 출처에 링크가 있고 id가 겹치지 않는다', () => {
    expect(new Set(THEORY_SOURCES.map((s) => s.id)).size).toBe(THEORY_SOURCES.length);
    for (const s of THEORY_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
