import type { StoreId } from '@/lib/types';

// 스탭 설문(탈리) 링크 — 지점별. 앱 계정 없이도 배우고 싶은 것을 걷을 때 쓴다(2026-09-09 판교점 제작).
// 새 지점 설문을 만들면 여기에 URL 만 추가. 매니저 보드 우측 상단에 노출된다.
// formId 는 탈리 웹훅 페이로드의 data.formId — 응답이 어느 지점 설문인지 여기서 판정한다(lib/teaching/survey-parse.ts).
export const STORE_SURVEYS: Partial<Record<StoreId, { url: string; label: string; formId: string }>> = {
  pangyo: { url: 'https://tally.so/r/Bzy5WQ', label: '판교점 설문', formId: 'Bzy5WQ' },
};
