'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GARDEN_NAV, GARDEN_TABS, WORDS_CHANGED_EVENT, tabForPath } from '@/lib/garden/tabs';
import { REVIEWS_CHANGED_EVENT } from '@/lib/garden/review-constants';
import { fetchMyAccess } from '@/lib/access/tab-access-client';
import LocalNav from '@/components/nav/LocalNav';
import NavLink from '@/components/nav/NavLink';
import NavMenu from '@/components/nav/NavMenu';

// 가든 로컬 내비 — 한 줄: 작업 보드 · 운영 ▾ · 레시피 ▾ · 분석 ▾ · 교육 · 설정 (구성은 lib/garden/tabs.ts GARDEN_NAV).
// 2026-09-09 탭 14개 나열 → 묶음으로 접음(소프트 UI 내비 통합). 권한·배지·리다이렉트 동작은 이전과 같다:
//  · 설정의 '가든 탭 권한'에서 허용된 탭만 활성, 미허용은 흐리게 자리 유지(왜 못 가는지 보이게).
//  · 미허용 경로 직접 접근 → 첫 허용 탭으로.
//  · 배지: 네이버 리뷰(처리 필요)·판매가 설정(책정 대기)·제철 단어(검수 대기). 묶음 라벨엔 합계.
export default function GardenNav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = 로딩 중, null = 전체 허용
  const [allowed, setAllowed] = useState<string[] | null | undefined>(undefined);
  const [reviewCount, setReviewCount] = useState(0);
  const [unpricedCount, setUnpricedCount] = useState(0);
  const [pendingWords, setPendingWords] = useState(0);

  useEffect(() => {
    // TabNav와 같은 응답을 쓰므로 공유 캐시로 중복 fetch를 없앤다
    fetchMyAccess().then((a) => setAllowed(a.mine));
  }, []);

  useEffect(() => {
    if (Array.isArray(allowed) && !allowed.includes('reviews')) return;
    const refresh = () =>
      fetch('/api/garden-reviews/count', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((j) => setReviewCount(j.count ?? 0))
        .catch(() => {});
    refresh();
    window.addEventListener(REVIEWS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(REVIEWS_CHANGED_EVENT, refresh);
  }, [allowed, pathname]);

  useEffect(() => {
    if (Array.isArray(allowed) && !allowed.includes('saleprice')) return;
    fetch('/api/purchases?scope=unpriced-count', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((j) => setUnpricedCount(j.count ?? 0))
      .catch(() => {});
  }, [allowed, pathname]);

  useEffect(() => {
    if (Array.isArray(allowed) && !allowed.includes('words')) return;
    const refresh = () =>
      fetch('/api/garden-words?scope=pending-count', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((j) => setPendingWords(j.count ?? 0))
        .catch(() => {});
    refresh();
    window.addEventListener(WORDS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WORDS_CHANGED_EVENT, refresh);
  }, [allowed, pathname]);

  // 미허용 탭에 직접 접근하면 첫 허용 탭으로 리다이렉트
  useEffect(() => {
    if (!Array.isArray(allowed)) return;
    const current = tabForPath(pathname);
    if (current && !allowed.includes(current.key)) {
      const first = GARDEN_TABS.find((t) => allowed.includes(t.key));
      router.replace(first?.href ?? '/');
    }
  }, [allowed, pathname, router]);

  const visible = (key: string) => !Array.isArray(allowed) || allowed.includes(key);
  const badgeOf = (key: string) =>
    key === 'reviews' ? reviewCount : key === 'saleprice' ? unpricedCount : key === 'words' ? pendingWords : 0;
  const current = tabForPath(pathname);

  const itemOf = (key: string) => {
    const t = GARDEN_TABS.find((x) => x.key === key)!;
    return {
      href: t.href,
      label: t.label,
      title: t.desc,
      active: current?.key === key,
      disabled: !visible(key),
      badge: visible(key) ? badgeOf(key) : 0,
    };
  };

  // 설정도 같은 줄 끝에 — 오른쪽 슬롯은 모바일에서 숨겨져 설정에 못 들어가게 된다
  return (
    <LocalNav>
      {GARDEN_NAV.map((e) =>
        e.keys.length === 1 ? (
          <NavLink key={e.label} {...itemOf(e.keys[0])} />
        ) : (
          <NavMenu key={e.label} label={e.label} items={e.keys.map(itemOf)} />
        ),
      )}
    </LocalNav>
  );
}
