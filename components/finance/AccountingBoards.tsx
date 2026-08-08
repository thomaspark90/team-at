'use client';

import { useState } from 'react';
import MonthlyUploadBoard from './MonthlyUploadBoard';
import ClassifyBoard from './ClassifyBoard';
import { BRANDS, type Brand } from '@/lib/finance/types';
import { useMonthCtx } from './MonthShell';

const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// 회계자료는 보통 전월 마감분 — 기본 선택은 지난달
const defaultYm = () => {
  const now = new Date();
  return toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1));
};

// 회계 월별 업무 묶음 — 선택 월(ym)·배지는 페이지 셸(MonthShell)의 컨텍스트에서 받는다.
// 셸의 좌측 연·월 사이드바에서 달을 고르면 업로드 보드·지출 자료 분류 보드가 함께 움직인다.
// (셸 밖에서 쓰이면 월 선택 UI 없이 지난달로 고정 — 정상 사용처는 항상 MonthShell 안)
export default function AccountingBoards({
  fixedBrand,
  mode = 'upload',
  unitId,
  banks,
}: {
  fixedBrand?: Brand;
  // 'status' = 대시보드 현황(업로드 없음, POS 포함, 분류 보드 동반) / 'upload' = 자료 입력 페이지의 업로드 보드
  mode?: 'upload' | 'status';
  unitId?: string; // status 모드에서 '자료 입력' 이동 대상 단위
  banks?: string[]; // fixedBrand 페이지에서 서버가 미리 읽은 사용 은행(brand_settings)
}) {
  const ctx = useMonthCtx();
  const ym = ctx?.ym ?? defaultYm();
  // 회계가 브랜드별로 분리 — 업로드 보드는 선택된 브랜드 회계로만 저장·판정된다.
  // 내비 2단(단위) 구조에서는 상단 단위가 브랜드를 고정(fixedBrand)하고 자체 탭은 숨긴다.
  const [brandState, setBrand] = useState<Brand>('garden');
  const brand = fixedBrand ?? brandState;

  return (
    <>
      {!fixedBrand && (
        <div className="px-3 py-2">
          <div className="flex items-center gap-1 px-1 py-1">
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
        </div>
      )}

      <div className={mode === 'status' ? 'divide-y divide-border' : undefined}>
        <div className={mode === 'status' ? 'pb-[54px]' : undefined}>
          <MonthlyUploadBoard
            ym={ym}
            brand={brand}
            readOnly={mode === 'status'}
            unitId={unitId}
            initialBanks={fixedBrand ? banks : undefined}
            onSaved={ctx?.refreshTodos}
          />
        </div>
        {mode === 'status' && (
          <div className="pt-[54px]">
            <ClassifyBoard ym={ym} />
          </div>
        )}
      </div>
    </>
  );
}
