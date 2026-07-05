// Garden Service 재무 ERP — 코어 타입
// 설계 스펙: https://claude.ai/code/artifact/6ccab840-3ada-42c3-9cf1-cfaa39ca869a

export type BankSource = 'shinhan' | 'woori';

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
  dedupHash: string; // 일시+출금+입금+잔액+내용 지문
  normalizedKey: string; // 학습·자동분류용 정규화 키 (숫자·날짜 제거)
  source?: 'bank' | 'card'; // 기본 bank. 카드 이용내역은 'card'
  cardIssuer?: string; // 카드 발급사(예: '신한')
  isInstallment?: boolean; // 할부 여부(표기용)
  approvalNo?: string; // 카드 승인번호(영수증 매출전표 조인용)
}

// 파싱 결과 요약 (업로드 미리보기용)
export interface ParseResult {
  bank: BankSource;
  transactions: ParsedTransaction[];
  totalRows: number; // 파싱 성공한 거래 줄 수
  sumIn: number;
  sumOut: number;
}
