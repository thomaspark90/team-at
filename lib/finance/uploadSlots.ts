// 월별 회계자료 업로드 보드의 슬롯 정의 — 보드 UI·상태 API 가 공유.
// 실무자가 매월 올려야 하는 자료 목록이 곧 이 배열이다.

export type SlotGroup = '입출금 내역' | '지출 세부 내역';

export interface UploadSlot {
  key: string;
  label: string;
  group: SlotGroup;
  // 저장될 거래의 출처 — 자료 분류 타일 매칭 + 현금 집계(source='bank'만) 규칙에 쓰인다.
  // 지출 세부(카드·쿠팡)는 'card' 로 넣어 통장의 카드대금 결제 건과 이중계산을 막는다.
  source: 'bank' | 'card' | 'naverpay';
}

export const UPLOAD_SLOTS: UploadSlot[] = [
  { key: 'bank_shinhan', label: '신한은행', group: '입출금 내역', source: 'bank' },
  { key: 'bank_woori', label: '우리은행', group: '입출금 내역', source: 'bank' },
  { key: 'coupang', label: '쿠팡', group: '지출 세부 내역', source: 'card' },
  { key: 'naverpay', label: '네이버', group: '지출 세부 내역', source: 'naverpay' },
  { key: 'card_main', label: '주지출 카드', group: '지출 세부 내역', source: 'card' },
];

export const SLOT_KEYS = UPLOAD_SLOTS.map((s) => s.key);

// 슬롯별 완료 상태 (상태 API 응답)
export interface SlotStatus {
  done: boolean;
  count: number; // 저장된 거래 행 수(파악 가능할 때)
  at: string | null; // 마지막 업로드 시각
  via: 'slot' | 'auto' | null; // slot=이 보드에서 업로드, auto=기존 경로(은행 PDF·카드명세·자동수집)로 감지
}
