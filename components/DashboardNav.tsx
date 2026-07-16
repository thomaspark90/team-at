'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 전체 대시보드 하위 내비게이션 — /dashboard 하위 페이지 상단에 고정 노출.
const ITEMS = [
  { href: '/dashboard', label: '송금 요청' },
  { href: '/dashboard/history', label: '송금 관리' },
];

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="mx-auto flex max-w-[1100px] items-center justify-center gap-x-5 px-6 py-3">
        {ITEMS.map(({ href, label }) => {
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
