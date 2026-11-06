import type { StoreId } from '@/lib/types';

// 근무 스케줄 공용 타입 — 화면·API·시트 이관이 함께 쓴다.

export type ShiftKind = 'plan' | 'actual';
export type LeaveType = 'annual' | 'sick' | 'off' | 'sub_worked' | 'sub_off';

export const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: '연차',
  sick: '병가',
  off: '오프',
  sub_worked: '대체근무',
  sub_off: '대체휴무',
};

export interface Segment {
  start: number; // 0시 기준 분
  end: number;
}

export interface Shift extends Partial<Segment> {
  id: number;
  date: string; // YYYY-MM-DD
  store: StoreId;
  staffId: number;
  kind: ShiftKind;
  isOff: boolean;
  source: 'app' | 'sheet';
  uncertain: boolean;
}

// 근무자 역할 — 한 사람이 여러 역할을 맡을 수 있다(예: 바리스타 + 콜드파트). key 는 DB 저장값이라 바꾸지 않는다.
// 2026-11-06 대표 결정: 제빵·제과·콜드·핫·커피 다섯 가지(한 글자 약자는 분간이 안 돼 표에도 이 이름을 그대로 쓴다).
// 'pastry' 키는 처음에 '파티쉐'로 쓰던 값 — 제과로 둔다. 'dish'(디쉬)는 제외.
export const STAFF_ROLES = [
  { key: 'bread', label: '제빵' },
  { key: 'pastry', label: '제과' },
  { key: 'cold', label: '콜드' },
  { key: 'hot', label: '핫' },
  { key: 'barista', label: '커피' },
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number]['key'];
export const isStaffRole = (v: unknown): v is StaffRole => STAFF_ROLES.some((r) => r.key === v);

// 책임 태그 — 체크리스트 책임자 자동 선정에 쓴다. 근무 역할과 별개. key 는 DB 저장값.
export const DUTY_TAGS = [
  { key: 'manager', label: '매니저' },
  { key: 'sub_manager', label: '서브 매니저' },
] as const;
export type DutyTag = (typeof DUTY_TAGS)[number]['key'];
export const isDutyTag = (v: unknown): v is DutyTag => DUTY_TAGS.some((t) => t.key === v);

export interface Staff {
  id: number;
  name: string;
  homeStore: StoreId;
  joinedOn: string | null;
  active: boolean;
  roles: StaffRole[];
  dutyTag: DutyTag | null; // 운영진 명부 조회에만 채워진다
}

export interface WeekData {
  weekStart: string;
  days: string[];
  store: StoreId;
  editor: boolean;
  published: boolean;
  publishedStores: StoreId[]; // 이 주가 배포된 지점 — 작성 중 계획을 근무로 치지 않기 위해
  publishedAt: string | null;
  staff: Staff[];
  shifts: Shift[];
  notes: Record<string, string>; // 운영진에게만 채워진다
}
