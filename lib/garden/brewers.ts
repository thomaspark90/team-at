import type { StoreId } from '@/lib/types';

// 필터커피 내리는 사람 — 필터커피 라인업의 「누가 추출하나요?」 이름 버튼과 추출 평가 · 레시피 수정의 이름 선택지.
// 가든서비스 › 설정에서 지점별로 고른다(2026-11-26 대표 지시). 스케줄 역할 '커피'는 근무표를 짜는 사람이 보는 표기일 뿐이라
// 이 명단과 묶지 않는다. 그 지점에서 근무하는 사람(직원 명부의 근무 지점)만 후보이고, 그중에서 켠 사람만 나온다.
// 사람은 직원 명부의 id 로 기억한다 — 명부에서 이름을 고쳐도 따라온다.
// 순수 함수만 둔다(화면 · API · 테스트 공용). 저장 · 조회는 brewers-server.ts.

export interface BrewerStaffRow {
  id: number;
  name: string;
  active: boolean;
  roles?: string[]; // 스케줄 역할 키 — 그 지점 명단을 아직 한 번도 저장하지 않았을 때만 쓴다
  home_store?: string | null; // 기본 지점
  stores?: string[] | null; // 근무 지점(기본 지점 포함)
}

/** 지점별로 저장한 직원 id. 지점 키가 없으면 그 지점은 아직 저장한 적이 없다. */
export type BrewerSaved = Partial<Record<StoreId, number[]>>;

/** 그 지점에서 근무하는 재직자 — 근무 지점에 들어 있거나(비어 있으면 기본 지점) 한 사람. */
export function storeStaff(rows: BrewerStaffRow[], store: StoreId): BrewerStaffRow[] {
  return rows.filter((r) => r.active && ((r.stores?.length ? r.stores : [r.home_store]) as (string | null | undefined)[]).includes(store));
}

/**
 * 그 지점에 지금 적용되는 명단(직원 id). 설정에서 그 지점을 한 번이라도 저장했으면 그 목록,
 * 아직 저장한 적이 없으면 이전 규칙대로 스케줄 역할이 '커피'인 사람 — 배포 직후에도 이름 버튼이 비지 않게.
 * 어느 쪽이든 그 지점에서 근무하는 재직자만 남는다(퇴사 · 지점 이동은 자동으로 빠진다).
 */
export function effectiveBrewerIds(rows: BrewerStaffRow[], saved: BrewerSaved, store: StoreId): number[] {
  const here = storeStaff(rows, store);
  const list = saved[store];
  if (!list) return here.filter((r) => (r.roles ?? []).includes('barista')).map((r) => r.id);
  const on = new Set(list);
  return here.filter((r) => on.has(r.id)).map((r) => r.id);
}

/** 그 지점 이름 버튼 · 추출 평가에 나오는 이름 — 가나다순. */
export function brewerNames(rows: BrewerStaffRow[], saved: BrewerSaved, store: StoreId): string[] {
  const on = new Set(effectiveBrewerIds(rows, saved, store));
  return rows
    .filter((r) => on.has(r.id))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 저장할 id 정리 — 정수만, 그 지점에서 근무하는 재직자만, 중복 없이. */
export function cleanBrewerIds(input: unknown, rows: BrewerStaffRow[], store: StoreId): number[] {
  if (!Array.isArray(input)) return [];
  const ok = new Set(storeStaff(rows, store).map((r) => r.id));
  return Array.from(new Set(input.map((v) => Number(v)).filter((n) => Number.isInteger(n) && ok.has(n))));
}
