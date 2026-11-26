// 서버 전용 — 필터커피 내리는 사람 명단의 Blob 저장 · 조회와 명부 조회. 클라이언트에서 import 금지.
import { get, put } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STORES } from '@/lib/types';
import type { BrewerSaved, BrewerStaffRow } from './brewers';

const DATA_PATH = 'data/garden-brewers.json';
// 파일 모양: { byStore: { yangjae?: number[], pangyo?: number[] }, updatedAt, updatedBy }
// (2026-11-26 첫 배포 때의 { staffIds } 는 지점 구분이 없던 모양 — 남아 있으면 모든 지점의 저장분으로 읽는다)

const ids = (v: unknown): number[] | undefined => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : undefined);

/** 설정에서 저장한 지점별 직원 id. 저장한 적이 없는 지점은 키가 없다(→ 스케줄 역할 '커피'로 대신한다). */
export async function readBrewerSaved(): Promise<BrewerSaved> {
  const res = await get(DATA_PATH, { access: 'private', useCache: false });
  if (!res) return {};
  try {
    const j = JSON.parse(await new Response(res.stream).text()) as { byStore?: Record<string, unknown>; staffIds?: unknown };
    const out: BrewerSaved = {};
    for (const s of STORES) {
      const list = ids(j.byStore?.[s.id]) ?? ids(j.staffIds);
      if (list) out[s.id] = list;
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeBrewerSaved(byStore: BrewerSaved, by: string) {
  await put(DATA_PATH, JSON.stringify({ byStore, updatedAt: new Date().toISOString(), updatedBy: by }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** 직원 명부 — 이름 · 재직 · 역할 · 기본 지점 · 근무 지점. */
export async function brewerStaffRows(svc: SupabaseClient): Promise<BrewerStaffRow[]> {
  const { data, error } = await svc.from('schedule_staff').select('id, name, active, roles, home_store, stores');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    name: r.name as string,
    active: !!r.active,
    roles: (r.roles as string[] | null) ?? undefined,
    home_store: (r.home_store as string | null) ?? null,
    stores: (r.stores as string[] | null) ?? null,
  }));
}
