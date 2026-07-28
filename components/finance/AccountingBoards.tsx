'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
// 업로드 보드·자료 분류 보드가 같은 월로 함께 움직인다.
// 스트립은 과거 24개월~다음 달까지, 화면 폭만큼(약 7개) 보이고 좌우 스크롤로 나머지 확인.
// 칩 옆 배지 = 그 달의 남은 업무 수(미완료 업로드 슬롯 + 미분류 출처 + 월 확정).
export default function AccountingBoards() {
  const [ym, setYm] = useState(defaultYm);
  // 회계가 브랜드별로 분리 — 업로드 보드는 선택된 브랜드 회계로만 저장·판정된다.
  const [brand, setBrand] = useState<Brand>('garden');
  const [todos, setTodos] = useState<Record<string, number>>({});
  const selectedRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  // 선택된 월이 항상 보이도록 스트립을 맞춰 스크롤 (첫 진입 포함)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [ym]);

  return (
    <>
      <div className="rounded-2xl border border-border bg-card px-3 py-2">
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
        <div className="flex overflow-x-auto pb-1 pt-1.5 [scrollbar-width:thin]">
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
      </div>

      <MonthlyUploadBoard ym={ym} brand={brand} onSaved={loadTodos} />
      <ClassifyBoard ym={ym} />
    </>
  );
}
