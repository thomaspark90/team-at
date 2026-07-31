'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { UNITS, unitOf, type UnitId } from '@/lib/finance/types';

// 회계 내비 — 2단 구조 (2026-07-31 대표 지시):
//   1단: 회계 단위 선택 — 스탭밀 | 가든서비스(양재천점) | 가든서비스(판교점)
//   2단: 선택된 단위 소속 메뉴 — 대시보드 | 송금 요청·송금 설정 | 자료 입력·자료 분류·자료 이력 | 월 확정·계정과목
// 단위는 URL(?unit= 또는 /finance/upload/[unit])로 전달되고, 모든 메뉴 링크가 단위를 실어 나른다.

const UNIT_TAB_LABEL: Record<UnitId, string> = {
  staffmeal: '스탭밀',
  yangjae: '가든서비스(양재천점)',
  pangyo: '가든서비스(판교점)',
};

export default function AccountingNav({ role, scoped = false }: { role: string | null; scoped?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isStaff = ['admin', 'classifier'].includes(role ?? '');

  // 현재 단위: 업로드 경로 세그먼트 > ?unit= > 기본 스탭밀
  const uploadMatch = pathname.match(/^\/finance\/upload\/([^/]+)/);
  const unit =
    unitOf(uploadMatch?.[1]) ?? unitOf(searchParams.get('unit')) ?? UNITS[0];

  // 단위 전환 — 지금 보고 있는 페이지를 유지한 채 단위만 바꾼다
  const unitHref = (id: UnitId) =>
    uploadMatch ? `/finance/upload/${id}` : `${pathname}?unit=${id}`;

  const u = unit.id;
  const HOME = [{ href: '/dashboard', label: '대시보드' }];
  const TRANSFER = [
    { href: '/dashboard/transfer', label: '송금 요청' },
    { href: '/dashboard/history', label: '송금 설정' },
  ];
  const BOOKKEEPING = [
    { href: `/finance/upload/${u}`, label: '자료 입력' },
    { href: '/finance/classify', label: '자료 분류' },
    { href: '/finance/uploads', label: '자료 이력' },
  ];
  const CLOSING = [{ href: '/finance/close', label: '월 확정' }];
  const ADMIN = [{ href: '/finance/categories', label: '계정과목' }];

  // 브랜드 스코프 멤버 — 단위 탭 없이(서버 리다이렉트로 강제) 분류+송금만
  const groups = scoped
    ? [[{ href: '/finance/classify', label: '자료 분류' }], TRANSFER]
    : [
        HOME,
        TRANSFER,
        ...(isStaff ? [BOOKKEEPING, [...CLOSING, ...(role === 'admin' ? ADMIN : [])]] : []),
      ];

  // 링크에 단위 실어 보내기 — 업로드 경로는 세그먼트에 이미 포함
  const withUnit = (href: string) => (href.startsWith('/finance/upload/') ? href : `${href}?unit=${u}`);
  const isActive = (href: string) => {
    if (href.startsWith('/finance/upload/')) return !!uploadMatch;
    return pathname === href;
  };

  return (
    <nav className="border-b border-border bg-card/40">
      {/* 1단: 회계 단위 */}
      {!scoped && (
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-center gap-x-2 gap-y-1 px-6 pt-3">
          {UNITS.map((x) => {
            const on = x.id === u;
            return (
              <Link
                key={x.id}
                href={unitHref(x.id)}
                aria-current={on ? 'page' : undefined}
                className={`rounded-full px-3.5 py-1 text-[13px] transition-colors ${
                  on
                    ? 'bg-foreground font-medium text-background'
                    : 'border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {UNIT_TAB_LABEL[x.id]}
              </Link>
            );
          })}
        </div>
      )}
      {/* 2단: 선택된 단위의 메뉴 */}
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 py-3">
        {groups.map((group, gi) => (
          <span key={gi} className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {gi > 0 && <span className="select-none text-[12px] text-border">|</span>}
            {group.map(({ href, label }) => {
              const active = isActive(href);
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
            })}
          </span>
        ))}
      </div>
    </nav>
  );
}
