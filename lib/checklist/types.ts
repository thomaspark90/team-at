import type { StoreId } from '@/lib/types';

// 오픈·마감 체크리스트 공용 타입 — 화면·API 가 함께 쓴다.

export type ShiftType = 'open' | 'close';
export type Frequency = 'daily' | 'weekly' | 'monthly';

export const SHIFT_LABEL: Record<ShiftType, string> = { open: '오픈', close: '마감' };
export const SHIFT_TYPES: ShiftType[] = ['open', 'close'];

export interface ChecklistItem {
  id: number;
  store: StoreId;
  shiftType: ShiftType;
  section: string;
  label: string;
  detail: string;
  frequency: Frequency;
  weekday: number | null; // 0=일. weekly=그 요일, monthly=매월 첫 그 요일
  photoRequired: boolean;
  active: boolean;
  origin: 'sheet' | 'proposal' | 'app';
  sortOrder: number;
}

export interface ChecklistCheck {
  id: number;
  itemId: number;
  status: 'done' | 'skipped';
  skipReason: string | null;
  hasPhoto: boolean;
  photoExpired: boolean; // 보관 기간이 지나 사진만 지워졌다
  photoTakenAt: string | null;
  doneByName: string;
  doneAt: string;
}

export interface CrewMember {
  id: number;
  name: string;
  linked: boolean;
}

/** 지점·날짜·조 한 장 — 화면이 그대로 그린다. */
export interface ChecklistCard {
  store: StoreId;
  date: string;
  shiftType: ShiftType;
  members: CrewMember[];
  leadId: number | null;
  onCrew: boolean; // 내가 이 조인가
  isLead: boolean; // 내가 책임자인가
  missed: boolean; // 지난날인데 제출되지 않았다
  takeovers: { name: string; at: string }[];
  reopens: { name: string; at: string }[];
  submittedAt: string | null;
  submittedByName: string | null;
  items: ChecklistItem[];
  checks: ChecklistCheck[];
}

export interface ChecklistDay {
  date: string;
  today: string;
  editor: boolean;
  canManageItems: boolean;
  assignment: boolean; // 담당 지정 사용 여부(CREW_ASSIGNMENT) — 꺼져 있으면 조·책임자 없이 지점 직원 누구나
  canAct: boolean; // 오늘 자리에서 체크할 수 있는 날인가
  linked: boolean; // 내 계정이 근무자 명부에 연결돼 있는가
  closedStores: StoreId[]; // 정기 휴무
  unpublishedStores: StoreId[]; // 그날의 주간 스케줄이 배포되지 않아 자동 제안을 못 한 지점
  unlinked: string[]; // 운영진 전용 — 조에 있지만 로그인할 수 있는 계정이 연결되지 않은 근무자
  takeoverOptions: { store: StoreId; shiftType: ShiftType }[]; // 내가 대신 맡을 수 있는 오늘 체크리스트
  cards: ChecklistCard[];
}

/** 조 편성 화면(운영진) */
export interface CrewPlan {
  date: string;
  store: StoreId;
  editable: boolean; // 지난날은 고정
  published: boolean;
  people: { id: number; name: string; linked: boolean }[];
  crews: Record<ShiftType, { autoIds: number[]; memberIds: number[]; leadId: number | null; pinnedLeadId: number | null; submitted: boolean }>;
}
