'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 가든 하위 내비게이션 — /garden 하위 페이지 상단에 노출 (FinanceNav와 동일 문법)
const TABS = [
  { href: '/garden', label: '대시보드' },
  { href: '/garden/recipes', label: '필터 레시피' },
  { href: '/garden/recommended', label: '필터 레시피 추천' },
  { href: '/garden/pricing', label: '필터커피 가격 세팅' },
  { href: '/garden/calibration', label: '분쇄도 측정' },
  { href: '/garden/settings', label: '설정' },
];

export default function GardenNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-border bg-card/40">
      {/* 모바일에선 항목이 뷰포트보다 넓어 페이지가 가로로 밀렸음 — 줄바꿈 허용 */}
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-4 py-3 sm:px-6">
        {TABS.map(({ href, label }) => {
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
