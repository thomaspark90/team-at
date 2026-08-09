import { bucketLabel, granUnitLabel, type AmericanoPeriod, type MenuPeriod, type PeriodSeries } from '@/lib/garden/menu-sales';
import MenuTrendChart from '@/components/garden/MenuTrendChart';

// 메뉴 판매 리포트 — 가든 매출 페이지 섹션(서버 컴포넌트, 재무 권한자 전용).
// ① 아메리카노 아이스/핫 비교(합계 카드 + 기간별 막대), ② 아메리카노 원두별(스테이=메인/
// 라이트=시즈널/디카페인) 기간별 추이, ③ 메뉴별 기간별 판매 추이(상위 메뉴).
// 기간 단위(일/주/월)는 페이지 상단 토글(?gran=)로 전환, 오픈 이후 전체 기간을 캡 없이 보여준다.
// 품목 데이터(pos_items)는 현재 양재천(토스)만 쌓인다 — 행이 없으면 페이지가 섹션을 숨긴다.

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const cnt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 기간별 막대 한 줄 — 라벨 · 합계 · 버킷별 미니 막대(qty 기준). */
function SeriesRow({ s, buckets, gran, max }: { s: PeriodSeries; buckets: string[]; gran: AmericanoPeriod['gran']; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 flex-shrink-0 truncate text-[13px]" title={s.label}>{s.label}</span>
      <div className="flex min-w-0 flex-1 items-end gap-[2px]" style={{ height: 36 }}>
        {s.qty.map((q, i) => (
          <div
            key={buckets[i]}
            title={`${bucketLabel(buckets[i], gran)} · ${cnt(q)}건 · ${won(s.supply[i])}`}
            className="min-w-0 flex-1"
            style={{
              height: `${Math.max(q > 0 ? 8 : 2, (q / max) * 100)}%`,
              background: q > 0 ? 'hsl(var(--number-colored) / 0.65)' : 'hsl(var(--border))',
              // 전역 --radius(10px)는 이 얇은 막대엔 너무 커서 알약처럼 보인다 — 2px 고정
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>
      <span className="tabular w-16 flex-shrink-0 text-right text-[13px]">{cnt(s.totalQty)}건</span>
      <span className="tabular w-24 flex-shrink-0 text-right text-[11px] text-muted-foreground">{won(s.totalSupply)}</span>
    </div>
  );
}

function BucketAxis({ buckets, gran }: { buckets: string[]; gran: AmericanoPeriod['gran'] }) {
  if (buckets.length === 0) return null;
  return (
    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground" style={{ paddingLeft: '7.75rem', paddingRight: '10rem' }}>
      <span>{bucketLabel(buckets[0], gran)}</span>
      <span>{bucketLabel(buckets[buckets.length - 1], gran)}</span>
    </div>
  );
}

export default function MenuSalesReport({ americano, menus }: { americano: AmericanoPeriod; menus: MenuPeriod }) {
  const hasAme = americano.totalQty > 0;
  const hasMenus = menus.menus.length > 0;
  if (!hasAme && !hasMenus) return null;

  const ameMax = Math.max(1, ...americano.temps.flatMap((s) => s.qty), ...americano.beans.flatMap((s) => s.qty));
  const ice = americano.temps.find((s) => s.label === '아이스');
  const hot = americano.temps.find((s) => s.label === '핫');
  const unit = granUnitLabel(americano.gran);

  return (
    <>
      {hasAme && (
        // 카드 해체(2026-08-08) — 페이지 최상위 섹션은 박스 없이 가로 구분선+py-[54px]로 구획(§6.1)
        <section className="py-[54px]">
          <h2 className="m-0 text-[15px] font-medium">아메리카노 — 아이스/핫 · 원두별 추이</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            오픈 이후 전체 {americano.buckets.length}{unit}, 판매 건수 기준(원두: 스테이=메인 블렌드, 라이트=시즈널). 금액은 공급가액.
          </p>
          {americano.unclassifiedOptions.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              ⚠ 옵션 인식 안 됨({americano.unclassifiedOptions.length}종) — {americano.unclassifiedOptions.join(', ')}
            </p>
          )}

          {/* 합계 카드 — 아이스 vs 핫 vs 전체 */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { label: '아이스', s: ice },
              { label: '핫', s: hot },
              { label: '전체', s: null },
            ].map((c) => {
              const qty = c.s ? c.s.totalQty : americano.totalQty;
              const supply = c.s ? c.s.totalSupply : americano.totalSupply;
              const share = americano.totalQty ? Math.round((qty / americano.totalQty) * 100) : 0;
              return (
                <div key={c.label} className="rounded-2xl bg-muted/40 p-5">
                  <p className="m-0 text-[13px] text-muted-foreground">
                    {c.label} {c.s && <span className="text-[11px]">({share}%)</span>}
                  </p>
                  <p className="m-0 mt-1 text-[22px]" style={{ color: 'hsl(var(--number-colored))' }}>
                    {cnt(qty)}건
                  </p>
                  <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">{won(supply)}</p>
                </div>
              );
            })}
          </div>

          {/* 아이스/핫 기간별 */}
          <div className="mt-6 flex flex-col gap-3">
            {americano.temps.map((s) => (
              <SeriesRow key={s.label} s={s} buckets={americano.buckets} gran={americano.gran} max={ameMax} />
            ))}
          </div>

          {/* 원두별(메인/시즈널/디카페인) 기간별 */}
          {americano.beans.length > 0 && (
            <>
              <h3 className="mb-0 mt-6 text-[13px] font-medium text-muted-foreground">원두별</h3>
              <div className="mt-3 flex flex-col gap-3">
                {americano.beans.map((s) => (
                  <SeriesRow key={s.label} s={s} buckets={americano.buckets} gran={americano.gran} max={ameMax} />
                ))}
              </div>
            </>
          )}
          <BucketAxis buckets={americano.buckets} gran={americano.gran} />
        </section>
      )}

      {hasMenus && (
        // 카드 해체(2026-08-08) — 페이지 최상위 섹션은 박스 없이 가로 구분선+py-[54px]로 구획(§6.1)
        <section className="py-[54px]">
          <h2 className="m-0 text-[15px] font-medium">메뉴별 판매 추이 — 상위 {menus.menus.length}개</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            오픈 이후 전체 {menus.buckets.length}{granUnitLabel(menus.gran)} 판매 건수 상위 메뉴. 라인에 마우스를 올리면 기간·건수가 보여요.
          </p>
          <div className="mt-8">
            <MenuTrendChart menus={menus} />
          </div>
        </section>
      )}
    </>
  );
}
