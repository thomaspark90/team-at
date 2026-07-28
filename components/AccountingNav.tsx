'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 회계 하위 내비게이션 — 대시보드 | 송금(집행) | 기장·결산 세 그룹을 '|' 로 구분.
// 대시보드·송금은 로그인한 전 직원, 기장·결산은 admin/classifier, 계정과목은 admin 만.
const HOME = [{ href: '/dashboard', label: '대시보드' }];
const TRANSFER = [
  { href: '/dashboard/transfer', label: '송금 요청' },
  { href: '/dashboard/history', label: '송금 설정' },
];
const BOOKKEEPING = [
  { href: '/finance', label: '자료 입력' },
  { href: '/finance/upload/garden', label: '가든 업로드' },
  { href: '/finance/upload/staffmeal', label: '스탭밀 업로드' },
  { href: '/finance/classify', label: '자료 분류' },
  { href: '/finance/uploads', label: '자료 이력' },
];
const CLOSING = [{ href: '/finance/close', label: '월 확정' }];
const ADMIN = [{ href: '/finance/categories', label: '계정과목' }];

export default function AccountingNav({ role, scoped = false }: { role: string | null; scoped?: boolean }) {
  const pathname = usePathname();
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  // 브랜드 스코프 멤버(예: 스탭밀 담당자)는 분류가 홈 — 가든 운영 메뉴는 숨김, 송금은 전 직원 기능이라 유지
  const groups = scoped
    ? [[{ href: '/finance/classify', label: '자료 분류' }], TRANSFER]
    : [
        HOME,
        TRANSFER,
        ...(isStaff ? [BOOKKEEPING, [...CLOSING, ...(role === 'admin' ? ADMIN : [])]] : []),
      ];

  return (
    <nav className="border-b border-border bg-card/40">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 py-3">
        {groups.map((group, gi) => (
          <span key={gi} className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {gi > 0 && <span className="select-none text-[12px] text-border">|</span>}
            {group.map(({ href, label }) => {
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
          </span>
        ))}
      </div>
    </nav>
  );
}
