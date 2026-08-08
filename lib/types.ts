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

// 산식 설정값 (구매용량 1000g / 로스율제외 90% / 투입량 20g=ICE·HOT 평균 / 배수 4~5.5)
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
  beanEn?: string; // 영문 원두명 — 원두카드 인쇄용 (구 기록엔 없음)
  roastery?: string; // 로스팅사 (구 기록엔 없음)
  orderDate?: string; // 발주 날짜 YYYY-MM-DD (구 기록엔 없음 — createdAt 으로 대체 표시)
  roastDate?: string; // 로스팅 날짜 YYYY-MM-DD — 발주 시점엔 모르고, 택배 수령 후 [수령]으로 기재
  tastingNotes?: string; // 테이스팅 노트 — 원두카드 인쇄용 (구 기록엔 없음)
  staffName?: string; // 발주한 스탭이름 — 'OOO님'으로 표시 (구 기록엔 없음)
  purchasePrice: number; // 구매가 (구매 용량 기준)
  settings: PricingSettings; // 당시 설정 스냅샷
  costPerCup: number; // 당시 잔당 재료비
  rangeLow: number; // 당시 권장가 하단 (배수 minMult)
  rangeHigh: number; // 당시 권장가 상단 (배수 maxMult)
  chosenMult: number | null; // 사장님이 선택한 배수
  chosenPrice: number | null; // 선택한 배수의 책정 판매가
  createdBy?: string; // 저장한 사람 이메일 (구 기록엔 없음)
}

// 로스터리별 원두카드 이미지(로고·QR) — 설정에서 업로드, Blob public URL
export type RoasteryAssets = Record<string, { logo?: string; qr?: string }>;

// 발주 입력 드롭다운 명단 — 설정에서 관리 (스탭이름·로스팅사)
export interface GardenOptions {
  staffNames: string[];
  roasteries: string[];
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

export type BrewType = 'ice' | 'hot';

// 원두별 드립 레시피 — 원두(normalize 키)마다 ICE/HOT 하나씩
export interface DripRecipe {
  id?: string; // 기록별 blob 저장 키 — beanKey+brewType 업서트 키와 별개의 영속 id (구 기록은 이관 시 주입)
  beanKey: string; // normalize(bean) — brewType과 함께 upsert 키
  brewType?: BrewType; // 없으면 ice (구 기록 호환)
  bean: string; // 표시용 원두명 (마지막 저장 시점 표기)
  doseG: number | null; // 투입량(g)
  waterG: number | null; // 총 물량(g, 푸어링 합) — 물은 1g≈1ml지만 표기는 g로 통일
  pours?: PourStep[] | null; // 푸어링 단계 (구 기록엔 없음)
  tempC: number | null; // 물 온도(°C)
  grind: string; // 분쇄도 텍스트 (구 기록 호환 — grindMesh가 있으면 그쪽 우선)
  grindMesh?: number | null; // 분쇄도 수치 (EK43 양재천 기준, 0.1 단위)
  totalTime: string; // 총 추출 시간 (예: 2:30)
  notes: string; // 푸어링/메모
  presetId?: string | null; // 적용한 프리셋 (lib/drip-presets.ts) — 직접 입력이면 null
  createdAt?: string; // ISO — 최초 등록 시점 (구 기록은 저장 시 이력 최초 시각으로 백필)
  updatedAt: string; // ISO — 대시보드 정렬 기준
  updatedBy?: string; // 저장한 사람 이메일
  history?: DripRecipeSnapshot[]; // 이전 버전 (최신순, 최대 20개)
  // 판교 EK43 수동 보정 — 물 pH·미네랄 차이로 산식이 절대적이지 않아 지점에서 직접 조정.
  // null/없음 = 산식 자동 환산 사용. 양재천 grindMesh가 바뀌면 자동값으로 복귀(이력 기록).
  pangyoMesh?: number | null;
  pangyoMeshHistory?: PangyoMeshChange[]; // 보정 이력 (최신순, 최대 20개)
}

// 판교 분쇄도 보정 이력 한 건 — mesh null = 산식 자동값으로 복귀.
// baseMesh(보정 당시 양재천 기준값)가 있어야 나중에 Δ = mesh - 산식(baseMesh)를 복원해
// '판교 물 보정 상수'로 캘리브레이션에 환류할 수 있다.
export interface PangyoMeshChange {
  mesh: number | null;
  baseMesh?: number | null; // 보정 당시 양재천 EK43 기준 분쇄도
  updatedAt: string;
  updatedBy?: string;
  reason?: string;
}

// 레시피 이전 버전 스냅샷 — 덮어쓰기 저장 시 직전 값을 보관 (자체 이력은 없음)
export type DripRecipeSnapshot = Omit<DripRecipe, 'beanKey' | 'brewType' | 'bean' | 'history'>;

export interface RecipeStore {
  recipes: DripRecipe[];
}

// 원두 등록 시점 — 해당 원두 레시피들의 createdAt(없으면 이력 최초 저장 시각, 그것도 없으면 updatedAt) 중 가장 이른 값
export function beanRegisteredAt(recipes: (DripRecipe | null | undefined)[]): string | null {
  let min: string | null = null;
  for (const r of recipes) {
    if (!r) continue;
    const oldest = r.history?.length ? r.history[r.history.length - 1].updatedAt : null;
    const t = r.createdAt ?? oldest ?? r.updatedAt;
    if (t && (!min || t.localeCompare(min) < 0)) min = t;
  }
  return min;
}

// D+ 배지 경고색 — D+24 넘으면(D+25부터) 주황, D+31부터 빨강 (기본은 undefined → muted 색 유지)
export function dPlusColor(days: number): string | undefined {
  if (days >= 31) return '#dc2626';
  if (days >= 25) return '#ea580c';
  return undefined;
}

// 등록 시점부터 지난 일수 (등록 당일 = D+0, 달력일 기준)
export function daysSince(iso: string): number {
  const from = new Date(iso);
  from.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - from.getTime()) / 86400000));
}

export type BeanStatus = 'active' | 'soldout';

// 지점 — 소진은 지점 단위로 관리
export type StoreId = 'pangyo' | 'yangjae';
export const STORES: { id: StoreId; label: string; short: string }[] = [
  { id: 'pangyo', label: '판교점', short: '판교' },
  { id: 'yangjae', label: '양재천점', short: '양재천' },
];

// 원두 단위 메타 — ICE/HOT 공통 정보 (테이스팅 노트·지점별 재고량)
export interface BeanMeta {
  beanKey: string; // normalize(원두명) — upsert 키
  bean: string; // 표시용 원두명
  tasting: string; // 테이스팅 노트 (산미·단맛·향 표현)
  stockByStore?: Partial<Record<StoreId, number>>; // 지점별 재고량 % (100/80/…/0) — 없으면 100
  soldoutStores?: StoreId[]; // 구버전 호환 — 포함된 지점은 재고 0%로 해석
  status?: BeanStatus; // 구버전 호환 — soldout이면 전 지점 재고 0%로 해석
  updatedAt: string;
  updatedBy?: string;
}

// 재고량 선택지 (%)
export const STOCK_LEVELS = [100, 80, 60, 40, 20, 0];

// 지점별 재고 % — stockByStore 우선, 없으면 구버전 소진 기록으로 해석 (기본 100)
export function stockOf(meta: BeanMeta | undefined, storeId: StoreId): number {
  const v = meta?.stockByStore?.[storeId];
  if (v != null) return v;
  const sold = meta?.soldoutStores ?? (meta?.status === 'soldout' ? STORES.map((s) => s.id) : []);
  return sold.includes(storeId) ? 0 : 100;
}

export interface BeanMetaStore {
  beans: BeanMeta[];
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
