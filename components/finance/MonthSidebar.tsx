'use client';

import { useEffect, useMemo, useState } from 'react';

// 좌측 고정 연·월 내비게이션 — 데스크톱에서 월 스트립(가로 스크롤)을 대체한다.
// 연도별 섹션(최근 연도가 위, 접기/펼치기)에 월을 세로로 나열하고,
// 배지 = 그 달의 남은 업무 수. 접힌 연도는 배지 합계를 헤더에 표시한다.
// 선택 월(ym) 상태는 부모(AccountingBoards)가 소유 — 여기는 표시·선택만 한다.
export default function MonthSidebar({
  months,
  ym,
  todos,
  onSelect,
  yearSelectable = false,
}: {
  months: string[]; // 'YYYY-MM' 목록(순서 무관)
  ym: string;
  todos: Record<string, number>;
  onSelect: (m: string) => void;
  /** true면 연도 헤더 자체도 선택 가능('YYYY' 값으로 onSelect) — 연 단위 조회를 지원하는 화면(분류)만 켠다 */
  yearSelectable?: boolean;
}) {
  const years = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of months) {
      const y = m.slice(0, 4);
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(m);
    }
    // 최근 연도가 위, 연도 안에서도 최근 달이 위
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([y, ms]) => [y, [...ms].sort().reverse()] as const);
  }, [months]);

  const [open, setOpen] = useState<Record<string, boolean>>({ [ym.slice(0, 4)]: true });
  // 다른 경로로 선택 월이 바뀌어도(URL 등) 그 연도는 항상 펼쳐 보이게
  useEffect(() => {
    setOpen((o) => (o[ym.slice(0, 4)] ? o : { ...o, [ym.slice(0, 4)]: true }));
  }, [ym]);

  return (
    <nav
      aria-label="월 선택"
      className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-border bg-card p-2 [scrollbar-width:thin]"
    >
      {years.map(([y, ms]) => {
        const opened = !!open[y];
        const yearBadge = ms.reduce((s, m) => s + (todos[m] ?? 0), 0);
        const yearSelected = yearSelectable && ym === y;
        return (
          <div key={y}>
            {/* 연도 줄 — 라벨 클릭 = (지원 화면에서) 그 해 전체 선택, ›  클릭 = 접기/펼치기 */}
            <div
              className={`flex w-full items-center justify-between rounded-lg text-[11px] uppercase tracking-[0.06em] transition-colors ${
                yearSelected ? 'bg-foreground text-background' : 'text-muted-foreground'
              }`}
            >
              <button
                onClick={() => {
                  if (yearSelectable) {
                    onSelect(y);
                    setOpen((o) => (o[y] ? o : { ...o, [y]: true }));
                  } else setOpen((o) => ({ ...o, [y]: !opened }));
                }}
                title={yearSelectable ? `${y}년 전체 보기` : undefined}
                className={`flex-1 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  yearSelected ? 'font-medium' : 'hover:text-foreground'
                }`}
              >
                {y}년{yearSelectable ? ' 전체' : ''}
              </button>
              <button
                onClick={() => setOpen((o) => ({ ...o, [y]: !opened }))}
                aria-expanded={opened}
                aria-label={`${y}년 ${opened ? '접기' : '펼치기'}`}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:text-foreground"
              >
                {!opened && yearBadge > 0 && <Badge n={yearBadge} />}
                <span className={`text-[12px] transition-transform ${opened ? 'rotate-90' : ''}`}>›</span>
              </button>
            </div>
            {opened && (
              <div className="mb-1 flex flex-col gap-px">
                {ms.map((m) => {
                  const selected = m === ym;
                  const n = todos[m] ?? 0;
                  return (
                    <button
                      key={m}
                      onClick={() => onSelect(m)}
                      aria-pressed={selected}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-[7px] text-left text-[13px] transition-colors ${
                        selected
                          ? 'bg-foreground font-medium text-background'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <span>{Number(m.slice(5))}월</span>
                      {n > 0 && <Badge n={n} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-medium leading-none text-white">
      {n > 999 ? '999+' : n}
    </span>
  );
}
