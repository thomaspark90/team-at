'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { brandLabel, type Brand } from '@/lib/finance/types';
import type { BoardMatrix, SlotState } from '@/lib/finance/boardTodos';
import { useMonthCtx } from './MonthShell';

// 전체 자료 현황 매트릭스 — 행=연·월, 열=자료 종류(대표 스프레드시트 레퍼런스, 2026-08-02).
// 월별로 하나씩 눌러보지 않아도 미입력 칸이 한눈에 보이게. 셀 클릭 = 그 달 선택 + 해당 화면 이동.
// 데이터는 월 배지와 같은 집계(computeBoardMatrix)라 배지·보드와 숫자가 항상 일치한다.

const POS_LABEL: Record<string, string> = {
  yangjae: 'POS 양재천',
  pangyo: 'POS 판교',
  '': 'POS',
};

export default function StatusMatrix({ brand, unitId }: { brand: Brand; unitId?: string }) {
  const ctx = useMonthCtx();
  const [data, setData] = useState<BoardMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 날짜 정렬 — 기본 최신이 위(내림차순), '월' 헤더 클릭으로 토글
  const [desc, setDesc] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/board/matrix?brand=${brand}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '현황을 불러오지 못했어요.');
      setData(j as BoardMatrix);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [brand]);

  useEffect(() => {
    load();
  }, [load]);

  // 셀 클릭 — 그 달을 선택하고 아래 월별 보드로 스크롤(업로드 액션은 보드 칸에서)
  const goMonth = (ym: string, anchor: string) => {
    ctx?.setYm(ym);
    // setYm 반영 후 스크롤 — 다음 프레임에
    requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const fmtYm = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
  const missingTotal = data
    ? data.rows.reduce(
        (n, r) =>
          n +
          Object.values(r.slots).filter((s) => s !== 'full').length +
          data.posStores.filter((st) => !r.pos[st]).length +
          (r.uncl > 0 ? 1 : 0) +
          (r.confirmed ? 0 : 1),
        0
      )
    : 0;

  return (
    <details open className="rounded-2xl border border-border bg-card p-5">
      <summary className="cursor-pointer select-none list-none text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        {brandLabel(brand)} · 전체 자료 현황
        {data && (
          <span className={`ml-2 text-[12px] font-normal ${missingTotal === 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {missingTotal === 0 ? '전부 완료' : `남은 항목 ${missingTotal}개`}
          </span>
        )}
        <span className="ml-2 text-[11px] font-normal text-muted-foreground">— 접기/펼치기</span>
      </summary>
      <p className="mb-3 mt-1 text-[13px] text-muted-foreground">
        연·월 × 자료 종류의 미입력 현황이에요. 칸을 누르면 그 달로 이동해요.{' '}
        <span className="text-[12px]">
          <span className="text-emerald-600">✓ 완료</span> · <span className="text-amber-600">◐ 일부만</span> ·{' '}
          <span className="rounded bg-amber-500/15 px-1 text-amber-600">빈칸 = 미입력</span>
        </span>
      </p>

      {error && <p className="text-[13px] text-red-500">⚠ {error}</p>}
      {!data && !error && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}

      {data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <th className="sticky left-0 bg-card px-2 py-2 text-left font-normal">
                  <button
                    onClick={() => setDesc((d) => !d)}
                    className="inline-flex items-center gap-1 uppercase tracking-[0.04em] hover:text-foreground"
                    title="클릭해서 날짜 정렬 방향 전환"
                  >
                    날짜 <span aria-hidden>{desc ? '↓' : '↑'}</span>
                    <span className="sr-only">{desc ? '내림차순(최신 먼저)' : '오름차순(과거 먼저)'}</span>
                  </button>
                </th>
                {data.slots.map((s) => (
                  <th key={s.key} className="whitespace-nowrap px-2 py-2 text-center font-normal">{s.label}</th>
                ))}
                {data.posStores.map((st) => (
                  <th key={`pos-${st}`} className="whitespace-nowrap px-2 py-2 text-center font-normal">{POS_LABEL[st] ?? 'POS'}</th>
                ))}
                <th className="whitespace-nowrap px-2 py-2 text-center font-normal">지출 자료 분류</th>
                <th className="whitespace-nowrap px-2 py-2 text-center font-normal">월 확정</th>
              </tr>
            </thead>
            <tbody>
              {(desc ? [...data.rows].reverse() : data.rows).map((r) => (
                <tr key={r.ym} className="border-t border-border">
                  <td className="sticky left-0 whitespace-nowrap bg-card px-2 py-1.5 text-[12px] text-muted-foreground">
                    {fmtYm(r.ym)}
                  </td>
                  {data.slots.map((s) => (
                    <Cell key={s.key} state={r.slots[s.key]} onClick={() => goMonth(r.ym, 'monthly-board')} />
                  ))}
                  {data.posStores.map((st) => (
                    <Cell key={`pos-${st}`} state={r.pos[st] ? 'full' : 'missing'} onClick={() => goMonth(r.ym, 'pos')} />
                  ))}
                  {/* 분류 — 미분류 건수, 클릭 시 그 달 미분류 필터로 */}
                  <td className="px-1 py-1 text-center">
                    {r.uncl > 0 ? (
                      <Link
                        href={`/finance/classify?ym=${r.ym}&brand=${brand}&unclassified=1`}
                        className="inline-block min-w-[52px] rounded bg-amber-500/15 px-1.5 py-0.5 text-[12px] font-medium text-amber-600 hover:bg-amber-500/25"
                      >
                        {r.uncl.toLocaleString('ko-KR')}건
                      </Link>
                    ) : r.hasData ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  {/* 월 확정 */}
                  <td className="px-1 py-1 text-center">
                    {r.confirmed ? (
                      <span className="text-emerald-600">✓</span>
                    ) : r.hasData ? (
                      <Link
                        href={`/finance/close?unit=${unitId ?? (brand === 'staffmeal' ? 'staffmeal' : 'yangjae')}`}
                        className="inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[12px] text-amber-600 hover:bg-amber-500/25"
                      >
                        미확정
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function Cell({ state, onClick }: { state: SlotState; onClick: () => void }) {
  if (state === 'full') {
    return (
      <td className="px-1 py-1 text-center">
        <button onClick={onClick} className="text-emerald-600 hover:opacity-70" aria-label="완료 — 그 달로 이동">
          ✓
        </button>
      </td>
    );
  }
  if (state === 'partial') {
    return (
      <td className="px-1 py-1 text-center">
        <button onClick={onClick} className="text-amber-600 hover:opacity-70" aria-label="일부만 입력 — 그 달로 이동">
          ◐
        </button>
      </td>
    );
  }
  return (
    <td className="px-1 py-1 text-center">
      <button
        onClick={onClick}
        aria-label="미입력 — 그 달로 이동"
        className="h-[22px] w-full min-w-[52px] rounded bg-amber-500/15 transition-colors hover:bg-amber-500/30"
      />
    </td>
  );
}
