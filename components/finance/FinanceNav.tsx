'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 재무 하위 내비게이션 — 모든 /finance 하위 페이지 상단에 고정 노출.
const LEFT = [
  { href: '/finance/classify', label: '거래 분류' },
  { href: '/finance/cashflow', label: '월별 요약' },
  { href: '/finance/dashboard', label: '대시보드' },
  { href: '/finance/flow', label: '자금 흐름' },
  { href: '/finance/pnl', label: '관리손익' },
  { href: '/finance/close', label: '월 확정' },
];
const ADMIN = [
  { href: '/finance/categories', label: '계정과목' },
  { href: '/finance/members', label: '멤버 관리' },
];

export default function FinanceNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  if (!role) return null;
  const isStaff = ['admin', 'classifier'].includes(role);
  const isAdmin = role === 'admin';
  // viewer(팀원)는 대시보드만 노출 (원본·분류·업로드 등은 접근 불가)
  const leftItems = isStaff ? LEFT : [{ href: '/finance/dashboard', label: '대시보드' }];

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
      <div className="mx-auto flex max-w-[1680px] items-center gap-4 px-6 py-3">
        <span className="flex-1" />
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {leftItems.map(item)}
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-x-5 gap-y-2">
          {isAdmin && ADMIN.map(item)}
        </div>
      </div>
    </nav>
  );
}
