import { describe, expect, it } from 'vitest';
import { ALTITUDE_FINDINGS, MYTH_CHECKS, QUALITY_FACTORS } from '@/lib/garden/bean-guide/factors';
import { BOP_RECORDS, FARMS } from '@/lib/garden/bean-guide/farms';
import { MENU_NAMES, NAME_TERMS } from '@/lib/garden/bean-guide/names';
import { ORIGIN_GROUPS } from '@/lib/garden/bean-guide/origins';
import { BEAN_SOURCES } from '@/lib/garden/bean-guide/sources';

const cited = [
  ...ORIGIN_GROUPS.flatMap((g) => g.rows.flatMap((r) => r.src)),
  ...FARMS.flatMap((f) => f.src),
  ...BOP_RECORDS.map((r) => r.src),
  ...MENU_NAMES.flatMap((n) => n.src),
  ...NAME_TERMS.flatMap((t) => t.src),
  ...ALTITUDE_FINDINGS.flatMap((f) => f.src),
  ...QUALITY_FACTORS.flatMap((f) => f.src),
  ...MYTH_CHECKS.flatMap((m) => m.src),
  'wcr-bourbon', // 위도 표
];

describe('원두에 대한 이해 출처', () => {
  const ids = BEAN_SOURCES.map((s) => s.id);

  it('id 가 겹치지 않고 모두 https 링크다', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of BEAN_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });

  it('인용한 출처는 모두 목록에 있다', () => {
    expect(cited.filter((id) => !ids.includes(id))).toEqual([]);
  });

  it('목록의 출처는 모두 본문에서 인용한다', () => {
    expect(ids.filter((id) => !cited.includes(id))).toEqual([]);
  });
});

describe('원두에 대한 이해 데이터', () => {
  it('Best of Panama 파운드 값을 kg 로 환산한다', () => {
    for (const r of BOP_RECORDS) {
      const lb = r.original.match(/USD ([\d,.]+)\/lb/);
      if (lb) expect(r.usdPerKg).toBeCloseTo(Number(lb[1].replace(/,/g, '')) * 2.2046, -1);
    }
  });

  it('우리 메뉴 10종을 모두 해독한다', () => {
    expect(MENU_NAMES).toHaveLength(10);
    for (const n of MENU_NAMES) expect(n.menu.startsWith(n.country)).toBe(true);
  });
});
