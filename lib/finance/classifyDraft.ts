// 지출 자료 분류 화면의 작업 상태 임시저장(sessionStorage) — 계정과목 설정 등 다른 화면에
// 다녀오면 리마운트로 AI 추천·필터·선택·페이지가 날아가던 문제(2026-08-17 대표 요청).
// 분류 자체(드롭다운 확정)는 이미 DB에 즉시 저장되므로, 여기서는 화면의 진행 상태만 보존한다.
// 탭을 닫으면 사라지는 세션 단위 — 서버 저장 아님.

export interface ClassifyDraft {
  ym?: string; // 저장 시점의 셸 선택 월 — 다른 달로 돌아오면 페이지·선택 복원은 건너뛴다
  filterYm?: string; // 셸 밖(구 화면) 전용 월 필터
  filterBank?: string;
  srcFilter?: string;
  brandFilter?: string;
  storeFilter?: string;
  unclOnly?: boolean;
  misangOnly?: boolean;
  search?: string;
  catFilter?: { type?: string; cat?: string };
  page?: number;
  selected?: number[]; // 체크박스 선택 거래 id
  suggestions?: Record<string, { categoryId: number; confidence: number; reason: string }>; // AI 추천 결과
}

// unit: 단위 고정 뷰(brand:store)·브랜드 스코프별로 드래프트를 분리 — 다른 단위 화면끼리 섞이지 않게
export function classifyDraftKey(unit: string) {
  return `finance-classify-draft:${unit}`;
}

export function loadClassifyDraft(key: string): ClassifyDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ClassifyDraft) : null;
  } catch {
    return null;
  }
}

export function saveClassifyDraft(key: string, draft: ClassifyDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // 저장 실패(용량 초과 등)는 무시 — 임시저장은 보조 기능이라 화면 동작을 막지 않는다
  }
}
