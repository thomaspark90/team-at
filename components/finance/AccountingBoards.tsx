'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MonthlyUploadBoard from './MonthlyUploadBoard';
import ClassifyBoard from './ClassifyBoard';
import { BRANDS, type Brand } from '@/lib/finance/types';

const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// 회계자료는 보통 전월 마감분 — 기본 선택은 지난달
const defaultYm = () => {
  const now = new Date();
  return toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1));
};

// 회계 월별 업무 묶음 — 상단 월 스트립에서 한 번만 고르면
// 업로드 보드·지출 자료 분류 보드가 같은 월로 함께 움직인다.
// 스트립은 과거 24개월~다음 달까지, 화면 폭만큼(약 7개) 보이고 좌우 ‹ › 버튼(또는 가로 스크롤)로 나머지 확인.
// 칩 옆 배지 = 그 달의 남은 업무 수(미완료 업로드 슬롯 + 미분류 출처 + 월 확정).
export default function AccountingBoards({
  fixedBrand,
  initialTodos,
}: {
  fixedBrand?: Brand;
  // 서버 컴포넌트가 미리 집계한 월 배지 — 있으면 첫 진입 시 클라이언트 재조회를 생략한다.
  initialTodos?: Record<string, number>;
}) {
  // 선택 월을 URL(?ym=)에 반영 — 분류 화면에 다녀오거나 새로고침해도 보던 달 유지.
  // replaceState(얕은 갱신)라 서버 재조회 없이 주소만 바뀐다.
  const urlYm = useSearchParams().get('ym');
  const [ym, setYmState] = useState(() => (urlYm && /^\d{4}-\d{2}$/.test(urlYm) ? urlYm : defaultYm()));
  const setYm = (m: string) => {
    setYmState(m);
    const url = new URL(window.location.href);
    url.searchParams.set('ym', m);
    window.history.replaceState(null, '', url);
  };
  // 회계가 브랜드별로 분리 — 업로드 보드는 선택된 브랜드 회계로만 저장·판정된다.
  // 내비 2단(단위) 구조에서는 상단 단위가 브랜드를 고정(fixedBrand)하고 자체 탭은 숨긴다.
  const [brandState, setBrand] = useState<Brand>('garden');
  const brand = fixedBrand ?? brandState;
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
      const res = await fetch('/api/finance/board/todos');
      const j = await res.json();
      if (res.ok) setTodos((j.counts as Record<string, number>) ?? {});
    } catch {
      /* 배지는 부가 정보 — 실패해도 조용히 스킵 */
    }
  }, []);

  const hasInitial = initialTodos !== undefined;
  useEffect(() => {
    if (!hasInitial) loadTodos();
  }, [loadTodos, hasInitial]);

  // 선택된 월이 항상 보이도록 스트립을 맞춰 스크롤 (첫 진입 포함)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [ym]);

  return (
    <>
      <div className="rounded-2xl border border-border bg-card px-3 py-2">
        {!fixedBrand && (
          <div className="flex items-center gap-1 px-1 pt-1.5">
            {BRANDS.map((b) => {
              const on = brand === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setBrand(b.id)}
                  aria-pressed={on}
                  className={`rounded-lg px-3 py-1 text-[13px] transition-colors ${
                    on ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
            <span className="ml-2 text-[11px] text-muted-foreground">브랜드별로 회계가 분리돼요 — 올린 자료는 선택된 브랜드로 들어가요</span>
          </div>
        )}
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

      <MonthlyUploadBoard ym={ym} brand={brand} onSaved={loadTodos} />
      <ClassifyBoard ym={ym} />
    </>
  );
}
