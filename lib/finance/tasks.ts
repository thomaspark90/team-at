// 재무 업무 보드 — 재무 담당자가 주별/월별로 해야 하는 정기 업무를 칸반으로 관리한다.
// 주간·월간 템플릿이 기간 시작 시 자동으로 '할 일'에 생성되고, 단발 업무는 수동 추가.
// 월간 업무는 "전월분 마감 작업"이라 제목의 {M}이 전월 숫자로 치환된다 (7월 보드 → '6월 …').

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskCadence = 'weekly' | 'monthly' | 'once';
// 업무가 속한 보드 — accounting = 회계 대시보드(기장·자료 입력), finance = 리포트 재무 대시보드(보고 준비)
export type TaskBoardId = 'accounting' | 'finance';

export interface FinanceTask {
  id: string;
  title: string;
  board: TaskBoardId;
  cadence: TaskCadence;
  period: string; // weekly 'W-2026-07-13'(월요일) / monthly '2026-07' / once ''
  periodLabel: string; // '7/13 주' / '7월' / ''
  due: string | null; // YYYY-MM-DD
  status: TaskStatus;
  templateId?: string; // 정기 업무 원본 (수동 추가는 없음)
  href?: string; // 관련 화면 바로가기
  removed?: boolean; // 템플릿 카드 삭제 시 톰스톤 — 재생성 방지용으로 남긴다
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
  check?: TaskCheck; // 데이터 연동 확인 — GET 시 계산되는 일시 필드(저장 안 함)
}

// 실제 데이터 입력 여부 확인 결과 (예: 채널수수료 입력됨, POS 업로드됨, 월 확정됨)
export interface TaskCheck {
  done: boolean;
  label: string;
}

export const TASK_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: '할 일' },
  { status: 'doing', label: '진행 중' },
  { status: 'done', label: '완료' },
];

export const CADENCE_LABEL: Record<TaskCadence, string> = {
  weekly: '주간',
  monthly: '월간',
  once: '단발',
};

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 이번 주(월~일) — key는 월요일 날짜, 기한은 일요일
export function weekPeriodOf(date: Date): { key: string; label: string; due: string } {
  const mon = new Date(date);
  mon.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    key: `W-${ymd(mon)}`,
    label: `${mon.getMonth() + 1}/${mon.getDate()} 주`,
    due: ymd(sun),
  };
}

// 이번 달 — 월간 업무는 전월분 마감이므로 전월 숫자(targetMonth)를 함께 돌려준다
export function monthPeriodOf(date: Date): { key: string; label: string; targetMonth: number } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return {
    key: `${y}-${pad(m)}`,
    label: `${m}월`,
    targetMonth: m === 1 ? 12 : m - 1,
  };
}

interface WeeklyTemplate {
  id: string;
  title: string;
  board: TaskBoardId;
  href?: string;
}
interface MonthlyTemplate extends WeeklyTemplate {
  dueDay: number; // 이번 달 며칠까지
}

// 회계 = 자료 입력·분류·재고·확정 등 기장 업무 / 재무 = POS·수수료·손익 검토 등 보고 준비
export const WEEKLY_TEMPLATES: WeeklyTemplate[] = [
  { id: 'classify', title: '미분류 거래 분류 비우기', board: 'accounting', href: '/finance/classify' },
  { id: 'receipts', title: '카드 영수증·증빙 정리', board: 'accounting', href: '/finance/card' },
];

// {M} = 전월 숫자 (마감 대상 월)
export const MONTHLY_TEMPLATES: MonthlyTemplate[] = [
  { id: 'bank-pdf', title: '{M}월 은행 PDF 업로드', board: 'accounting', href: '/finance', dueDay: 5 },
  { id: 'card-stmt', title: '{M}월 신한카드 이용내역 업로드', board: 'accounting', href: '/finance', dueDay: 5 },
  { id: 'pos', title: '{M}월 가든 POS 매출 업로드', board: 'finance', href: '/finance/pnl', dueDay: 5 },
  { id: 'pos-staffmeal', title: '{M}월 스탭밀 POS 매출 업로드', board: 'finance', href: '/finance/pnl?brand=staffmeal', dueDay: 5 },
  { id: 'inventory', title: '{M}월 가든 기말재고 입력', board: 'accounting', href: '/finance/pnl', dueDay: 10 },
  { id: 'inventory-staffmeal', title: '{M}월 스탭밀 기말재고 입력', board: 'accounting', href: '/finance/pnl?brand=staffmeal', dueDay: 10 },
  { id: 'channel-fees', title: '{M}월 가든 채널수수료 입력', board: 'finance', href: '/finance/pnl', dueDay: 10 },
  { id: 'channel-fees-staffmeal', title: '{M}월 스탭밀 채널수수료 입력', board: 'finance', href: '/finance/pnl?brand=staffmeal', dueDay: 10 },
  { id: 'pnl-review', title: '{M}월 관리손익 검토', board: 'finance', href: '/finance/pnl', dueDay: 12 },
  { id: 'close', title: '{M}월 가든 월 확정', board: 'accounting', href: '/finance/close?brand=garden', dueDay: 15 },
  { id: 'close-staffmeal', title: '{M}월 스탭밀 월 확정', board: 'accounting', href: '/finance/close?brand=staffmeal', dueDay: 15 },
];

// 구버전 데이터(board 없이 저장된 카드)의 보드 판정 — 템플릿 카드는 원본 배정, 수동 카드는 재무
export function boardOfTemplate(templateId?: string): TaskBoardId {
  const all = [...WEEKLY_TEMPLATES, ...MONTHLY_TEMPLATES];
  return all.find((t) => t.id === templateId)?.board ?? 'finance';
}

// 월간 카드의 마감 대상 월 — 카드는 period(이번 달)에 생성되지만 작업 대상은 전월분
export function targetYmOf(period: string): string | null {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo === 1 ? `${y - 1}-12` : `${m[1]}-${String(mo - 1).padStart(2, '0')}`;
}
