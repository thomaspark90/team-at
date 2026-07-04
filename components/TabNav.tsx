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
      <div className="mx-auto flex h-12 max-w-[1100px] items-center justify-between gap-6 px-6">
        <span className="font-serif text-[15px] tracking-tight text-foreground">team-at</span>

        <nav className="flex flex-1 items-center gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
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
          className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
