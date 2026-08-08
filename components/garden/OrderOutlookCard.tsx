'use client';

import { useEffect, useState } from 'react';

// 발주 참고 카드 — /garden/weather 상단. 원두별 잔여 추정(날씨 보정) v1.
// '발주 1회 = 1봉(capacityG)' 가정의 거친 추정이라 참고용 라벨을 유지한다.

interface Row {
  bean: string;
  store: string;
  stockPct: number;
  lastPurchaseAt: string;
  daysSince: number;
  estDaysLeft: number | null;
}
interface Payload {
  rows: Row[];
  weatherFactor: number;
}

const STORE_LABEL: Record<string, string> = { pangyo: '판교', yangjae: '양재천' };

export default function OrderOutlookCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/garden-order-outlook', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `조회 실패 (${r.status})`);
        setData(j);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '조회 실패'));
  }, []);

  if (error || !data || data.rows.length === 0) return null; // 참고 카드 — 데이터 없으면 조용히 생략

  return (
    <section className="rounded-md border border-border bg-background" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <p className="ta-label" style={{ marginBottom: 0 }}>발주 참고 — 원두 잔여 추정</p>
        <span className="text-[11px] text-muted-foreground/70">
          다음 7일 날씨 배율 ×{data.weatherFactor} · 발주 1회=1봉 가정의 참고치
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-normal">원두</th>
              <th className="px-2 py-1.5 text-left font-normal">지점</th>
              <th className="px-2 py-1.5 text-right font-normal">재고</th>
              <th className="px-2 py-1.5 text-right font-normal">잔여 추정</th>
              <th className="px-2 py-1.5 text-right font-normal">마지막 발주</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const urgent = r.estDaysLeft != null && r.estDaysLeft <= 5;
              return (
                <tr key={`${r.bean}|${r.store}`} className="border-t border-border">
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-foreground">{r.bean}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{STORE_LABEL[r.store] ?? r.store}</td>
                  <td className="tabular px-2 py-1.5 text-right text-muted-foreground">{r.stockPct}%</td>
                  <td
                    className={`tabular px-2 py-1.5 text-right ${urgent ? 'font-medium' : 'text-muted-foreground'}`}
                    style={urgent ? { color: 'hsl(var(--destructive))' } : undefined}
                  >
                    {r.estDaysLeft != null ? `~${r.estDaysLeft}일` : '추정 불가'}
                  </td>
                  <td className="tabular px-2 py-1.5 text-right text-muted-foreground/70">
                    {r.lastPurchaseAt} ({r.daysSince}일 전)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
