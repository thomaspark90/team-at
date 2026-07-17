'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MonthlyUploadBoard from './MonthlyUploadBoard';
import ClassifyBoard from './ClassifyBoard';

const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// 회계자료는 보통 전월 마감분 — 기본 선택은 지난달
const defaultYm = () => {
  const now = new Date();
  return toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1));
};

// 회계 월별 업무 묶음 — 상단 월 스트립에서 한 번만 고르면
// 업로드 보드·자료 분류 보드가 같은 월로 함께 움직인다.
// 스트립은 과거 24개월~다음 달까지, 화면 폭만큼(약 7개) 보이고 좌우 스크롤로 나머지 확인.
export default function AccountingBoards() {
  const [ym, setYm] = useState(defaultYm);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const months = useMemo(() => {
    const now = new Date();
    const arr: string[] = [];
    for (let i = -24; i <= 1; i++) arr.push(toYm(new Date(now.getFullYear(), now.getMonth() + i, 1)));
    return arr; // 과거 → 미래 순, 오른쪽 끝이 다음 달
  }, []);

  // 선택된 월이 항상 보이도록 스트립을 맞춰 스크롤 (첫 진입 포함)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [ym]);

  return (
    <>
      <div className="rounded-2xl border border-border bg-card px-3 py-2">
        <div className="flex overflow-x-auto pb-1 [scrollbar-width:thin]">
          {months.map((m) => {
            const selected = m === ym;
            const [y, mo] = m.split('-');
            return (
              <button
                key={m}
                ref={selected ? selectedRef : undefined}
                onClick={() => setYm(m)}
                aria-pressed={selected}
                className={`min-w-[132px] shrink-0 rounded-xl px-3 py-1.5 text-center transition-colors ${
                  selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <span className={`block text-[10px] leading-tight ${selected ? 'opacity-70' : 'opacity-60'}`}>{y}</span>
                <span className="text-[13px] font-medium leading-tight">{Number(mo)}월</span>
              </button>
            );
          })}
        </div>
      </div>

      <MonthlyUploadBoard ym={ym} />
      <ClassifyBoard ym={ym} />
    </>
  );
}
