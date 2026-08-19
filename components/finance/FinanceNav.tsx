'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isOwner } from '@/lib/finance/access';
import { UNITS, unitOf, type UnitId } from '@/lib/finance/types';

// 리포트(분석·보고) 하위 내비게이션 — 기장·결산(분류·월확정 등)은 회계 탭(AccountingNav)으로 이동.
// 2026-08-19: 회계와 동일한 2단 구조로 통일 — 1단 매장 필(스탭밀/양재천/판교, 개인은 손익 제외라 없음)이
// 모든 리포트 화면에 공통 적용되고, 페이지별로 따로 있던 브랜드·지점 토글은 이 필 하나로 대체한다.
const REPORT_UNITS = UNITS.filter((u) => u.id !== 'personal');
const UNIT_TAB_LABEL: Record<Exclude<UnitId, 'personal'>, string> = {
  staffmeal: '스탭밀',
  yangjae: '가든서비스(양재천점)',
  pangyo: '가든서비스(판교점)',
};

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
  const searchParams = useSearchParams();
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

  const unit = unitOf(searchParams.get('unit')) ?? REPORT_UNITS[0];
  const u = unit.id as Exclude<UnitId, 'personal'>;
  // 단위 전환 — 지금 보고 있는 리포트 화면을 유지한 채 매장만 바꾼다.
  const unitHref = (id: UnitId) => `${pathname}?unit=${id}`;
  const withUnit = (href: string) => `${href}?unit=${u}`;

  const item = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={withUnit(href)}
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
      {/* 1단: 매장 필 — 회계 내비(AccountingNav)와 동일한 스타일·매장 구성 */}
      <div className="mx-auto max-w-[1680px] overflow-x-auto px-6 pt-3">
        <div className="mx-auto flex w-max items-center gap-2">
          {REPORT_UNITS.map((x) => {
            const on = x.id === u;
            return (
              <Link
                key={x.id}
                href={unitHref(x.id)}
                aria-current={on ? 'page' : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1 text-[13px] transition-colors ${
                  on
                    ? 'bg-foreground font-medium text-background'
                    : 'border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {UNIT_TAB_LABEL[x.id as Exclude<UnitId, 'personal'>]}
              </Link>
            );
          })}
        </div>
      </div>
      {/* 2단: 리포트 메뉴 — 선택된 매장을 실어 나른다 */}
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
