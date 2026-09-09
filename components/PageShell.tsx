import type { ReactNode } from 'react';
import TabNav from '@/components/TabNav';

// 페이지 셸(2026-09-09 소프트 UI 3단계) — 전역 바 + 로컬 내비 + 본문 컨테이너 + 제목 줄을 한 곳에서 정한다.
// 이전엔 페이지마다 max-w 가 12종이었다(1100·1120·1600·1680·860·720…). 이제 셋만:
//   default 980px — 목록·폼·대시보드 (대부분)
//   wide   1400px — 넓은 표·차트 (전처리·관리손익·로우데이터·분쇄도 등)
//   narrow  640px — 단일 폼·안내 (비밀번호 변경·스탭밀 식사)
// 제목 줄: 왼쪽 display 제목 + 회색 한 줄 부제, 오른쪽 행동(actions — 검은 버튼은 화면당 하나).
// divide: 섹션 사이 헤어라인(divide-y) + py-[54px] 리듬을 쓰는 페이지용(DESIGN_SYSTEM §6). 새 화면은 .ta-panel 로 면을 나누고 divide 는 안 쓴다.
// 서버·클라이언트 컴포넌트 어디서든 쓸 수 있게 훅 없음(TabNav 는 자체 'use client').

const WIDTH = { default: 'max-w-[980px]', wide: 'max-w-[1400px]', narrow: 'max-w-[640px]' } as const;

export default function PageShell({
  nav,
  width = 'default',
  title,
  subtitle,
  actions,
  divide = false,
  children,
}: {
  nav?: ReactNode;
  width?: keyof typeof WIDTH;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  divide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      {nav}
      <main className={`mx-auto ${WIDTH[width]} px-6 py-10 sm:py-12`}>
        {title && (
          <header className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="m-0 text-display">{title}</h1>
              {/* div — 부제 자리에 날씨 한 줄 같은 블록 컴포넌트도 들어온다(p 안에 section 금지) */}
              {subtitle && <div className="mt-2 text-body text-muted-foreground">{subtitle}</div>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
          </header>
        )}
        <div className={divide ? 'divide-y divide-border' : undefined}>{children}</div>
      </main>
    </div>
  );
}
