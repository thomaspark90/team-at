import { get, put } from '@vercel/blob';
import type { StaffMealStore } from '@/lib/types';

// 스탭밀 메뉴 아카이브 저장소 — 발주 기록(purchases)과 같은 Blob JSON 패턴
const DATA_PATH = 'data/staffmeals.json';

export async function readStaffMeals(): Promise<StaffMealStore> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return { records: [] };
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as StaffMealStore;
  } catch {
    return { records: [] };
  }
}

export async function writeStaffMeals(store: StaffMealStore) {
  await put(DATA_PATH, JSON.stringify(store), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
