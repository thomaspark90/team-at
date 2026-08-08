'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GARDEN_TAB_GROUPS, WORDS_CHANGED_EVENT, tabForPath } from '@/lib/garden/tabs';
import { REVIEWS_CHANGED_EVENT } from '@/lib/garden/review-constants';
import { fetchMyAccess } from '@/lib/access/tab-access-client';

// 가든 하위 내비게이션 — /garden 하위 페이지 상단에 노출 (FinanceNav와 동일 문법)
// 설정의 '가든 탭 권한'에서 사용자별로 허용된 탭만 보여주고, 미허용 경로는 허용 탭으로 돌려보낸다.
export default function GardenNav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = 로딩 중, null = 전체 허용
  const [allowed, setAllowed] = useState<string[] | null | undefined>(undefined);
  // 네이버 리뷰 탭 배지 — 액션 필요 건수. 부가 정보라 실패해도 조용히 스킵
  const [reviewCount, setReviewCount] = useState(0);
  // 판매가 설정 탭 배지 — 책정 대기(판매가 미책정) 발주 건수
  const [unpricedCount, setUnpricedCount] = useState(0);
  // 제철 단어 탭 배지 — 검수 대기(pending) 단어 건수
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
    // 인박스에서 처리(승인·건너뛰기 등)하면 페이지 이동 없이도 배지를 갱신한다
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
    // 제철 단어 화면에서 검수하면 페이지 이동 없이도 배지를 갱신한다
    window.addEventListener(WORDS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WORDS_CHANGED_EVENT, refresh);
  }, [allowed, pathname]);

  // 미허용 탭에 직접 접근하면 첫 허용 탭으로 리다이렉트
  useEffect(() => {
    if (!Array.isArray(allowed)) return;
    const current = tabForPath(pathname);
    if (current && !allowed.includes(current.key)) {
      const first = GARDEN_TAB_GROUPS.flat().find((t) => allowed.includes(t.key));
      router.replace(first?.href ?? '/');
    }
  }, [allowed, pathname, router]);

  const visible = (key: string) => !Array.isArray(allowed) || allowed.includes(key);

  return (
    <nav className="border-b border-border bg-card/40">
      {/* 링크를 한 컨테이너에 평탄화 — 그룹 div로 감싸면 그룹 통째로 줄바꿈돼 모바일에서
          '대시보드' 혼자 한 줄을 차지하는 식으로 4줄까지 늘어났다. 구분선은 데스크톱 전용. */}
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-start gap-x-4 gap-y-2 px-4 py-3 sm:justify-center sm:gap-x-5 sm:gap-y-1.5 sm:px-6">
        {GARDEN_TAB_GROUPS.map((tabs) => tabs.filter((t) => visible(t.key)))
          .filter((tabs) => tabs.length > 0)
          .map((shown, i) => (
            <Fragment key={shown[0].key}>
              {i > 0 && <span aria-hidden className="hidden h-3 w-px bg-border sm:block" />}
              {shown.map(({ key, href, label }) => {
                const active = pathname === href;
                const badge =
                  key === 'reviews' ? reviewCount
                  : key === 'saleprice' ? unpricedCount
                  : key === 'words' ? pendingWords
                  : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex items-center gap-1 whitespace-nowrap text-[13px] transition-colors ${
                      active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                    {badge > 0 && (
                      <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
                        {badge > 999 ? '999+' : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </Fragment>
          ))}
      </div>
    </nav>
  );
}
