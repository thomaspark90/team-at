'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const TABS = [
  { href: '/studio', label: 'Staff Meal' },
  { href: '/garden', label: 'Garden Service' },
  { href: '/finance', label: '재무' },
];

export default function TabNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-12 max-w-[1100px] items-center justify-between gap-2 px-4 sm:gap-6 sm:px-6">
        <span className="shrink-0 font-serif text-[15px] tracking-tight text-foreground">team-at</span>

        <nav className="scrollbar-hide flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[13px] transition-colors sm:px-3 ${
                  active
                    ? 'text-foreground'
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
          className="shrink-0 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
