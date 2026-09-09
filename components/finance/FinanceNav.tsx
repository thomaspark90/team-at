'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isOwner } from '@/lib/finance/access';
import { UNITS, unitOf, type UnitId } from '@/lib/finance/types';
import LocalNav from '@/components/nav/LocalNav';
import NavLink from '@/components/nav/NavLink';
import NavMenu from '@/components/nav/NavMenu';
import SegmentControl from '@/components/nav/SegmentControl';

// 리포트(분석·보고) 로컬 내비 — 한 줄(2026-09-09 소프트 UI 내비 통합; 이전엔 매장 필 + 메뉴 = 2단):
//   [세그먼트: 스탭밀 | 양재 | 판교]  지표 · 가설 · 관리손익 · 월별 요약 · 자금 흐름 · 관리 ▾(멤버·활동 로그)
// 기장·결산(분류·월확정 등)은 회계 탭(AccountingNav). 개인 단위는 손익 제외라 없다.
const REPORT_UNITS = UNITS.filter((u) => u.id !== 'personal');
const UNIT_SHORT: Record<Exclude<UnitId, 'personal'>, string> = { staffmeal: '스탭밀', yangjae: '가든 양재', pangyo: '가든 판교' };

const LEFT = [
  { href: '/finance/metrics', label: '지표' },
  { href: '/finance/hypothesis', label: '가설' },
  { href: '/finance/pnl', label: '관리손익' },
  { href: '/finance/cashflow', label: '월별 요약' },
  { href: '/finance/flow', label: '자금 흐름' },
];

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
  // viewer(팀원)는 지표만
  const leftItems = isStaff ? LEFT : [LEFT[0]];

  const unit = unitOf(searchParams.get('unit')) ?? REPORT_UNITS[0];
  const u = unit.id as Exclude<UnitId, 'personal'>;
  const unitHref = (id: UnitId) => `${pathname}?unit=${id}`;
  const link = (href: string, label: string) => ({ href: `${href}?unit=${u}`, label, active: pathname === href });

  const ADMIN = [link('/finance/members', '멤버 관리'), ...(owner ? [link('/finance/activity', '활동 로그')] : [])];

  return (
    <LocalNav
      lead={
        <SegmentControl
          ariaLabel="리포트 매장"
          value={u}
          items={REPORT_UNITS.map((x) => ({ id: x.id, label: UNIT_SHORT[x.id as Exclude<UnitId, 'personal'>], href: unitHref(x.id) }))}
        />
      }
    >
      {leftItems.map((it) => (
        <NavLink key={it.href} {...link(it.href, it.label)} />
      ))}
      {isAdmin && <NavMenu label="관리" items={ADMIN} />}
    </LocalNav>
  );
}
