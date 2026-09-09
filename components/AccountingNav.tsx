'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { UNITS, unitOf, type UnitId } from '@/lib/finance/types';
import LocalNav from '@/components/nav/LocalNav';
import NavLink from '@/components/nav/NavLink';
import NavMenu from '@/components/nav/NavMenu';
import SegmentControl from '@/components/nav/SegmentControl';

// 회계 로컬 내비 — 한 줄(2026-09-09 소프트 UI 내비 통합; 이전엔 단위 필 + 메뉴 2줄 = 3단):
//   [세그먼트: 스탭밀 | 양재 | 판교 | 개인]  회계 홈 · 자료 입력 · 전처리 ▾ · 지출 분류 · 송금 ▾ · 월 결산 · 더 보기 ▾
// 단위는 URL(?unit= 또는 /finance/upload/[unit])로 전달되고, 모든 메뉴 링크가 단위를 실어 나른다.
// 개인 단위 = 손익 제외 사적 지출 정리 전용(분류만). 브랜드 스코프 멤버(scoped) = 단위 없이 분류+송금만.

const UNIT_SHORT: Record<UnitId, string> = { staffmeal: '스탭밀', yangjae: '가든 양재', pangyo: '가든 판교', personal: '개인' };

export default function AccountingNav({ role, scoped = false }: { role: string | null; scoped?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  const isAdmin = role === 'admin';

  // 현재 단위: 업로드 경로 세그먼트 > ?unit= > 기본 스탭밀
  const uploadMatch = pathname.match(/^\/finance\/upload\/([^/]+)/);
  const unit = unitOf(uploadMatch?.[1]) ?? unitOf(searchParams.get('unit')) ?? UNITS[0];
  const u = unit.id;
  const isPersonal = u === 'personal';

  // 단위 전환 — 지금 보고 있는 페이지를 유지한 채 단위만 바꾼다. 개인은 항상 분류로.
  const unitHref = (id: UnitId) =>
    id === 'personal' ? '/finance/classify?unit=personal' : uploadMatch ? `/finance/upload/${id}` : `${pathname}?unit=${id}`;
  const withUnit = (href: string) => (href.startsWith('/finance/upload/') ? href : `${href}?unit=${u}`);
  const isActive = (href: string) => (href.startsWith('/finance/upload/') ? !!uploadMatch : pathname === href);
  const link = (href: string, label: string) => ({ href: withUnit(href), label, active: isActive(href) });

  const PREP = [
    link('/finance/raw', '로우데이터'),
    link('/finance/prep/expense', '1 지출'),
    link('/finance/prep/expense-detail', '2 지출구분'),
    link('/finance/prep/revenue', '3 매출'),
    link('/finance/prep/menu', '4 메뉴'),
    link('/finance/prep/hours', '5 시간대'),
  ];
  const TRANSFER = [link('/dashboard/transfer', '송금 요청'), link('/dashboard/history', '송금 설정')];
  const MORE = [link('/finance/uploads', '자료 이력'), link('/finance/originals', '원본 자료함'), ...(isAdmin ? [link('/finance/categories', '설정')] : [])];

  const lead = !scoped && (
    <SegmentControl
      ariaLabel="회계 단위"
      value={u}
      items={UNITS.map((x) => ({ id: x.id, label: UNIT_SHORT[x.id], href: unitHref(x.id) }))}
    />
  );

  if (scoped) {
    return (
      <LocalNav width="max-w-[1680px]">
        <NavLink {...link('/finance/classify', '지출 자료 분류')} />
        <NavMenu label="송금" items={TRANSFER} />
      </LocalNav>
    );
  }
  if (isPersonal) {
    return (
      <LocalNav width="max-w-[1680px]" lead={lead}>
        <NavLink {...link('/finance/classify', '개인 지출 분류')} />
      </LocalNav>
    );
  }
  return (
    <LocalNav width="max-w-[1680px]" lead={lead}>
      <NavLink {...link('/dashboard', '회계 홈')} />
      {isStaff && <NavLink {...link(`/finance/upload/${u}`, '자료 입력')} />}
      {isStaff && <NavMenu label="전처리" items={PREP} />}
      {isStaff && <NavLink {...link('/finance/classify', '지출 분류')} />}
      <NavMenu label="송금" items={TRANSFER} />
      {isStaff && <NavLink {...link('/finance/close', '월 결산')} />}
      {isStaff && <NavMenu label="더 보기" items={MORE} />}
    </LocalNav>
  );
}
