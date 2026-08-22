// Garden Service 재무 ERP — 코어 타입
// 설계 스펙: https://claude.ai/code/artifact/6ccab840-3ada-42c3-9cf1-cfaa39ca869a

export type BankSource = 'shinhan' | 'woori' | 'naverpay' | 'excel';

// 브랜드 — 통장·카드·POS가 브랜드별로 분리 운영된다 (transfer_requests.brand 와 동일 표기).
// DB 기본값 'garden': 기존 수집 경로(신한·우리·신한카드·쿠팡·네이버)는 모두 가든 귀속.
// 'personal'(개인) — 사업 계정으로 결제한 사적 지출. 손익 제외이며 사업 브랜드 세그먼트(BRANDS)에는
// 넣지 않는다(관리손익·리포트 축 오염 방지). 회계단위 탭(UNITS)에만 '개인'으로 노출된다.
export type Brand = 'staffmeal' | 'garden' | 'personal';
export const BRANDS: { id: Exclude<Brand, 'personal'>; label: string }[] = [
  { id: 'garden', label: '가든서비스' },
  { id: 'staffmeal', label: '스탭밀' },
];
// 개인 포함 전체 브랜드 라벨(표시용) — BRANDS(사업 브랜드)와 분리해 리포트 세그먼트 오염을 막는다.
const BRAND_LABELS: Record<string, string> = { garden: '가든서비스', staffmeal: '스탭밀', personal: '개인' };
export const brandLabel = (b: string | null | undefined) => (b ? (BRAND_LABELS[b] ?? '미지정') : '미지정');

// 매장 지점 — 가든서비스에만 의미(스탭밀=단일 매장, store null/'').
// transactions.branch(은행 거래점명·배송지명 혼재)와 별개인 깨끗한 차원.
export type Store = 'pangyo' | 'yangjae';
export const STORES: { id: Store; label: string }[] = [
  { id: 'pangyo', label: '판교' },
  { id: 'yangjae', label: '양재천' },
];
export const storeLabel = (s: string | null | undefined) =>
  STORES.find((x) => x.id === s)?.label ?? '미지정';

// 회계 단위(손익 리포트 축): 스탭밀 / 가든-판교 / 가든-양재천
export interface AccountingUnit {
  brand: Brand;
  store: Store | null; // 가든만 지점 구분
}

// 회계 하위 내비의 3단위 — 자료 입력·분류·이력·월 확정이 이 단위로 구분된다 (2026-07-31 대표 지시).
// 은행·카드 계좌는 가든 공용이라, 가든 지점 페이지의 은행·카드 업로드는 store 없이(brand=garden) 들어가고
// 지점 귀속은 분류 화면(지정·분할)에서 확정한다. POS·월확정은 지점 단위 그대로.
// 'personal'(개인) 단위 — 사적 지출 전용 탭. 사업 단위(스탭밀/양재천/판교) 오른쪽에 붙는다.
export type UnitId = 'staffmeal' | 'yangjae' | 'pangyo' | 'personal';
export interface UnitDef {
  id: UnitId;
  brand: Brand;
  store: Store | null; // 스탭밀·개인=단일(null)
  label: string;
}
export const UNITS: UnitDef[] = [
  { id: 'staffmeal', brand: 'staffmeal', store: null, label: '스탭밀' },
  { id: 'yangjae', brand: 'garden', store: 'yangjae', label: '가든서비스 양재천점' },
  { id: 'pangyo', brand: 'garden', store: 'pangyo', label: '가든서비스 판교점' },
  { id: 'personal', brand: 'personal', store: null, label: '개인' },
];
export const unitOf = (id: string | null | undefined): UnitDef | null =>
  UNITS.find((u) => u.id === id) ?? null;
export const unitLabel = (id: string | null | undefined) => unitOf(id)?.label ?? '미지정';

// 거래 출처(bank 컬럼) 라벨 — 은행 계좌(신한/우리)와 결제 지출(네이버 페이/쿠팡)이 한 축에 섞여 있어
// '은행' 접미를 일괄로 붙이면 '네이버은행/coupang은행'처럼 어색해진다(2026-07-31 표기 확정).
export const BANK_SOURCE_LABELS: Record<string, string> = {
  shinhan: '신한은행',
  woori: '우리은행',
  naverpay: '네이버 페이 지출',
  coupang: '쿠팡 지출',
  excel: '엑셀',
};
export const bankSourceLabel = (b: string | null | undefined) => (b ? (BANK_SOURCE_LABELS[b] ?? b) : '');

// 계정과목 대분류
export type CategoryType =
  | 'revenue' // 매출
  | 'cogs' // 매출원가(재료비)
  | 'sga' // 판매비와관리비
  | 'non_operating' // 영업외
  | 'excluded'; // 손익 제외(자산·내부이체)

export type CloseStatus = 'open' | 'submitted' | 'confirmed';
export type MemberRole = 'admin' | 'classifier' | 'viewer';

// 은행 PDF에서 파싱된 거래 한 줄 (DB 저장 직전 형태)
export interface ParsedTransaction {
  bank: BankSource;
  txAt: string; // ISO datetime, 예: 2026-07-01T15:12:40
  ym: string; // 거래일 기준 월귀속 'YYYY-MM'
  channel: string; // 신한 적요 / 우리 거래구분 — 분류에 쓰지 않음(거래 채널)
  memo: string; // 신한 내용 / 우리 기재내용 — 분류의 유일한 단서
  amountOut: number; // 출금
  amountIn: number; // 입금
  balance: number; // 잔액 (dedup 지문의 핵심)
  branch: string | null; // 신한 거래점 (우리는 없음)
  dedupHash: string; // 일시+출금+입금+잔액+내용 지문 (엑셀 v2는 브랜드·은행·동일튜플 순번 포함)
  /** 구지문(v1, 브랜드 없음) — 옛 지문으로 적재된 과거 거래와의 재업로드 대조용(2026-08-21 D9).
      dedupe()·저장 라우트가 둘 다 확인해, 지문 개편이 재중복 적재를 만들지 않게 한다. */
  legacyDedupHash?: string;
  normalizedKey: string; // 학습·자동분류용 정규화 키 (숫자·날짜 제거)
  source?: 'bank' | 'card'; // 기본 bank. 카드 이용내역은 'card'
  cardIssuer?: string; // 카드 발급사(예: '신한')
  isInstallment?: boolean; // 할부 여부(표기용)
  approvalNo?: string; // 카드 승인번호(영수증 매출전표 조인용)
  rawRowIndex?: number; // 원본 파일에서의 행 번호(0-base 절대 위치) — raw 레이어 역참조용
}

// 파싱 결과 요약 (업로드 미리보기용)
export interface ParseResult {
  bank: BankSource;
  transactions: ParsedTransaction[];
  totalRows: number; // 파싱 성공한 거래 줄 수
  sumIn: number;
  sumOut: number;
  /** 로우데이터 레이어 적재용 — 파서가 읽은 원본 시트(카드 명세 등, 채우는 파서만) */
  raw?: { rows: unknown[][]; header: unknown[] | null; dates: (string | null)[] };
}
