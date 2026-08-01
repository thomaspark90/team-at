// 월별 회계자료 업로드 보드의 슬롯 정의 — 보드 UI·상태 API 가 공유.
// 실무자가 매월 올려야 하는 자료 목록이 곧 이 배열이다.

export type SlotGroup = '입출금 내역' | '지출 세부 내역';

export interface UploadSlot {
  key: string;
  label: string;
  group: SlotGroup;
  // 저장될 거래의 출처 — 지출 자료 분류 타일 매칭 + 현금 집계(source='bank'만) 규칙에 쓰인다.
  // 지출 세부(카드·쿠팡)는 'card' 로 넣어 통장의 카드대금 결제 건과 이중계산을 막는다.
  source: 'bank' | 'card' | 'naverpay';
  // 자동수집 소스(쿠팡·네이버 launchd 크롤러) — 보드에서 업로드 칸이 아니라
  // '이 달 수집 N건 · 분류 보기' 타일로 표시. 엑셀 추가 업로드는 보조(+)로만.
  auto?: boolean;
  // 은행 슬롯 — 브랜드별 사용 은행 설정(finance.brand_settings)의 필터 대상
  bank?: 'shinhan' | 'woori';
}

export const UPLOAD_SLOTS: UploadSlot[] = [
  { key: 'bank_shinhan', label: '신한은행', group: '입출금 내역', source: 'bank', bank: 'shinhan' },
  { key: 'bank_woori', label: '우리은행', group: '입출금 내역', source: 'bank', bank: 'woori' },
  { key: 'coupang', label: '쿠팡 지출', group: '지출 세부 내역', source: 'card', auto: true },
  { key: 'naverpay', label: '네이버 페이 지출', group: '지출 세부 내역', source: 'naverpay', auto: true },
  { key: 'card_main', label: '주지출 카드', group: '지출 세부 내역', source: 'card' },
];

export const SLOT_KEYS = UPLOAD_SLOTS.map((s) => s.key);

// 브랜드의 사용 은행 설정을 반영한 슬롯 목록 — 목록에 없는 은행 슬롯만 빠진다.
// banks 미지정(null/undefined = 설정 미로드·미지정)이면 전체 슬롯.
export const slotsForBanks = (banks: string[] | null | undefined): UploadSlot[] =>
  UPLOAD_SLOTS.filter((s) => !s.bank || !banks || banks.includes(s.bank));

// 슬롯별 완료 상태 (상태 API 응답)
export interface SlotStatus {
  done: boolean; // 뭐라도 올라감
  full: boolean; // 기간 합집합이 월 전체를 덮음 — done && !full 이면 '부분(◐)'
  range: string | null; // 덮인 구간 표기, 예: '6/5~15' (부분일 때 안내용)
  count: number; // 저장된 거래 행 수(파악 가능할 때)
  at: string | null; // 마지막 업로드 시각
  via: 'slot' | 'auto' | null; // slot=이 보드에서 업로드, auto=기존 경로(은행 PDF·카드명세·자동수집)로 감지
}
