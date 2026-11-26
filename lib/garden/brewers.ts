// 필터커피 내리는 사람 — 레시피 보드의 「누가 추출하나요?」 이름 버튼과 추출 평가 · 레시피 수정의 이름 선택지.
// 가든서비스 › 설정에서 따로 고른다(2026-11-26 대표 지시). 스케줄 역할 '커피'는 근무표를 짜는 사람이 보는 표기일 뿐이라
// 이 명단과 묶지 않는다. 사람은 직원 명부의 id 로 기억한다 — 명부에서 이름을 고쳐도 따라온다.
// 순수 함수만 둔다(화면 · API · 테스트 공용). 저장 · 조회는 brewers-server.ts.

export interface BrewerStaffRow {
  id: number;
  name: string;
  active: boolean;
  roles?: string[]; // 스케줄 역할 키 — 설정에서 아직 한 번도 저장하지 않았을 때만 쓴다
  home_store?: string | null;
}

/**
 * 지금 적용되는 명단(직원 id). 설정에서 한 번이라도 저장했으면 그 목록,
 * 아직 저장한 적이 없으면(saved = null) 이전 규칙대로 스케줄 역할이 '커피'인 사람 — 배포 직후에도 보드가 비지 않게.
 * 퇴사자(재직 꺼짐)는 어느 쪽이든 빠진다.
 */
export function effectiveBrewerIds(rows: BrewerStaffRow[], saved: number[] | null): number[] {
  const active = rows.filter((r) => r.active);
  if (saved === null) return active.filter((r) => (r.roles ?? []).includes('barista')).map((r) => r.id);
  const on = new Set(saved);
  return active.filter((r) => on.has(r.id)).map((r) => r.id);
}

/** 보드 · 추출 평가에 나오는 이름 — 가나다순. */
export function brewerNames(rows: BrewerStaffRow[], saved: number[] | null): string[] {
  const on = new Set(effectiveBrewerIds(rows, saved));
  return rows
    .filter((r) => on.has(r.id))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 저장할 id 정리 — 정수만, 명부의 재직자만, 중복 없이. */
export function cleanBrewerIds(input: unknown, rows: BrewerStaffRow[]): number[] {
  if (!Array.isArray(input)) return [];
  const ok = new Set(rows.filter((r) => r.active).map((r) => r.id));
  return Array.from(new Set(input.map((v) => Number(v)).filter((n) => Number.isInteger(n) && ok.has(n))));
}
