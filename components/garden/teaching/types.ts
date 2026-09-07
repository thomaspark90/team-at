import type { StoreId } from '@/lib/types';

// 교육 탭 클라이언트 공용 타입 — /api/garden-teaching 응답 형태

export type Received = { sessionId: number; date: string; store: StoreId; managerName: string; createdAt: string };

export type Shift = { id: number; managerId: string; managerName: string; date: string; store: StoreId };

export type TeachingMe = {
  today: string;
  userId: string;
  role: 'admin' | 'manager' | 'staff';
  profile: { name: string; stores: StoreId[]; simpleLogin: boolean; pinResetRequired: boolean } | null;
  canManage: boolean;
  wishes: { topicKey: string; requestedAt: string; received: Received | null }[];
  receivedAll: ({ topicKey: string } & Received)[];
  note: string;
  shifts: Shift[];
  managers: { userId: string; name: string; stores: StoreId[] }[];
};

export type Board = {
  store: StoreId;
  staff: { userId: string; name: string }[];
  topics: { topicKey: string; wanters: { userId: string; name: string; requestedAt: string }[] }[];
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
