import type { StoreId } from '@/lib/types';
import type { PublishChange } from './publish-diff';

// 근무 스케줄 공용 타입 — 화면·API·시트 이관이 함께 쓴다.

export type ShiftKind = 'plan' | 'actual';
export type LeaveType = 'annual' | 'sick' | 'off' | 'sub_worked' | 'sub_off' | 'unavailable';

export const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: '연차',
  sick: '병가',
  off: '오프',
  sub_worked: '대체근무',
  sub_off: '대체휴무',
  unavailable: '근무 불가', // 직원이 말한 불가일 — 운영진이 대신 입력(2026-11-06). 잔여 연차와 무관
};

export interface LeaveMark {
  staffId: number;
  date: string;
  type: LeaveType;
  pending?: boolean; // 아직 승인되지 않은 신청 — 표에는 보이되 경고는 내지 않는다
}

// 연차 신청 — 승인되면 leave_records 가 된다. 지금은 운영진이 대신 접수(source editor), 직원 앱 신청은 app.
export const LEAVE_REQUEST_TYPES: LeaveType[] = ['annual', 'sick', 'off'];
export interface LeaveRequest {
  id: number;
  staffId: number;
  date: string;
  type: LeaveType;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  source: 'editor' | 'link' | 'app';
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string;
}

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
// color 는 시간대별 표의 색 점(대표 지정: 콜드 파랑 · 핫 빨강 · 제과제빵 우유색 · 커피 노랑). 제빵·제과는 같은 색.
export const STAFF_ROLES = [
  { key: 'bread', label: '제빵', color: '#F3EAD3' },
  { key: 'pastry', label: '제과', color: '#F3EAD3' },
  { key: 'cold', label: '콜드', color: '#3B82F6' },
  { key: 'hot', label: '핫', color: '#EF4444' },
  { key: 'barista', label: '커피', color: '#FACC15' },
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
  homeStore: StoreId; // 기본 지점 — 체크리스트 담당 판정·명부 정렬 기준
  stores: StoreId[]; // 근무 지점 — 이 지점들의 근무표에 행으로 나온다. 기본 지점을 항상 포함
  joinedOn: string | null;
  active: boolean;
  roles: StaffRole[];
  dutyTag: DutyTag | null; // 운영진 명부 조회에만 채워진다
}

// 근무 파트 — 칸 편집기의 한 번 누르기 버튼. 지점별로 운영진이 고친다(finance.schedule_shift_presets).
export interface ShiftPreset extends Segment {
  label: string;
}
export const PRESET_LABEL_MAX = 12;
export const PRESET_MAX = 12;
export const TEMPLATE_NAME_MAX = 20; // 주 템플릿 이름

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
  presets: ShiftPreset[]; // 이 지점의 근무 파트
  leaves: LeaveMark[]; // 이 주의 연차·불가 기록(운영진에게만) — 칸 표시·충돌 경고
  streakBefore: Record<number, number>; // 사람별 주 시작 전날까지의 연속 근무일(운영진에게만)
  changes: PublishChange[]; // 직전 배포 대비 이번 배포에서 바뀐 칸(배포된 주만)
  unpublishedChanges: number; // 배포 후 고친 칸 수(운영진에게만) — 0 이 아니면 다시 배포해야 직원에게 보인다
  acked: number[]; // 이번 배포를 확인한 직원 id
}
