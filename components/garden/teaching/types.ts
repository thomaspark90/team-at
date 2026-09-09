import type { StoreId } from '@/lib/types';

// 교육 탭 클라이언트 공용 타입 — /api/garden-teaching 응답 형태

export type Received = { sessionId: number; date: string; store: StoreId; managerName: string; createdAt: string };

export type ShiftTrainee = { userId: string; name: string; openTopics: string[]; priorities: Record<string, number> };

// 지점 근무자 명부(/api/garden-teaching/staff) — 운영 권한 전용
export type StaffDetail = {
  userId: string;
  name: string;
  stores: StoreId[];
  rosterOnly: boolean; // 명부만(로그인 없음)
  simpleLogin: boolean;
  contactEmail: string | null;
  wishes: { topicKey: string; priority: number | null; received: boolean }[];
  note: string;
};
export type ShiftSlot = { hour: number; note: string }; // 9 = 09:00 칸
export type Shift = {
  id: number;
  managerId: string;
  managerName: string;
  date: string;
  store: StoreId;
  startTime: string | null; // 'HH:MM:SS'
  endTime: string | null;
  trainees: ShiftTrainee[];
  slots: ShiftSlot[];
};

export type TeachingMe = {
  today: string;
  userId: string;
  role: 'admin' | string; // profile_roles.key 또는 admin
  profile: { name: string; stores: StoreId[]; roleLabel: string; simpleLogin: boolean; pinResetRequired: boolean } | null;
  canManage: boolean;
  wishes: { topicKey: string; requestedAt: string; received: Received | null }[];
  receivedAll: ({ topicKey: string } & Received)[];
  note: string;
  shifts: Shift[];
  managers: { userId: string; name: string; stores: StoreId[] }[];
  staff: { userId: string; name: string; stores: StoreId[] }[]; // 운영 권한 있을 때만 채워짐
};

export type Board = {
  store: StoreId;
  staff: { userId: string; name: string }[];
  topics: { topicKey: string; wanters: { userId: string; name: string; requestedAt: string; priority: number | null }[] }[];
  notes: { userId: string; name: string; note: string; updatedAt: string }[];
  sessions: {
    id: number;
    topicKey: string;
    date: string;
    store: StoreId;
    managerId: string;
    managerName: string;
    memo: string;
    attendees: { userId: string; name: string }[];
  }[];
};

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || '요청에 실패했습니다.');
  return body as T;
}
