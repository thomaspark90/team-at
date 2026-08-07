'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 스탭밀 하위 내비게이션 — /studio 하위 페이지 상단에 고정 노출.
// 송금 요청·관리는 전체 대시보드(/dashboard)로 이동.
const ITEMS = [
  { href: '/studio', label: '대시보드' },
  { href: '/studio/menu', label: 'IG 메뉴 업데이트' },
  { href: '/studio/meals', label: '메뉴 기록' },
  { href: '/studio/sales', label: '매출' },
  { href: '/studio/settings', label: '설정' },
];

export default function StudioNav() {
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
