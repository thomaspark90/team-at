// 가든서비스 알림 토픽 — 항목별 담당자(이메일)를 지정해 이메일+웹푸시로 알린다.
// 담당자 지정은 /garden/settings, 저장은 Blob(data/garden-notify-topics.json).
export type GardenTopicId =
  | 'recipeNew'
  | 'recipeEdit'
  | 'calibration'
  | 'beanCard'
  | 'nametagPrint' // 브런치 네임택 프린트 요청 수신자 — 그래픽 담당(2026-11-20)
  | 'beanReceive' // 원두 수령 담당 — 지정된 사람만 [수령](로스팅 날짜·영문명 확정)을 누를 수 있다 (2026-11-19)
  | 'salePriceRequest' // 발주 저장 → 판매가 설정(saleprice 탭) 담당자에게 책정 요청
  | 'reviewIssue' // (구) 지점 공통 — 화면에서 제거, 지점 토픽 미지정 시 폴백으로만 읽는다(2026-08-08 지점 분리)
  | 'reviewIssueYangjae'
  | 'reviewIssuePangyo'
  | 'receiptAnomaly'
  | 'mealStory';

/** 담당자 설정 화면이 브랜드별로 나뉘어 있어 토픽에도 소속을 둔다 */
export type TopicScope = 'garden' | 'staffmeal';

// tab = 이 항목이 속한 가든 탭 key(lib/garden/tabs.ts) — 설정 화면이 내비 순서대로 묶는 데 쓴다
export const GARDEN_TOPICS: { id: GardenTopicId; label: string; desc: string; scope: TopicScope; tab?: string }[] = [
  { id: 'recipeNew', label: '신규 레시피 등록', desc: '레시피가 처음 저장되면 알림', scope: 'garden', tab: 'recipes' },
  { id: 'recipeEdit', label: '기존 레시피 수정', desc: '기존 레시피가 수정되면 알림', scope: 'garden', tab: 'recipes' },
  { id: 'calibration', label: 'EK43 캘리브레이션 요청', desc: '분쇄도 측정 요청의 기본 수신자', scope: 'garden', tab: 'calibration' },
  { id: 'beanCard', label: '원두카드 제작 요청', desc: '원두카드 제작 요청의 기본 수신자', scope: 'garden', tab: 'beancard' },
  { id: 'nametagPrint', label: '브런치 네임택 프린트 요청', desc: '스탭이 네임택 프린트를 요청하면 알림 (그래픽 담당)', scope: 'garden', tab: 'nametags' },
  // 알림이 아니라 권한 지정 — 비워 두면 발주 탭 권한이 있는 사람 누구나 수령을 기재한다(2026-11-19 대표 지시)
  {
    id: 'beanReceive',
    label: '원두 수령 담당',
    desc: '지정한 사람만 [수령](로스팅 날짜·영문명 확정)을 누를 수 있어요 · 비워 두면 발주 권한이 있는 사람 누구나',
    scope: 'garden',
    tab: 'pricing',
  },
  // 발주·판매가 책정이 권한 분리된 2단계 플로라, 발주가 저장되면 책정 담당자를 호출한다(2026-08-08)
  {
    id: 'salePriceRequest',
    label: '판매가 책정 대기',
    desc: '새 발주가 저장되면 판매가 설정 담당자에게 알림',
    scope: 'garden',
    tab: 'saleprice',
  },
  // 이슈 리뷰는 지점별 담당자 — 그 지점 리뷰만 그 지점 담당자에게 간다(2026-08-08)
  {
    id: 'reviewIssueYangjae',
    label: '이슈 리뷰 접수 · 양재천점',
    desc: '양재천점의 불만·개선 지적 리뷰가 수집되면 알림',
    scope: 'garden',
    tab: 'reviews',
  },
  {
    id: 'reviewIssuePangyo',
    label: '이슈 리뷰 접수 · 판교점',
    desc: '판교점의 불만·개선 지적 리뷰가 수집되면 알림',
    scope: 'garden',
    tab: 'reviews',
  },
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
  nametagPrint: [],
  beanReceive: [],
  salePriceRequest: [],
  reviewIssue: [],
  reviewIssueYangjae: [],
  reviewIssuePangyo: [],
  receiptAnomaly: [],
  mealStory: [],
};

// 리뷰의 store_key(pangyo/yangjae) → 지점 이슈 리뷰 토픽
export const reviewIssueTopicOf = (store: string): GardenTopicId =>
  store === 'pangyo' ? 'reviewIssuePangyo' : 'reviewIssueYangjae';
