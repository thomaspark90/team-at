import type { StoreId } from '@/lib/types';

// 스탭 설문(탈리) 응답 — 지점별 정적 기록. 앱 계정 없이 걷은 결과라 DB 가 아니라 코드에 옮겨 적는다.
// topics 는 lib/teaching/topics.ts 의 key. 설문에 없는 주제를 직접 적은 건 custom 에 원문 그대로.
// priorities 는 1·2·3순위 순서 — 주제 key 이거나, 직접 추가한 주제를 골랐으면 'custom'.
// 응답이 늘면 탈리 Submissions 탭에서 옮겨 적고 respondedAt 을 갱신한다.

export type SurveyResponse = {
  name: string;
  submittedAt: string; // YYYY-MM-DD HH:mm (KST)
  topics: string[];
  custom: string[];
  priorities: (string | null)[]; // [1순위, 2순위, 3순위]
  note: string;
};

export type StoreSurveyResult = { surveyedAt: string; responses: SurveyResponse[] };

export const SURVEY_RESULTS: Partial<Record<StoreId, StoreSurveyResult>> = {
  pangyo: {
    surveyedAt: '2026-09-09',
    responses: [
      {
        name: '이진희',
        submittedAt: '2026-09-09 10:55',
        topics: [
          'filter-brewing',
          'quality-check',
          'cupping',
          'milk-alternatives',
          'latte-art',
          'milk-steaming',
          'water-temp',
          'espresso-dialing',
          'ek43-grind',
          'complaint',
        ],
        custom: [],
        priorities: ['latte-art', 'filter-brewing', 'espresso-dialing'],
        note: '아직은 없습니다.',
      },
      {
        name: '김보영',
        submittedAt: '2026-09-09 11:06',
        topics: [
          'espresso-dialing',
          'filter-brewing',
          'ek43-grind',
          'water-temp',
          'milk-steaming',
          'latte-art',
          'milk-alternatives',
          'cupping',
          'bean-explaining',
          'quality-check',
          'machine-cleaning',
          'troubleshooting',
          'water-maintenance',
          'bean-recommend',
          'complaint',
          'peak-flow',
        ],
        custom: [
          '실무방식 (어떤 방식·어떤 순서로 일하시는지, 돌발상황 시 어떤 방식으로 해결하시는지)',
          '업무 지적 (근무자들 근무 시 잘못된 점, 불필요한 행동과 비효율적인 방식 교정)',
        ],
        priorities: ['espresso-dialing', 'custom', 'milk-steaming'],
        note: '1번 항목의 직접 추가 사항을 참고해 주세요.',
      },
    ],
  },
};
