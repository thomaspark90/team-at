'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle, { ThemeOptions } from '@/components/ThemeToggle';
import { SECTIONS, inAccounting } from '@/lib/access/sections';

const TABS = SECTIONS.map((s) => ({ href: s.href, label: s.label, key: s.key }));

export default function TabNav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = 로딩 중, null = 전체 허용. 실제 차단은 미들웨어가 하고 여기선 숨김만.
  const [allowed, setAllowed] = useState<string[] | null | undefined>(undefined);
  // 모바일 햄버거 메뉴 — 좁은 화면에서 섹션·테마·로그아웃을 패널로 정리(2026-08-08)
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch('/api/garden-tab-access?scope=mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { sections: null }))
      .then((j) => setAllowed(j.sections ?? null))
      .catch(() => setAllowed(null));
  }, []);

  // 페이지 이동 시 햄버거 메뉴 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  // 회계·리포트 화면에서는 하위 내비(max-w-1680)와 좌우 끝을 맞춘다
  const wide = pathname?.startsWith('/finance') || pathname?.startsWith('/dashboard');

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    // relative — 모바일 햄버거 패널(absolute)이 헤더 바로 아래에 겹쳐 뜨는 기준
    <header className="relative border-b border-border bg-background">
      <div className={`mx-auto flex h-12 items-center justify-between gap-2 px-4 sm:gap-6 sm:px-6 ${wide ? 'max-w-[1680px]' : 'max-w-[1100px]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-team-at.png" alt="TEAM at" className="h-6 w-auto shrink-0 dark:invert" />

        {/* 모바일에선 섹션 링크를 숨기고 햄버거 패널에 넣는다 — 가로 스크롤로 잘려 보이던 문제 해소 */}
        <nav className="scrollbar-hide hidden flex-1 items-center justify-center gap-1 overflow-x-auto sm:flex">
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

        {/* 데스크톱 — 테마 드롭다운 + 로그아웃 */}
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            로그아웃
          </button>
        </div>

        {/* 모바일 — 햄버거 버튼 */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={menuOpen}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground sm:hidden"
        >
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* 모바일 햄버거 패널 — 헤더 아래를 통째로 덮는 풀스크린 화이트 레이어(FRAMA 무드).
          본문을 밀어내지 않고, 접힘/펼침은 트랜지션(닫힘 애니메이션을 위해 항상 렌더). */}
      <nav
        aria-label="모바일 메뉴"
        aria-hidden={!menuOpen}
        className={`absolute left-0 right-0 top-full z-40 h-[calc(100dvh-3rem)] overflow-y-auto bg-background/95 backdrop-blur-sm transition-all duration-200 ease-out sm:hidden ${
          menuOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'
        }`}
      >
        <div className="flex h-full flex-col px-6 pb-8 pt-7">
          {/* 섹션 링크 — 큰 타이포, 현재 위치만 진하게 */}
          <div className="flex flex-col">
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
                  onClick={() => setMenuOpen(false)}
                  className={`py-2 text-[20px] leading-snug tracking-[-0.3px] transition-colors ${
                    active ? 'font-medium text-foreground' : 'text-foreground/55 hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* 하단 유틸리티 — 헤어라인 구분의 조용한 행들 */}
          <div className="flex items-center justify-between border-t border-border py-3.5">
            <span className="text-[13px] text-muted-foreground">테마</span>
            <ThemeOptions />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-between border-t border-border py-3.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            로그아웃
            <span aria-hidden>→</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
