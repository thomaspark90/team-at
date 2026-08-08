'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MonthSidebar from './MonthSidebar';

const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// 회계자료는 보통 전월 마감분 — 기본 선택은 지난달
const defaultYm = () => {
  const now = new Date();
  return toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1));
};

interface MonthCtxValue {
  ym: string;
  setYm: (m: string) => void;
  todos: Record<string, number>;
  refreshTodos: () => void;
}
const MonthCtx = createContext<MonthCtxValue | null>(null);
// 셸 안의 월 소비 컴포넌트(AccountingBoards 등)가 구독 — 셸 밖에서는 null
export const useMonthCtx = () => useContext(MonthCtx);

// 페이지 셸 — 좌측 고정 연·월 사이드바 + 우측 콘텐츠(children).
// 선택 월(ym)·할 일 배지 상태를 소유하고 컨텍스트로 내려준다. 페이지의 월 스코프 섹션
// (자료 현황·업로드 보드·POS 등)을 통째로 children 으로 받아 사이드바가 페이지 전체의 왼쪽에 선다.
// 데스크톱(lg+)은 사이드바, 좁은 화면은 상단 가로 스트립(‹ › 버튼). 범위는 과거 24개월~다음 달.
export default function MonthShell({
  children,
  initialTodos,
  brand,
  store,
  navigate = false,
  badgeKind = 'todos',
}: {
  children: React.ReactNode;
  // 서버 컴포넌트가 미리 집계한 월 배지 — 있으면 첫 진입 시 클라이언트 재조회를 생략한다.
  initialTodos?: Record<string, number>;
  // 페이지의 브랜드 — 배지를 이 브랜드 몫만 집계한다(미지정 = 전 브랜드 합산)
  brand?: string;
  // 가든 지점 페이지 — POS 항목 배지를 이 지점만 집계(각 지점은 자기 지점 POS 자료만 요청)
  store?: string;
  // true = 달 선택 시 router.replace 로 실제 내비게이션(서버 컴포넌트가 ?ym= 로 데이터를 다시 계산하는
  // 페이지용 — 관리손익 등). false(기본) = replaceState 얕은 갱신(클라이언트 필터만 바뀌는 페이지).
  navigate?: boolean;
  // 배지 의미 — 'todos'(기본): 남은 업무 수(자료 입력). 'uncl': 월별 미분류 건수(분류 화면).
  badgeKind?: 'todos' | 'uncl';
}) {
  // 선택 월을 URL(?ym=)에 반영 — 분류 화면에 다녀오거나 새로고침해도 보던 달 유지.
  const router = useRouter();
  const urlYm = useSearchParams().get('ym');
  const validYm = (v: string | null): v is string => !!v && (/^\d{4}-\d{2}$/.test(v) || v === 'all');
  const [ym, setYmState] = useState(() => (validYm(urlYm) ? urlYm : defaultYm()));
  const setYm = (m: string) => {
    setYmState(m);
    const url = new URL(window.location.href);
    url.searchParams.set('ym', m);
    if (navigate) router.replace(url.pathname + url.search, { scroll: false });
    else window.history.replaceState(null, '', url);
  };
  // 내비게이션(월 칩 링크·뒤로가기 등)으로 URL의 ym이 바뀌면 상태 동기화 ('all' 포함)
  useEffect(() => {
    if (validYm(urlYm)) setYmState((cur) => (cur === urlYm ? cur : urlYm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlYm]);
  const [todos, setTodos] = useState<Record<string, number>>(initialTodos ?? {});
  const selectedRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // 트랙패드 없이도 과거 달로 갈 수 있게 — 한 번에 보이는 폭의 80%씩 이동
  const scrollStrip = (dir: -1 | 1) => {
    stripRef.current?.scrollBy({ left: dir * stripRef.current.clientWidth * 0.8, behavior: 'smooth' });
  };

  const months = useMemo(() => {
    const now = new Date();
    const arr: string[] = [];
    for (let i = -24; i <= 1; i++) arr.push(toYm(new Date(now.getFullYear(), now.getMonth() + i, 1)));
    return arr; // 과거 → 미래 순, 오른쪽 끝이 다음 달
  }, []);

  const loadTodos = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (brand) qs.set('brand', brand);
      if (store) qs.set('store', store);
      if (badgeKind !== 'todos') qs.set('kind', badgeKind);
      const res = await fetch(`/api/finance/board/todos${qs.size ? `?${qs}` : ''}`);
      const j = await res.json();
      if (res.ok) setTodos((j.counts as Record<string, number>) ?? {});
    } catch {
      /* 배지는 부가 정보 — 실패해도 조용히 스킵 */
    }
  }, [brand, store, badgeKind]);

  const hasInitial = initialTodos !== undefined;
  useEffect(() => {
    if (!hasInitial) loadTodos();
  }, [loadTodos, hasInitial]);

  // 좁은 화면 스트립에서 선택된 월이 항상 보이도록 맞춰 스크롤 (첫 진입 포함)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [ym]);

  return (
    <MonthCtx.Provider value={{ ym, setYm, todos, refreshTodos: loadTodos }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        {/* 데스크톱(lg+): 좌측 고정 연·월 패널 — 스크롤해도 따라오는 sticky */}
        <div className="hidden lg:sticky lg:top-4 lg:block lg:w-[176px] lg:shrink-0">
          <MonthSidebar months={months} ym={ym} todos={todos} onSelect={setYm} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 좁은 화면: 가로 월 스트립 */}
          <div className="rounded-2xl border border-border bg-card px-3 py-2 lg:hidden">
            <div className="flex items-center gap-1 pb-1 pt-1.5">
              <button
                onClick={() => scrollStrip(-1)}
                aria-label="이전 달들 보기"
                className="shrink-0 self-stretch rounded-lg px-2 text-[18px] leading-none text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                ‹
              </button>
              <div
                ref={stripRef}
                className="flex flex-1 overflow-x-auto pb-1.5 [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
              >
                {months.map((m) => {
                  const selected = m === ym;
                  const [y, mo] = m.split('-');
                  const n = todos[m] ?? 0;
                  return (
                    <button
                      key={m}
                      ref={selected ? selectedRef : undefined}
                      onClick={() => setYm(m)}
                      aria-pressed={selected}
                      className={`relative min-w-[132px] shrink-0 rounded-xl px-3 py-1.5 text-center transition-colors ${
                        selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <span className={`block text-[10px] leading-tight ${selected ? 'opacity-70' : 'opacity-60'}`}>{y}</span>
                      <span className="text-[13px] font-medium leading-tight">
                        {Number(mo)}월
                        {n > 0 && (
                          <span className="ml-1.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-500 px-1 align-text-top text-[10px] font-semibold leading-none text-white">
                            {n}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => scrollStrip(1)}
                aria-label="다음 달들 보기"
                className="shrink-0 self-stretch rounded-lg px-2 text-[18px] leading-none text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                ›
              </button>
            </div>
          </div>

          {children}
        </div>
      </div>
    </MonthCtx.Provider>
  );
}
