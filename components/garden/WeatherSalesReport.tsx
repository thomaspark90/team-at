'use client';

import { useEffect, useState } from 'react';
import type { RegressionResult, BandEffect } from '@/lib/garden/weatherSales';
import { KR_HOLIDAYS_UNTIL } from '@/lib/garden/krHolidays';

// 날씨 × 판매 분석 리포트 — /garden/weather 화면 본문.
// 기준(10–20°·비 없음·월요일·요일/트렌드 통제) 대비 각 날씨 밴드의 % 효과를 모노 바로 보여준다.
// |t|≥2(통상 유의)만 진하게, 나머지는 흐리게 — 표본 부족 밴드를 과신하지 않게.

interface Coverage {
  store: string;
  from: string;
  to: string;
  days: number;
  sparseMonths: string[];
}
interface Series {
  key: string;
  label: string;
  metric: string;
  result: RegressionResult | null;
}
interface Payload {
  coverage: Coverage[];
  weatherDays: number;
  series: Series[];
  categories: Record<string, { category: string; qty: number; supply: number }[]>;
  computedAt?: string;
  cached?: boolean;
  /** 지점별 월 시계열(영업일·일평균) — 구 캐시엔 없을 수 있음 */
  monthly?: Record<string, { ym: string; days: number; supplyPerDay: number; qtyPerDay: number }[]>;
  /** 지점별 1~12월 계절 팩터(1.0=연평균 일매출, 표본 부족 월 null) */
  seasonalFactors?: Record<string, (number | null)[]>;
}

const STORE_LABEL: Record<string, string> = { pangyo: '판교', yangjae: '양재천', '-': '(지점 미지정)' };
const pctText = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(0)}%`;

// 월별 계절 곡선 + 계절 팩터 — 발주 계획용. 막대 = 그 달의 계절 팩터(1.0 = 연평균 일매출).
function SeasonalCurve({
  store,
  factors,
  monthly,
}: {
  store: string;
  factors: (number | null)[];
  monthly: { ym: string; days: number; supplyPerDay: number }[];
}) {
  const max = Math.max(1, ...factors.filter((f): f is number => f != null));
  const span = monthly.length > 0 ? `${monthly[0].ym} ~ ${monthly[monthly.length - 1].ym}` : '';
  return (
    <div>
      <p className="m-0 mb-2 text-[13px] font-medium">
        {STORE_LABEL[store] ?? store} <span className="tabular font-normal text-muted-foreground text-[11px]">({span})</span>
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {factors.map((f, m) => (
          <div key={m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 44 }}>
            <span className={`tabular text-[11px] ${f != null && f >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
              {f != null ? f.toFixed(2) : '—'}
            </span>
            <div style={{ position: 'relative', width: '100%', height: 56, background: 'hsl(var(--muted) / 0.5)', borderRadius: 2, overflow: 'hidden' }}>
              {f != null && (
                <span
                  style={{
                    position: 'absolute',
                    left: 2,
                    right: 2,
                    bottom: 0,
                    height: `${Math.max(4, (f / max) * 100)}%`,
                    background: 'hsl(var(--foreground))',
                    borderRadius: 1,
                  }}
                />
              )}
            </div>
            <span className="tabular text-[11px] text-muted-foreground">{m + 1}월</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EffectRow({ e }: { e: BandEffect }) {
  const sig = Math.abs(e.t) >= 2;
  const width = Math.min(50, Math.abs(e.pct)); // 바 절반폭 50% = 효과 50%
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr 76px', alignItems: 'center', gap: 10 }}>
      <span className={`text-[13px] ${sig ? 'text-foreground' : 'text-muted-foreground'}`}>{e.label}</span>
      <div style={{ position: 'relative', height: 14 }}>
        <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'hsl(var(--border))' }} />
        <span
          style={{
            position: 'absolute',
            top: 3,
            height: 8,
            borderRadius: 2,
            background: sig ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground) / 0.35)',
            left: e.pct < 0 ? `${50 - width}%` : '50%',
            width: `${width}%`,
          }}
        />
      </div>
      <span className={`tabular text-[13px] ${sig ? 'font-medium text-foreground' : 'text-muted-foreground'}`} style={{ textAlign: 'right' }}>
        {pctText(e.pct)}
        <span className="text-[11px] text-muted-foreground/70"> · {e.n}일</span>
      </span>
    </div>
  );
}

function SeriesCard({ s }: { s: Series }) {
  return (
    <section className="py-[54px]">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h3 className="m-0 text-[15px] font-medium">{s.label}</h3>
        {s.result && (
          <span className="tabular text-[11px] text-muted-foreground">
            n={s.result.n}일 · R²={s.result.r2.toFixed(2)}
          </span>
        )}
      </div>
      {!s.result ? (
        <p className="mt-4 text-[13px] text-muted-foreground">표본이 부족해요(영업일 40일 미만) — 데이터가 더 쌓이면 표시됩니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="ta-label" style={{ marginBottom: 2 }}>기온 (기준 {s.result.tempRef ?? '10–20°'})</p>
            {s.result.temp.map((e) => (
              <EffectRow key={e.band} e={e} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="ta-label" style={{ marginBottom: 2 }}>강수 (기준: 비 없음)</p>
            {s.result.rain.length === 0 ? (
              <p className="m-0 text-[13px] text-muted-foreground">비 온 영업일이 적어 추정 불가</p>
            ) : (
              s.result.rain.map((e) => <EffectRow key={e.band} e={e} />)
            )}
          </div>
          <p className="m-0 text-[11px] text-muted-foreground/80">
            트렌드(기간 처음→끝): <span className="tabular">{pctText(s.result.trendPct)}</span>
            {Math.abs(s.result.trendT) >= 2 ? ' (뚜렷)' : ' (불확실)'}
            {s.result.holidayPct != null && (
              <>
                {' '}· 공휴일: <span className="tabular">{pctText(s.result.holidayPct)}</span>
                {Math.abs(s.result.holidayT ?? 0) >= 2 ? ' (뚜렷)' : ' (불확실)'}
              </>
            )}{' '}
            — 요일·공휴일·트렌드는 통제됨. 흐린 항목은 통계적으로 불확실(|t|&lt;2).
          </p>
        </div>
      )}
    </section>
  );
}

export default function WeatherSalesReport() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const load = (refresh: boolean) => {
    if (refresh) setRecomputing(true);
    fetch(`/api/garden-weather-sales${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `조회 실패 (${r.status})`);
        setError(null);
        setData(j);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '조회 실패'))
      .finally(() => setRecomputing(false));
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-muted/40 p-5">
        <p className="m-0 text-[13px] text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-md p-5" style={{ background: 'hsl(var(--muted) / 0.4)' }}>
        <p className="m-0 text-[13px] text-muted-foreground">POS 전 기간 × 과거 날씨를 계산하는 중…</p>
      </div>
    );
  }

  return (
    // 카드 해체(2026-08-08) — 주요 섹션 경계는 가로 구분선으로만
    <div className="divide-y divide-border">
      {/* 커버리지 */}
      <section className="pb-[54px]">
        <p className="ta-label">데이터 커버리지</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.coverage.map((c) => (
            <p key={c.store} className="m-0 text-[13px]">
              <span className="font-medium">{STORE_LABEL[c.store] ?? c.store}</span>{' '}
              <span className="tabular text-muted-foreground">
                {c.from} ~ {c.to} · 영업일 {c.days}일
              </span>
              {c.sparseMonths.length > 0 && (
                <span className="text-[11px]" style={{ color: 'hsl(var(--destructive))' }}>
                  {' '}
                  누락 의심: {c.sparseMonths.join(', ')}
                </span>
              )}
            </p>
          ))}
          <p className="m-0 mt-1 text-[11px] text-muted-foreground/80">
            날씨 조인 {data.weatherDays}일 (Open-Meteo Archive, 최근 약 5일은 아카이브 지연으로 제외)
            {data.computedAt && (
              <>
                {' '}· 계산 {new Date(data.computedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {data.cached && ' (캐시)'} ·{' '}
                <button
                  type="button"
                  onClick={() => load(true)}
                  disabled={recomputing}
                  className="hover:text-foreground"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  {recomputing ? '계산 중…' : '다시 계산'}
                </button>
              </>
            )}
          </p>
          {Date.parse(KR_HOLIDAYS_UNTIL) - Date.now() < 60 * 86400_000 && (
            <p className="m-0 mt-1 text-[11px]" style={{ color: 'hsl(var(--destructive))' }}>
              공휴일 목록이 {KR_HOLIDAYS_UNTIL}까지만 등록돼 있어요 — lib/garden/krHolidays.ts 연장 필요 (공휴일 통제·휴일
              강조가 그 이후 날짜엔 빠집니다)
            </p>
          )}
        </div>
      </section>

      {/* 월별 계절 곡선 · 계절 팩터 — 발주 계획의 기준선. 구 캐시엔 없어서 '다시 계산' 후 표시됨 */}
      {data.seasonalFactors && data.monthly && (
        <section className="py-[54px]">
          <p className="ta-label">월별 계절 팩터 (1.0 = 연평균 일매출)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36, overflowX: 'auto' }}>
            {Object.entries(data.seasonalFactors)
              .filter(([store]) => store !== '-')
              .map(([store, factors]) => (
                <SeasonalCurve key={store} store={store} factors={factors} monthly={data.monthly?.[store] ?? []} />
              ))}
          </div>
          <p className="m-0 mt-4 text-[11px] text-muted-foreground/80">
            발주 계획: 연평균 대비 그 달을 몇 %로 잡을지의 기준선. 성장 트렌드 미보정 원시 평균이라 신규 지점 초기 달은
            낮게, 최근 달은 높게 나올 수 있어요. 영업 10일 미만인 달은 제외(—).
          </p>
        </section>
      )}

      {data.series.map((s) => (
        <SeriesCard key={s.key} s={s} />
      ))}

      {/* 판교 커피 메뉴 후보 — 페이히어는 카테고리=메뉴명이라 잔수 분석엔 메뉴 선별이 필요 */}
      {data.categories.pangyo && (
        <section className="pt-[54px]">
          <p className="ta-label">판교 카테고리(메뉴) 상위 — 커피 메뉴 선별용</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            {data.categories.pangyo.map((c) => (
              <span key={c.category} className="tabular text-[13px] text-muted-foreground">
                {c.category} <span className="text-[11px]">({c.qty.toLocaleString()}건)</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
