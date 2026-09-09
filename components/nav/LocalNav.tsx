'use client';

// 로컬 내비 한 줄(2026-09-09 소프트 UI 내비 통합) — 전역 TabNav 아래, 섹션(가든·회계·리포트)별 메뉴를 한 줄에 담는다.
//  · 왼쪽 슬롯(lead): 세그먼트 컨트롤(브랜드·지점) — 없으면 비움.
//  · 가운데: 링크·묶음(NavLink·NavMenu). 좁은 화면에선 한 줄 가로 스크롤(줄바꿈으로 3~4줄 늘어나던 문제 방지).
//  · 오른쪽 슬롯(trail): 더 보기·설정 등 보조.
//  · 구분선 대신 아래로 아주 연한 그림자 하나(Surface, not border).

export default function LocalNav({
  lead,
  trail,
  children,
  width = 'max-w-[1400px]', // PageShell default 와 동일 — 좌우 끝 정렬
}: {
  lead?: React.ReactNode;
  trail?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <nav className="relative z-20 bg-background shadow-soft-sm">
      <div className={`mx-auto flex h-12 items-center gap-4 px-4 sm:gap-6 sm:px-6 ${width}`}>
        {lead && <div className="shrink-0">{lead}</div>}
        <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-x-5 overflow-x-auto sm:justify-center">
          {children}
        </div>
        {trail && <div className="hidden shrink-0 items-center gap-x-5 sm:flex">{trail}</div>}
      </div>
    </nav>
  );
}
