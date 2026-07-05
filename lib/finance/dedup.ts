import { createHash } from 'crypto';
import type { createClient } from '@/lib/supabase/server';

// 재업로드 중복 차단용 지문 — 여러 필드를 이어붙여 sha256 앞 32자.
// 은행/카드/영수증 파서·라우트가 공통으로 사용한다.
export const hash = (...parts: (string | number)[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);

// transactions.dedup_hash 존재 여부를 청크(100개씩)로 조회 — IN 절 URL 길이 회피.
// 업로드/저장 라우트가 공통으로 신규 vs 기존 판정에 사용한다.
export async function fetchExistingHashes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hashes: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < hashes.length; i += 100) {
    const { data } = await supabase
      .schema('finance')
      .from('transactions')
      .select('dedup_hash')
      .in('dedup_hash', hashes.slice(i, i + 100));
    (data ?? []).forEach((e: { dedup_hash: string }) => set.add(e.dedup_hash));
  }
  return set;
}
