'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { UNITS, unitOf, type UnitId } from '@/lib/finance/types';

// 회계 내비 — 2단 구조 (2026-07-31 대표 지시):
//   1단: 회계 단위 선택 — 스탭밀 | 가든서비스(양재천점) | 가든서비스(판교점)
//   2단: 선택된 단위 소속 메뉴 — 대시보드 | 송금 요청·송금 설정 | 자료 입력·지출 자료 분류·자료 이력 | 월 확정·설정
// 단위는 URL(?unit= 또는 /finance/upload/[unit])로 전달되고, 모든 메뉴 링크가 단위를 실어 나른다.

const UNIT_TAB_LABEL: Record<UnitId, string> = {
  staffmeal: '스탭밀',
  yangjae: '가든서비스(양재천점)',
  pangyo: '가든서비스(판교점)',
  personal: '개인',
};

export default function AccountingNav({ role, scoped = false }: { role: string | null; scoped?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isStaff = ['admin', 'classifier'].includes(role ?? '');

  // 현재 단위: 업로드 경로 세그먼트 > ?unit= > 기본 스탭밀
  const uploadMatch = pathname.match(/^\/finance\/upload\/([^/]+)/);
  const unit =
    unitOf(uploadMatch?.[1]) ?? unitOf(searchParams.get('unit')) ?? UNITS[0];

  // 단위 전환 — 지금 보고 있는 페이지를 유지한 채 단위만 바꾼다.
  // 개인 단위는 지출 분류 화면 전용(자료입력·월확정·POS 개념 없음)이라 항상 분류로 보낸다.
  const unitHref = (id: UnitId) =>
    id === 'personal'
      ? '/finance/classify?unit=personal'
      : uploadMatch
      ? `/finance/upload/${id}`
      : `${pathname}?unit=${id}`;

  const u = unit.id;
  const isPersonal = u === 'personal';
  const HOME = [{ href: '/dashboard', label: '대시보드' }];
  const TRANSFER = [
    { href: '/dashboard/transfer', label: '송금 요청' },
    { href: '/dashboard/history', label: '송금 설정' },
  ];
  const BOOKKEEPING = [
    { href: `/finance/upload/${u}`, label: '자료 입력' },
    { href: '/finance/classify', label: '지출 자료 분류' },
    { href: '/finance/uploads', label: '자료 이력' },
    { href: '/finance/originals', label: '원본 자료함' },
  ];
  const CLOSING = [{ href: '/finance/close', label: '월 확정' }];
  const ADMIN = [{ href: '/finance/categories', label: '설정' }];

  // 개인 단위 — 손익 제외 사적 지출 정리 전용. 자료입력·월확정·설정 없이 분류만.
  const PERSONAL = [{ href: '/finance/classify', label: '개인 지출 분류' }];

  // 브랜드 스코프 멤버 — 단위 탭 없이(서버 리다이렉트로 강제) 분류+송금만
  const groups = scoped
    ? [[{ href: '/finance/classify', label: '지출 자료 분류' }], TRANSFER]
    : isPersonal
    ? [PERSONAL]
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
      {/* 1단: 회계 단위 — 모바일에서 줄바꿈 대신 가로 스크롤 한 줄(2026-08-08 대표 지시).
          w-max + mx-auto: 넓으면 가운데 정렬, 좁으면 왼쪽부터 시작해 끝까지 스크롤 가능
          (overflow 상태에서 justify-center 를 쓰면 앞쪽 탭이 잘려 접근 불가). */}
      {!scoped && (
        <div className="mx-auto max-w-[1680px] overflow-x-auto px-6 pt-3">
          <div className="mx-auto flex w-max items-center gap-2">
            {UNITS.map((x) => {
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
                  {UNIT_TAB_LABEL[x.id]}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {/* 2단: 선택된 단위의 메뉴 */}
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 py-3">
        {groups.map((group, gi) => (
          <span key={gi} className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {gi > 0 && <span className="select-none text-[11px] text-border">|</span>}
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
