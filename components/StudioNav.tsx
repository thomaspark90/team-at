'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { STUDIO_TABS, tabForPath } from '@/lib/studio/tabs';
import { fetchMyAccess } from '@/lib/access/tab-access-client';

// 스탭밀 하위 내비게이션 — /studio 하위 페이지 상단에 고정 노출.
// 송금 요청·관리는 전체 대시보드(/dashboard)로 이동.
// 설정의 '스탭밀 탭 권한'에서 사용자별로 허용된 탭만 보여주고, 미허용 경로는 허용 탭으로 돌려보낸다.
export default function StudioNav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = 로딩 중, null = 전체 허용
  const [allowed, setAllowed] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    // TabNav와 같은 응답을 쓰므로 공유 캐시로 중복 fetch를 없앤다
    fetchMyAccess().then((a) => setAllowed(a.mineStudio));
  }, []);

  // 미허용 탭에 직접 접근하면 첫 허용 탭으로 리다이렉트
  useEffect(() => {
    if (!Array.isArray(allowed)) return;
    const current = tabForPath(pathname);
    if (current && !allowed.includes(current.key)) {
      const first = STUDIO_TABS.find((t) => allowed.includes(t.key));
      router.replace(first?.href ?? '/');
    }
  }, [allowed, pathname, router]);

  const isTabAllowed = (key: string) => !Array.isArray(allowed) || allowed.includes(key);

  return (
    <nav className="border-b border-border bg-card/40">
      {/* 미허용 탭도 지우지 않고 비활성 텍스트로 둔다(2026-08-09, GardenNav·TabNav와 동일 처리) */}
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 py-3">
        {STUDIO_TABS.map(({ key, href, label, desc }) => {
          if (!isTabAllowed(key)) {
            return (
              <span
                key={href}
                aria-disabled="true"
                title={desc ? `${desc} — 접근 권한이 없어요` : '접근 권한이 없어요'}
                className="cursor-not-allowed whitespace-nowrap text-[13px] text-muted-foreground/40"
              >
                {label}
              </span>
            );
          }
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
    </nav>
  );
}
