import type { StoreReviewSales } from '@/lib/garden/review-sales';
import { STORES } from '@/lib/types';

// 리뷰 × 매출 주간 리포트 — 가든 매출 페이지 하단 섹션(서버 컴포넌트, 재무 권한자 전용).
// 최근 12주 매출 막대 위에 그 주 리뷰 수를 얹어 흐름을 겹쳐 보고, 상관 요약을 붙인다.

const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.label ?? id;
const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmtR = (r: number | null) => (r == null ? '표본 부족' : `r=${r.toFixed(2)}`);

export default function ReviewSalesReport({ data }: { data: StoreReviewSales[] }) {
  const nonEmpty = data.filter((s) => s.weeks.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    // 카드 해체(2026-08-08) — 페이지 최상위 섹션은 박스 없이
    <section>
      <h2 className="m-0 text-[15px] font-medium">리뷰 × 매출 — 주간 흐름</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        네이버 리뷰 유입(수집 시점 기준)과 주간 매출을 겹쳐 봅니다. 상관은 인과가 아니에요 —
        매출이 늘어 방문이 늘면 리뷰도 함께 느는 역방향도 가능합니다.
      </p>
      <div className="mt-8 grid gap-x-5 gap-y-10 lg:grid-cols-2">
        {nonEmpty.map((s) => {
          const recent = s.weeks.slice(-12);
          const max = Math.max(1, ...recent.map((w) => w.sales));
          return (
            <div key={s.store} className="rounded-xl bg-muted/40 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="m-0 text-[13px] font-medium">{storeLabel(s.store)}</p>
                <p className="m-0 text-[11px] text-muted-foreground">
                  같은 주 {fmtR(s.corr.same)} · 리뷰 다음 주 {fmtR(s.corr.lag1)} ({s.corr.n}주)
                </p>
              </div>
              <div className="mt-3 flex items-end gap-1" style={{ height: 64 }}>
                {recent.map((w) => (
                  <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
                    <div
                      title={`${w.week} 주 · ${won(w.sales)} · 리뷰 ${w.reviews}건${w.avgRating ? ` ★${w.avgRating.toFixed(1)}` : ''}`}
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(w.sales > 0 ? 6 : 2, (w.sales / max) * 100)}%`,
                        background: 'hsl(var(--number-colored) / 0.65)',
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* 막대 아래 그 주 리뷰 수 — 0은 점으로 흐리게 */}
              <div className="mt-1 flex gap-1">
                {recent.map((w) => (
                  <span
                    key={w.week}
                    className={`min-w-0 flex-1 text-center text-[11px] ${w.reviews > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                  >
                    {w.reviews > 0 ? w.reviews : '·'}
                  </span>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{recent[0].week.slice(5).replace('-', '.')} 주</span>
                <span>리뷰 수</span>
                <span>{recent[recent.length - 1].week.slice(5).replace('-', '.')} 주</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
