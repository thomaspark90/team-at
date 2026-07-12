export type InputMode = 'fixed' | 'manual';

export interface Category {
  name: string;
  items: string[];
}

export interface StoryData {
  date: string;
  backgroundUrl: string;
  inputMode: InputMode;
  categories: Category[];
  manualText: string;
}

export interface BlobItem {
  url: string;
  pathname: string;
  uploadedAt: string;
}

// ---- Garden Service (드립 판매가 추정) ----

// 산식 설정값. 시트 기본값과 동일 (구매용량 1000g / 로스율제외 90% / 투입량 19g / 배수 4~5.5)
export interface PricingSettings {
  capacityG: number; // 구매 용량(g)
  yieldRate: number; // 로스율 제외 비율 (0~1)
  doseG: number; // 드립커피 투입량(g)
  minMult: number; // 권장 하한 배수
  maxMult: number; // 권장 상한 배수
  vatIncluded?: boolean; // 공급가에 부가세 포함 여부 (미지정=별도, 구 기록 호환)
}

// 내 발주 기록 한 건 (같은 원두 재발주 시 원가·판매가 비교용)
export interface PurchaseRecord {
  id: string;
  createdAt: string; // ISO
  bean: string;
  purchasePrice: number; // 구매가 (구매 용량 기준)
  settings: PricingSettings; // 당시 설정 스냅샷
  costPerCup: number; // 당시 잔당 재료비
  rangeLow: number; // 당시 권장가 하단 (배수 minMult)
  rangeHigh: number; // 당시 권장가 상단 (배수 maxMult)
  chosenMult: number | null; // 사장님이 선택한 배수
  chosenPrice: number | null; // 선택한 배수의 책정 판매가
  createdBy?: string; // 저장한 사람 이메일 (구 기록엔 없음)
}

export interface PurchaseStore {
  records: PurchaseRecord[];
}

// 드립 레시피 푸어링 한 단계 (뜸 포함, 순서대로)
export interface PourStep {
  water: number; // 물 투입량(g)
  at?: string; // 시작 시각 'm:ss' (프리셋에 있을 때만)
  label?: string; // 표기 (뜸/1차/… 비면 순번으로 표시)
}

// 원두별 드립 레시피 — 발주 기록의 원두명(normalize 키)에 1:1로 붙는다
export interface DripRecipe {
  beanKey: string; // normalize(bean) — upsert 키
  bean: string; // 표시용 원두명 (마지막 저장 시점 표기)
  doseG: number | null; // 투입량(g)
  waterG: number | null; // 총 물량(ml) — 푸어링이 있으면 그 합
  pours?: PourStep[] | null; // 푸어링 단계 (구 기록엔 없음)
  tempC: number | null; // 물 온도(°C)
  grind: string; // 분쇄도 (예: EK43 9.5, 중간)
  totalTime: string; // 총 추출 시간 (예: 2:30)
  notes: string; // 푸어링/메모
  presetId?: string | null; // 적용한 프리셋 (lib/drip-presets.ts) — 직접 입력이면 null
  updatedAt: string; // ISO — 대시보드 정렬 기준
  updatedBy?: string; // 저장한 사람 이메일
}

export interface RecipeStore {
  recipes: DripRecipe[];
}

// 스탭밀 메뉴 아카이브 한 건 — 스토리 다운로드 시점의 메뉴 스냅샷
export interface StaffMealRecord {
  id: string;
  createdAt: string; // ISO (저장 시각)
  date: string; // 배지 날짜 (예: 5/12)
  inputMode: InputMode;
  categories: Category[];
  manualText: string;
  createdBy: string; // 저장한 사람 이메일
}

export interface StaffMealStore {
  records: StaffMealRecord[];
}
