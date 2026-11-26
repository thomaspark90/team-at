// 서버 전용 — 필터커피 내리는 사람 명단의 Blob 저장 · 조회와 명부 조회. 클라이언트에서 import 금지.
import { get, put } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrewerStaffRow } from './brewers';

const DATA_PATH = 'data/garden-brewers.json';

/** 설정에서 저장한 직원 id 목록. 한 번도 저장한 적이 없으면 null(→ 스케줄 역할 '커피'로 대신한다). */
export async function readBrewerIds(): Promise<number[] | null> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return null;
  try {
    const j = JSON.parse(await new Response(res.stream).text()) as { staffIds?: unknown };
    return Array.isArray(j.staffIds) ? j.staffIds.map(Number).filter(Number.isInteger) : null;
  } catch {
    return null;
  }
}

export async function writeBrewerIds(staffIds: number[], by: string) {
  await put(DATA_PATH, JSON.stringify({ staffIds, updatedAt: new Date().toISOString(), updatedBy: by }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** 직원 명부 — 이름 · 재직 · 역할 · 기본 지점. */
export async function brewerStaffRows(svc: SupabaseClient): Promise<BrewerStaffRow[]> {
  const { data, error } = await svc.from('schedule_staff').select('id, name, active, roles, home_store');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: Number(r.id), name: r.name as string, active: !!r.active, roles: (r.roles as string[] | null) ?? undefined, home_store: (r.home_store as string | null) ?? null }));
}
