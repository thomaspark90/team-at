import type { SupabaseClient } from '@supabase/supabase-js';
import { lockedYms } from './monthLock';

// 수집기는 service role 클라이언트(기본 스키마 finance)라 제네릭이 달라, 느슨한 타입으로 받는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

// 무인 수집기(쿠팡·네이버페이)의 확정월 가드 (2026-08-21 감사 P0, D10).
//
// 수집기는 service role 로 RLS 를 우회해 밤에 자동 실행된다 — 확정(결산)된 달의 원장을
// 신규 적재·소급 정정·브랜드 백필로 조용히 바꾸면, 결산 스냅샷과 현재 계산값이 사용자
// 행위 없이 갈라진다. 규칙: **확정월 건은 건너뛰고 건수만 응답·수집 기록에 남긴다.**
// 반영이 필요하면 월 결산에서 재오픈한 뒤 다음 수집(또는 백필 재실행)이 자연 반영한다.
//
// 원본(raw_rows) 적재는 가드 대상이 아니다 — 정본 보관은 잠금과 무관하게 항상 한다.

/** 관련 브랜드들의 확정월 집합을 한 번에 조회 — 이후 판정은 동기로 한다 */
export async function lockedYmsByBrand(
  supabase: AnyClient,
  brands: Iterable<string>
): Promise<Map<string, Set<string>>> {
  const uniq = Array.from(new Set(Array.from(brands).filter(Boolean)));
  const sets = await Promise.all(uniq.map((b) => lockedYms(supabase as SupabaseClient, b)));
  return new Map(uniq.map((b, i) => [b, sets[i]]));
}

export const isLockedYm = (
  locked: Map<string, Set<string>>,
  brand: string | null | undefined,
  ym: string | null | undefined
): boolean => !!(brand && ym && locked.get(brand)?.has(ym));
