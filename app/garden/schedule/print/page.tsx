'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { addDays, fmtMd, isYmd, kstToday } from '@/lib/teaching/kst';
import { fmtSegment, hoursOf, weekStartOf } from '@/lib/schedule/time';
import { STORES, type StoreId } from '@/lib/types';
import type { WeekData } from '@/lib/schedule/types';

// 인쇄 보기 — 내비 없이 표만. 브라우저 인쇄(⌘P)로 PDF 저장. ?store&week
export default function SchedulePrintPage() {
  const sp = useSearchParams();
  const store = (STORES.some((s) => s.id === sp.get('store')) ? sp.get('store') : 'yangjae') as StoreId;
  const weekStart = weekStartOf(isYmd(sp.get('week')) ? (sp.get('week') as string) : kstToday());
  const [week, setWeek] = useState<WeekData | null>(null);
  useEffect(() => {
    fetch(`/api/garden-schedule?store=${store}&week=${weekStart}`, { cache: 'no-store' }).then((r) => r.json()).then(setWeek);
  }, [store, weekStart]);
  if (!week) return <p className="p-8 text-body text-muted-foreground">불러오는 중…</p>;
  const plan = week.shifts.filter((s) => s.kind === 'plan' && s.store === store);
  const rows = week.staff.filter((p) => plan.some((s) => s.staffId === p.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const label = STORES.find((s) => s.id === store)?.label;
  return (
    <main className="mx-auto max-w-[1100px] bg-white p-8 text-foreground print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="m-0 text-caption text-muted-foreground">브라우저 인쇄(⌘P)에서 PDF 로 저장할 수 있습니다.</p>
        <button type="button" className="ta-btn" onClick={() => window.print()}>인쇄</button>
      </div>
      <h1 className="m-0 text-title">가든서비스 {label} 근무표 · {fmtMd(weekStart)} ~ {fmtMd(addDays(weekStart, 6))}</h1>
      <table className="mt-4 w-full border-collapse text-body">
        <thead>
          <tr className="text-left text-caption text-muted-foreground">
            <th className="border-b border-border px-2 py-1 font-normal">이름</th>
            {week.days.map((d) => <th key={d} className="border-b border-border px-2 py-1 font-normal tabular">{fmtMd(d)}</th>)}
            <th className="border-b border-border px-2 py-1 text-right font-normal">주간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap border-b border-border px-2 py-1">{p.name}</td>
              {week.days.map((d) => (
                <td key={d} className="border-b border-border px-2 py-1 tabular">
                  {plan.filter((s) => s.staffId === p.id && s.date === d && s.start != null).map((s) => fmtSegment({ start: s.start!, end: s.end! })).join(', ')}
                </td>
              ))}
              <td className="border-b border-border px-2 py-1 text-right tabular">{hoursOf(plan.filter((s) => s.staffId === p.id)) || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!week.published && <p className="mt-3 text-caption text-amber-600">아직 배포되지 않은 계획입니다.</p>}
    </main>
  );
}
