// 가든서비스 알림 토픽 — 항목별 담당자(이메일)를 지정해 이메일+웹푸시로 알린다.
// 담당자 지정은 /garden/settings, 저장은 Blob(data/garden-notify-topics.json).
export type GardenTopicId = 'recipeNew' | 'recipeEdit' | 'calibration' | 'beanCard' | 'reviewIssue';

export const GARDEN_TOPICS: { id: GardenTopicId; label: string; desc: string }[] = [
  { id: 'recipeNew', label: '신규 레시피 등록', desc: '레시피가 처음 저장되면 알림' },
  { id: 'recipeEdit', label: '기존 레시피 수정', desc: '기존 레시피가 수정되면 알림' },
  { id: 'calibration', label: 'EK43 캘리브레이션 요청', desc: '분쇄도 측정 요청의 기본 수신자' },
  { id: 'beanCard', label: '원두카드 제작 요청', desc: '원두카드 제작 요청의 기본 수신자' },
  { id: 'reviewIssue', label: '이슈 리뷰 접수', desc: '불만·개선 지적이 담긴 새 리뷰가 수집되면 알림' },
];

export type GardenTopicMap = Record<GardenTopicId, string[]>;

export const EMPTY_TOPICS: GardenTopicMap = {
  recipeNew: [],
  recipeEdit: [],
  calibration: [],
  beanCard: [],
  reviewIssue: [],
};
