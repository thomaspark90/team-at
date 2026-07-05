'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 재무 하위 내비게이션 — 모든 /finance 하위 페이지 상단에 고정 노출.
const LEFT = [
  { href: '/finance/classify', label: '거래 분류' },
  { href: '/finance/cashflow', label: '통장 현황' },
  { href: '/finance/dashboard', label: '대시보드' },
  { href: '/finance/flow', label: '자금 흐름' },
  { href: '/finance/close', label: '월 확정' },
];
const ADMIN = [
  { href: '/finance/categories', label: '계정과목' },
  { href: '/finance/members', label: '멤버 관리' },
];

export default function FinanceNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  if (!role || !['admin', 'classifier'].includes(role)) return null;
  const isAdmin = role === 'admin';

  const item = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`whitespace-nowrap text-[13px] transition-colors ${
          active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
        {LEFT.map(item)}
        <span className="flex-1" />
        {isAdmin && ADMIN.map(item)}
      </div>
    </nav>
  );
}
