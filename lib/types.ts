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

// 경쟁사 메뉴 한 줄 (비전 추출 결과). 이미지는 저장하지 않음(비공개).
export interface CompetitorRow {
  id: string;
  cafe: string;
  bean: string;
  price: number;
  createdAt: string;
}

export interface CompetitorStore {
  rows: CompetitorRow[];
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
