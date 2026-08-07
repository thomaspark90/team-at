// 가든서비스 알림 토픽 — 항목별 담당자(이메일)를 지정해 이메일+웹푸시로 알린다.
// 담당자 지정은 /garden/settings, 저장은 Blob(data/garden-notify-topics.json).
export type GardenTopicId =
  | 'recipeNew'
  | 'recipeEdit'
  | 'calibration'
  | 'beanCard'
  | 'reviewIssue'
  | 'receiptAnomaly'
  | 'mealStory';

/** 담당자 설정 화면이 브랜드별로 나뉘어 있어 토픽에도 소속을 둔다 */
export type TopicScope = 'garden' | 'staffmeal';

export const GARDEN_TOPICS: { id: GardenTopicId; label: string; desc: string; scope: TopicScope }[] = [
  { id: 'recipeNew', label: '신규 레시피 등록', desc: '레시피가 처음 저장되면 알림', scope: 'garden' },
  { id: 'recipeEdit', label: '기존 레시피 수정', desc: '기존 레시피가 수정되면 알림', scope: 'garden' },
  { id: 'calibration', label: 'EK43 캘리브레이션 요청', desc: '분쇄도 측정 요청의 기본 수신자', scope: 'garden' },
  { id: 'beanCard', label: '원두카드 제작 요청', desc: '원두카드 제작 요청의 기본 수신자', scope: 'garden' },
  { id: 'reviewIssue', label: '이슈 리뷰 접수', desc: '불만·개선 지적이 담긴 새 리뷰가 수집되면 알림', scope: 'garden' },
  {
    id: 'receiptAnomaly',
    label: '영수증 확인 필요 금액',
    desc: '명세서에서 우리 항목에 없는 금액(할인·반품·선입금 등)이나 계산이 안 맞는 값이 보이면 알림',
    scope: 'staffmeal',
  },
  { id: 'mealStory', label: '스탭밀 메뉴 스토리', desc: '메뉴 스토리 관련 알림', scope: 'staffmeal' },
];

export const topicsOfScope = (scope: TopicScope) => GARDEN_TOPICS.filter((t) => t.scope === scope);

export type GardenTopicMap = Record<GardenTopicId, string[]>;

export const EMPTY_TOPICS: GardenTopicMap = {
  recipeNew: [],
  recipeEdit: [],
  calibration: [],
  beanCard: [],
  reviewIssue: [],
  receiptAnomaly: [],
  mealStory: [],
};
