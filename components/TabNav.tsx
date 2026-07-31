'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const TABS = [
  { href: '/studio', label: 'Staff Meal' },
  { href: '/garden', label: 'Garden Service' },
  { href: '/dashboard', label: '회계' },
  { href: '/finance/dashboard', label: '리포트' },
];

// 회계 탭에 속하는 /finance 하위 페이지(기장·결산) — 나머지 /finance 는 리포트(분석) 탭.
const ACCOUNTING_FINANCE = ['/finance', '/finance/classify', '/finance/uploads', '/finance/close', '/finance/categories', '/finance/card'];
const inAccounting = (p: string) =>
  p.startsWith('/dashboard') ||
  ACCOUNTING_FINANCE.some((h) => p === h || (h !== '/finance' && p.startsWith(h + '/')));

export default function TabNav() {
  const pathname = usePathname();
  const router = useRouter();
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
          {TABS.map((tab) => {
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

        <button
          onClick={handleLogout}
          className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
