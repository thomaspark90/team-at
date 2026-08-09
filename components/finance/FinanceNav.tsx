'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isOwner } from '@/lib/finance/access';

// 리포트(분석·보고) 하위 내비게이션 — 기장·결산(분류·월확정 등)은 회계 탭(AccountingNav)으로 이동.
const LEFT = [
  { href: '/finance/dashboard', label: '리포트 홈' },
  { href: '/finance/metrics', label: '지표' },
  { href: '/finance/pnl', label: '관리손익' },
  { href: '/finance/cashflow', label: '월별 요약' },
  { href: '/finance/flow', label: '자금 흐름' },
];
const ADMIN = [{ href: '/finance/members', label: '멤버 관리' }];
// 활동 로그는 대표(OWNER) 계정에만 노출
const OWNER_ONLY = { href: '/finance/activity', label: '활동 로그' };

export default function FinanceNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setOwner(isOwner(data.user?.email)))
      .catch(() => setOwner(false));
  }, []);
  if (!role) return null;
  const isStaff = ['admin', 'classifier'].includes(role);
  const isAdmin = role === 'admin';
  // viewer(팀원)는 지표만 노출 (업무 보드·원본·분류·업로드 등은 접근 불가)
  const leftItems = isStaff ? LEFT : [{ href: '/finance/metrics', label: '지표' }];

  const item = ({ href, label }: { href: string; label: string }) => {
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
          {isAdmin && owner && item(OWNER_ONLY)}
        </div>
      </div>
    </nav>
  );
}
