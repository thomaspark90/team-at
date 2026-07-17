'use client';

import { useState } from 'react';
import MonthlyUploadBoard from './MonthlyUploadBoard';
import ClassifyBoard from './ClassifyBoard';

const fmtYm = (ym: string) => `${ym.split('-')[0]}년 ${Number(ym.split('-')[1])}월`;
const shiftYm = (ym: string, diff: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + diff, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
// 회계자료는 보통 전월 마감분 — 기본 선택은 지난달
const defaultYm = () => shiftYm(new Date().toISOString().slice(0, 7), -1);

// 회계 월별 업무 묶음 — 기준 월을 상단에서 한 번만 고르면
// 업로드 보드·자료 분류 보드가 같은 월로 함께 움직인다.
export default function AccountingBoards() {
  const [ym, setYm] = useState(defaultYm);
  const isDefault = ym === defaultYm();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-5 py-3">
        <div className="flex items-center gap-2 text-[14px]">
          <button
            onClick={() => setYm(shiftYm(ym, -1))}
            className="rounded-md border border-border px-2.5 py-1 text-[13px] text-muted-foreground hover:text-foreground"
          >
            ‹
          </button>
          <span className="min-w-[96px] text-center font-medium">{fmtYm(ym)}</span>
          <button
            onClick={() => setYm(shiftYm(ym, 1))}
            className="rounded-md border border-border px-2.5 py-1 text-[13px] text-muted-foreground hover:text-foreground"
          >
            ›
          </button>
          {!isDefault && (
            <button
              onClick={() => setYm(defaultYm())}
              className="rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              지난달로
            </button>
          )}
        </div>
        <span className="text-[12px] text-muted-foreground">아래 업로드·자료 분류 보드가 이 월 기준으로 함께 움직여요</span>
      </div>

      <MonthlyUploadBoard ym={ym} />
      <ClassifyBoard ym={ym} />
    </>
  );
}
