// 내 접근 권한(/api/garden-tab-access?scope=mine) 클라이언트 공유 캐시.
// TabNav(섹션)와 GardenNav(가든 탭)가 같은 응답의 다른 키를 읽으면서 페이지마다
// 각각 fetch하던 것을 하나로 합친다 — 동시 마운트 시 1회, 짧은 TTL 안 재탐색 시 0회.
// 실제 차단은 미들웨어가 하므로 이 값은 '숨김 표시'용 — 짧은 지연은 무해하다.

export type MyAccess = { mine: string[] | null; sections: string[] | null };

const TTL_MS = 30_000;

let cached: { at: number; promise: Promise<MyAccess> } | null = null;

export function fetchMyAccess(): Promise<MyAccess> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = fetch('/api/garden-tab-access?scope=mine', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((j: { mine?: string[] | null; sections?: string[] | null }) => ({
      mine: j?.mine ?? null,
      sections: j?.sections ?? null,
    }))
    .catch(() => {
      cached = null; // 실패 응답은 캐시하지 않는다 — 다음 호출이 다시 시도
      return { mine: null, sections: null }; // 조회 실패 시 막지 않는다 (내부 도구)
    });
  cached = { at: Date.now(), promise };
  return promise;
}
