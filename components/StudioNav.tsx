'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { STUDIO_TABS, tabForPath } from '@/lib/studio/tabs';
import { fetchMyAccess } from '@/lib/access/tab-access-client';
import LocalNav from '@/components/nav/LocalNav';
import NavLink from '@/components/nav/NavLink';

// 스탭밀 로컬 내비 — 한 줄(2026-09-09 소프트 UI 내비 통합, 가든·회계·리포트와 같은 LocalNav 문법).
// 송금 요청·관리는 전체 대시보드(/dashboard)로 이동.
// 설정의 '스탭밀 탭 권한'에서 사용자별로 허용된 탭만 활성, 미허용은 흐리게 자리 유지, 미허용 경로 직접 접근은 첫 허용 탭으로.
export default function StudioNav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = 로딩 중, null = 전체 허용
  const [allowed, setAllowed] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    // TabNav와 같은 응답을 쓰므로 공유 캐시로 중복 fetch를 없앤다
    fetchMyAccess().then((a) => setAllowed(a.mineStudio));
  }, []);

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
    <LocalNav>
      {STUDIO_TABS.map(({ key, href, label, desc }) => (
        <NavLink key={href} href={href} label={label} title={desc} active={pathname === href} disabled={!isTabAllowed(key)} />
      ))}
    </LocalNav>
  );
}
