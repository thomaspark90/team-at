'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GARDEN_TAB_GROUPS, tabForPath } from '@/lib/garden/tabs';

// 가든 하위 내비게이션 — /garden 하위 페이지 상단에 노출 (FinanceNav와 동일 문법)
// 설정의 '가든 탭 권한'에서 사용자별로 허용된 탭만 보여주고, 미허용 경로는 허용 탭으로 돌려보낸다.
export default function GardenNav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = 로딩 중, null = 전체 허용
  const [allowed, setAllowed] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/garden-tab-access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { mine: null }))
      .then((j) => setAllowed(j.mine ?? null))
      .catch(() => setAllowed(null)); // 조회 실패 시 막지 않는다 (내부 도구)
  }, []);

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
      {/* 모바일에선 항목이 뷰포트보다 넓어 페이지가 가로로 밀렸음 — 줄바꿈 허용 */}
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-4 py-3 sm:px-6">
        {GARDEN_TAB_GROUPS.map((tabs) => tabs.filter((t) => visible(t.key)))
          .filter((tabs) => tabs.length > 0)
          .map((shown, i) => (
            <div key={shown[0].key} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {i > 0 && <span aria-hidden className="h-3 w-px bg-border" />}
              {shown.map(({ href, label }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`whitespace-nowrap text-[13px] transition-colors ${
                      active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
      </div>
    </nav>
  );
}
