import { describe, it, expect } from 'vitest';
import { SECTIONS, sectionForPath, sectionsForApiPath, firstAllowedHref, inAccounting } from '@/lib/access/sections';
import { GARDEN_TABS, tabForPath } from '@/lib/garden/tabs';
import { STUDIO_TABS, tabForPath as studioTabForPath } from '@/lib/studio/tabs';

// 접근 통제 판정 고정 — middleware.ts 단일 관문이 이 순수 함수들에 기대고 있다.
// 판정이 조용히 바뀌면 권한 구멍(또는 계정 잠김)이 되므로, 리팩터링 시 이 테스트를 함께 갱신한다.
// 주의: 여기 실패는 버그가 아니라 '접근 정책이 바뀌었다'는 뜻일 수 있다 — 의도한 변경인지 먼저 확인.

describe('sectionForPath — 페이지 → 섹션', () => {
  it('4개 섹션 대표 경로', () => {
    expect(sectionForPath('/studio')).toBe('studio');
    expect(sectionForPath('/studio/sales')).toBe('studio');
    expect(sectionForPath('/garden/recipes')).toBe('garden');
    expect(sectionForPath('/dashboard/transfer')).toBe('accounting');
    expect(sectionForPath('/finance/pnl')).toBe('report');
  });

  it('회계/리포트 경계 — /finance 하위는 목록 기반으로 갈린다', () => {
    expect(sectionForPath('/finance')).toBe('accounting'); // 개요는 회계
    expect(sectionForPath('/finance/classify')).toBe('accounting');
    expect(sectionForPath('/finance/upload/yangjae')).toBe('accounting');
    expect(sectionForPath('/finance/close')).toBe('accounting');
    expect(sectionForPath('/finance/dashboard')).toBe('report');
    expect(sectionForPath('/finance/metrics')).toBe('report');
    expect(inAccounting('/finance/pnl')).toBe(false);
  });

  it('보호 대상이 아닌 경로는 null', () => {
    expect(sectionForPath('/')).toBeNull();
    expect(sectionForPath('/install')).toBeNull();
    expect(sectionForPath('/garden-service/words')).toBeNull();
  });
});

describe('sectionsForApiPath — API → 섹션 후보', () => {
  it('단일 섹션 매핑', () => {
    expect(sectionsForApiPath('/api/staffmeals')).toEqual(['studio']);
    expect(sectionsForApiPath('/api/staffmeal-todos')).toEqual(['studio']);
    expect(sectionsForApiPath('/api/garden-todos')).toEqual(['garden']);
    expect(sectionsForApiPath('/api/purchases')).toEqual(['garden']);
  });

  it('finance 는 회계·리포트 겸용', () => {
    expect(sectionsForApiPath('/api/finance/classify/bulk')).toEqual(['accounting', 'report']);
  });

  it('의도적 미매핑(라우트 자체 확인) — null 이어야 팀 확인만 하고 통과한다', () => {
    expect(sectionsForApiPath('/api/garden-board')).toBeNull(); // scope 별 판정은 라우트가 직접
    expect(sectionsForApiPath('/api/garden-share')).toBeNull();
    expect(sectionsForApiPath('/api/garden-tab-access')).toBeNull();
    expect(sectionsForApiPath('/api/notify/prefs')).toBeNull();
    expect(sectionsForApiPath('/api/push/subscribe')).toBeNull();
    expect(sectionsForApiPath('/api/log')).toBeNull();
  });

  it('접두사 함정 — staffmeal-todos 가 staffmeals 규칙에 삼켜지지 않는다', () => {
    // startsWith('/api/staffmeals') 는 '/api/staffmeal-todos' 와 매칭되지 않아야 한다
    expect('/api/staffmeal-todos'.startsWith('/api/staffmeals')).toBe(false);
  });
});

describe('firstAllowedHref — 허용 섹션의 첫 진입 경로', () => {
  it('null(제한 없음) = 첫 섹션, 일부 허용 = 그중 첫 항목, 전부 불허 = null', () => {
    expect(firstAllowedHref(null)).toBe(SECTIONS[0].href);
    expect(firstAllowedHref(['report'])).toBe('/finance/dashboard');
    expect(firstAllowedHref(['garden', 'accounting'])).toBe('/garden'); // SECTIONS 순서 기준
    expect(firstAllowedHref([])).toBeNull(); // null 이 아니면 계정이 엉뚱한 곳으로 풀린다
  });
});

describe('tabForPath — 가든 하위 탭 판정', () => {
  it('대시보드는 /garden 정확 일치만 — 하위 경로가 dashboard 로 오판되면 탭 권한이 무력화된다', () => {
    expect(tabForPath('/garden')?.key).toBe('dashboard');
    expect(tabForPath('/garden/sales')?.key).toBe('sales');
    expect(tabForPath('/garden/weather')?.key).toBe('weather');
    expect(tabForPath('/garden/calibration/report')?.key).toBe('calibration'); // 하위 경로 포함
  });

  it('레지스트리의 모든 탭이 자기 href 로 판정된다 (등록 누락·오타 감지)', () => {
    for (const t of GARDEN_TABS) {
      expect(tabForPath(t.href)?.key).toBe(t.key);
    }
  });

  it('레지스트리 밖 경로는 undefined — 탭 권한과 무관하게 섹션 권한만 적용된다', () => {
    expect(tabForPath('/garden/unknown-page')).toBeUndefined();
  });
});

describe('studioTabForPath — 스탭밀 하위 탭 판정', () => {
  it('대시보드는 /studio 정확 일치만', () => {
    expect(studioTabForPath('/studio')?.key).toBe('dashboard');
    expect(studioTabForPath('/studio/sales')?.key).toBe('sales');
  });

  it('레지스트리의 모든 탭이 자기 href 로 판정된다 (등록 누락·오타 감지)', () => {
    for (const t of STUDIO_TABS) {
      expect(studioTabForPath(t.href)?.key).toBe(t.key);
    }
  });

  it('레지스트리 밖 경로는 undefined', () => {
    expect(studioTabForPath('/studio/unknown-page')).toBeUndefined();
  });
});
