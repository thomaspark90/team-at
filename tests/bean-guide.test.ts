import { describe, expect, it } from 'vitest';
import { COUNTRY_SUMMARIES, rowsForCountry } from '@/lib/garden/bean-guide/countries';
import { ALTITUDE_FINDINGS, ALTITUDE_MEASURES, MYTH_CHECKS, QUALITY_FACTORS } from '@/lib/garden/bean-guide/factors';
import { FARMS, FARMS_BY_COUNTRY } from '@/lib/garden/bean-guide/farms';
import { MENU_NAMES, NAME_TERMS } from '@/lib/garden/bean-guide/names';
import { ORIGIN_GROUPS } from '@/lib/garden/bean-guide/origins';
import { PROCESS_GROUPS, PROCESS_RULES } from '@/lib/garden/bean-guide/processes';
import { BEAN_SOURCES } from '@/lib/garden/bean-guide/sources';

const cited = [
  ...ORIGIN_GROUPS.flatMap((g) => g.rows.flatMap((r) => r.src)),
  ...FARMS.flatMap((f) => f.src),
  ...MENU_NAMES.flatMap((n) => n.src),
  ...NAME_TERMS.flatMap((t) => t.src),
  ...ALTITUDE_FINDINGS.flatMap((f) => f.src),
  ...ALTITUDE_MEASURES.flatMap((m) => m.src),
  ...QUALITY_FACTORS.flatMap((f) => f.src),
  ...MYTH_CHECKS.flatMap((m) => m.src),
  ...PROCESS_GROUPS.flatMap((g) => g.items.flatMap((p) => p.src)),
  ...PROCESS_RULES.flatMap((r) => r.src),
  'wcr-bourbon', // 위도 표
  'pdg-honey', // Honey 색 구분 표
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
  it('모든 산지가 정확히 한 국가에 속한다', () => {
    for (const g of ORIGIN_GROUPS) {
      const countries = COUNTRY_SUMMARIES[g.key];
      for (const r of g.rows) {
        expect([r.name, countries.filter((c) => rowsForCountry(g.key, c).includes(r)).length]).toEqual([r.name, 1]);
      }
      for (const c of countries) expect([c.country, rowsForCountry(g.key, c).length > 0]).toEqual([c.country, true]);
    }
  });

  it('모든 농장이 국가 목록에 한 번씩 들어간다', () => {
    expect(FARMS_BY_COUNTRY.flatMap((c) => c.farms)).toHaveLength(FARMS.length);
    for (const c of FARMS_BY_COUNTRY) expect([c.country, c.farms.length >= 2]).toEqual([c.country, true]);
  });

  it('우리 메뉴 10종을 모두 해독한다', () => {
    expect(MENU_NAMES).toHaveLength(10);
    for (const n of MENU_NAMES) expect(n.menu.startsWith(n.country)).toBe(true);
  });
});
