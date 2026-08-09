import type { SalesRow } from '@/lib/finance/sales-data';

// 매출 요약 — POS 발생주의 매출 행(일×카테고리)을 받아 합계 카드·30일 막대·카테고리 요약을 그린다.
// 스탭밀(/studio/sales)과 가든(/garden/sales)이 공유하는 서버 컴포넌트. 금액은 전부 공급가액(VAT 제외).
// POS 원본의 수량(qty)은 페이히어에선 결제 건수라 품목 수량으로 오해되기 쉬워 아예 쓰지 않는다.

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const monthLabel = (ym: string) => `${Number(ym.slice(5, 7))}월`;

export default function SalesSummary({ rows }: { rows: SalesRow[] }) {
  const kstToday = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const thisYm = kstToday.slice(0, 7);
  const lastYm = new Date(new Date(thisYm + '-15').getTime() - 30 * 86_400_000).toISOString().slice(0, 7);

  // 일 합계 (카테고리 합산)
  const byDay = new Map<string, number>();
  const byYm = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.sale_date, (byDay.get(r.sale_date) ?? 0) + Number(r.supply));
    byYm.set(r.ym, (byYm.get(r.ym) ?? 0) + Number(r.supply));
  }

  const last7Start = new Date(new Date(kstToday).getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const last7 = Array.from(byDay.entries())
    .filter(([d]) => d >= last7Start && d <= kstToday)
    .reduce((s, [, v]) => s + v, 0);

  // 최근 30일 막대 — 업로드가 월 단위라 이번 달 데이터가 아직 없을 수 있고, 그때도 흐름이 보이게
  // '오늘 기준 30일'이 아니라 '데이터가 있는 마지막 날 기준 30일'을 그린다.
  const lastDataDay = rows.length ? rows[rows.length - 1].sale_date : kstToday;
  const chartDays: { day: string; supply: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(new Date(lastDataDay).getTime() - i * 86_400_000).toISOString().slice(0, 10);
    chartDays.push({ day, supply: byDay.get(day) ?? 0 });
  }
  const chartMax = Math.max(1, ...chartDays.map((d) => d.supply));

  // 카테고리 요약 — 데이터가 있는 가장 최근 달 기준
  const latestYm = Array.from(byYm.keys()).sort().pop() ?? thisYm;
  const byCat = new Map<string, number>();
  for (const r of rows) {
    if (r.ym !== latestYm) continue;
    byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.supply));
  }
  const cats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
  const catTotal = cats.reduce((s, [, v]) => s + v, 0);

  const summary = [
    { label: '이번 달', value: byYm.get(thisYm) ?? 0, sub: monthLabel(thisYm) },
    { label: '지난달', value: byYm.get(lastYm) ?? 0, sub: monthLabel(lastYm) },
    { label: '최근 7일', value: last7, sub: `${last7Start.slice(5).replace('-', '.')}~` },
  ];

  return (
    // 카드 해체(2026-08-08) — 주요 섹션 경계는 가로 구분선으로만, 합계 셀은 bg-muted/40 면으로
    <div className="divide-y divide-border">
      {/* 합계 카드 */}
      <div className="grid gap-x-3 gap-y-6 pb-[54px] sm:grid-cols-3">
        {summary.map((s) => (
          <section key={s.label} className="rounded-2xl bg-muted/40 p-5">
            <p className="m-0 text-[13px] text-muted-foreground">{s.label} <span className="text-[11px]">({s.sub})</span></p>
            <p className="m-0 mt-1 text-[22px]" style={{ color: 'hsl(var(--number-colored))' }}>
              {won(s.value)}
            </p>
          </section>
        ))}
      </div>

      {/* 최근 30일 일별 매출 막대 */}
      <section className="py-[54px]">
        <h2 className="m-0 text-[15px] font-medium">일별 매출 — 최근 30일</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          데이터가 있는 마지막 날({lastDataDay.slice(5).replace('-', '.')}) 기준. 공급가액(VAT 제외).
        </p>
        <div className="mt-8 flex items-end gap-[3px]" style={{ height: 72 }}>
          {chartDays.map((d) => (
            <div
              key={d.day}
              title={`${d.day} · ${won(d.supply)}`}
              className="min-w-0 flex-1"
              style={{
                height: `${Math.max(d.supply > 0 ? 6 : 2, (d.supply / chartMax) * 100)}%`,
                background: d.supply > 0 ? 'hsl(var(--number-colored) / 0.75)' : 'hsl(var(--border))',
                // 전역 --radius(10px)는 이 얇은 막대엔 너무 커서 알약처럼 보인다 — 2px 고정
                borderRadius: '2px 2px 0 0',
              }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{chartDays[0].day.slice(5).replace('-', '.')}</span>
          <span>{chartDays[chartDays.length - 1].day.slice(5).replace('-', '.')}</span>
        </div>
      </section>

      {/* 카테고리 요약 */}
      <section className="pt-[54px]">
        <h2 className="m-0 text-[15px] font-medium">카테고리별 — {monthLabel(latestYm)}</h2>
        {cats.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted-foreground">이 달에 집계된 매출이 없어요.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {cats.map(([cat, v]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 truncate text-[13px]">{cat}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded bg-muted/40">
                  <div className="h-full rounded" style={{ width: `${(v / (cats[0][1] || 1)) * 100}%`, background: 'hsl(var(--number-colored) / 0.6)' }} />
                </div>
                <span className="tabular w-28 flex-shrink-0 text-right text-[13px]">{won(v)}</span>
                <span className="tabular w-12 flex-shrink-0 text-right text-[11px] text-muted-foreground">
                  {catTotal ? Math.round((v / catTotal) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
