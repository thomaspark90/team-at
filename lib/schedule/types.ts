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

export interface Staff {
  id: number;
  name: string;
  homeStore: StoreId;
  joinedOn: string | null;
  active: boolean;
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
