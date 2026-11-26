import Link from 'next/link';

// 필터커피 화면 하단 고정 버튼 묶음(.fc-dock)의 「필터커피 라인업」 버튼 — 전 이름 「레시피 보드」(2026-11-26 이름 변경) (2026-11-25 대표 지시 — 위쪽 글자 링크에서 옮김).
// 스크롤해도 같은 자리에 있어 태블릿 레시피 보드로 바로 들어간다. 모양은 globals.css 의 .fc-fab.
export default function RecipeBoardFab() {
  return (
    <Link href="/garden/filtercoffee/board" className="fc-fab text-body" title="필터커피 라인업 — 원두를 고르고 이름을 눌러 추출하는 매장용 화면">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="5" height="14" rx="1.2" />
        <rect x="9.5" y="5" width="5" height="14" rx="1.2" />
        <rect x="16" y="5" width="5" height="14" rx="1.2" />
      </svg>
      필터커피 라인업
    </Link>
  );
}
