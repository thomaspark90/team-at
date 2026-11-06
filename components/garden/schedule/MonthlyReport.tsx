'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SegmentControl from '@/components/nav/SegmentControl';
import { kstToday } from '@/lib/teaching/kst';
import { EMPLOYMENT_LABEL, type Employment } from '@/lib/schedule/types';
import { STORES, type StoreId } from '@/lib/types';

// 월 근무시간 집계 — 사람별 계획/실제 시간·근무일, 시급이 있으면 예상 인건비(실제 시간 × 시급). 급여 확정은 아니고 참고용.
type Row = { staffId: number; name: string; active: boolean; employment: Employment; planHours: number; actualHours: number; planDays: number; actualDays: number; hourlyWage: number | null; estPay: number | null };
const won = (n: number) => n.toLocaleString('ko-KR');
const addMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function MonthlyReport() {
  const [store, setStore] = useState<StoreId>('yangjae');
  const [month, setMonth] = useState(kstToday().slice(0, 7));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    fetch(`/api/garden-schedule/monthly?store=${store}&month=${month}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setRows(j.rows)))
      .catch(() => setError('불러오지 못했습니다.'));
  }, [store, month]);
  const sum = (k: 'planHours' | 'actualHours') => (rows ?? []).reduce((n, r) => n + r[k], 0);
  const pay = (rows ?? []).reduce((n, r) => n + (r.estPay ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <SegmentControl ariaLabel="지점" items={STORES.map((s) => ({ id: s.id, label: s.short }))} value={store} onSelect={(id) => setStore(id as StoreId)} />
        <div className="flex items-center gap-3 text-body">
          <button type="button" aria-label="지난달" className="ta-btn" onClick={() => setMonth(addMonth(month, -1))}>‹</button>
          <span className="tabular">{month.replace('-', '년 ')}월</span>
          <button type="button" aria-label="다음달" className="ta-btn" onClick={() => setMonth(addMonth(month, 1))}>›</button>
        </div>
        <Link href="/garden/schedule/staff" className="ml-auto text-caption text-muted-foreground">시급은 직원 명부에서 ›</Link>
      </div>
      <section className="ta-panel">
        {error && <p className="m-0 text-body text-destructive">{error}</p>}
        {rows === null && !error && <p className="m-0 text-body text-muted-foreground">불러오는 중…</p>}
        {rows?.length === 0 && <p className="m-0 text-body text-muted-foreground">이 달 기록이 없습니다.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="text-left text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-normal">이름</th>
                  <th className="px-3 py-2 font-normal">형태</th>
                  <th className="px-3 py-2 text-right font-normal">계획(시간)</th>
                  <th className="px-3 py-2 text-right font-normal">실제(시간)</th>
                  <th className="px-3 py-2 text-right font-normal">근무일</th>
                  <th className="px-3 py-2 text-right font-normal">시급(원)</th>
                  <th className="px-3 py-2 text-right font-normal">예상 인건비(원)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staffId} className="border-t border-border text-body">
                    <td className="whitespace-nowrap px-3 py-2">{r.name}{!r.active && <span className="text-muted-foreground">(퇴사)</span>}</td>
                    <td className="px-3 py-2 text-caption text-muted-foreground">{EMPLOYMENT_LABEL[r.employment]}</td>
                    <td className="px-3 py-2 text-right tabular">{r.planHours || ''}</td>
                    <td className="px-3 py-2 text-right tabular">{r.actualHours || ''}</td>
                    <td className="px-3 py-2 text-right tabular">{r.actualDays || ''}</td>
                    <td className="px-3 py-2 text-right tabular text-muted-foreground">{r.hourlyWage != null ? won(r.hourlyWage) : ''}</td>
                    <td className="px-3 py-2 text-right tabular">{r.estPay != null ? won(r.estPay) : ''}</td>
                  </tr>
                ))}
                <tr className="border-t border-border text-body font-medium">
                  <td className="px-3 py-2">합계</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular">{sum('planHours')}</td>
                  <td className="px-3 py-2 text-right tabular">{sum('actualHours')}</td>
                  <td />
                  <td />
                  <td className="px-3 py-2 text-right tabular">{pay ? won(pay) : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 mt-4 text-caption text-muted-foreground">실제 = 실제 기록이 있으면 그것, 없으면 배포된 계획. 휴게시간은 빼지 않았습니다. 예상 인건비 = 실제 시간 × 시급(주휴·수당 미반영, 참고용).</p>
      </section>
    </div>
  );
}
