'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';
import { SECTIONS, inAccounting } from '@/lib/access/sections';

const TABS = SECTIONS.map((s) => ({ href: s.href, label: s.label, key: s.key }));

export default function TabNav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = 로딩 중, null = 전체 허용. 실제 차단은 미들웨어가 하고 여기선 숨김만.
  const [allowed, setAllowed] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/garden-tab-access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { sections: null }))
      .then((j) => setAllowed(j.sections ?? null))
      .catch(() => setAllowed(null));
  }, []);
  // 회계·리포트 화면에서는 하위 내비(max-w-1680)와 좌우 끝을 맞춘다
  const wide = pathname?.startsWith('/finance') || pathname?.startsWith('/dashboard');

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <header className="border-b border-border bg-background">
      <div className={`mx-auto flex h-12 items-center justify-between gap-2 px-4 sm:gap-6 sm:px-6 ${wide ? 'max-w-[1680px]' : 'max-w-[1100px]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-team-at.png" alt="TEAM at" className="h-6 w-auto shrink-0 dark:invert" />

        {/* 모바일에선 좌측 정렬 — justify-center+overflow 조합은 넘친 왼쪽이 스크롤 불가로 잘리고,
            오른쪽 탭이 반쯤 걸쳐 보이는 것이 "더 있다"는 스크롤 단서가 된다 */}
        <nav className="scrollbar-hide flex flex-1 items-center justify-start gap-1 overflow-x-auto sm:justify-center">
          {TABS.filter((t) => !Array.isArray(allowed) || allowed.includes(t.key)).map((tab) => {
            const p = pathname ?? '';
            const active =
              tab.href === '/dashboard'
                ? inAccounting(p)
                : tab.href === '/finance/dashboard'
                  ? p.startsWith('/finance') && !inAccounting(p)
                  : p === tab.href || p.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[13px] transition-colors sm:px-3 ${
                  active
                    ? 'font-medium text-foreground underline decoration-foreground/30 underline-offset-[10px]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
