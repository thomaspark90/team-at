'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { KR_HOLIDAYS } from '@/lib/garden/krHolidays';
import { buildTomorrowForecast, buildWeatherComments } from '@/lib/garden/weatherComment';
import {
  fetchForecast,
  fetchPm25,
  isRainCode,
  isSnowCode,
  PM25_BAD,
  PM25_VERY_BAD,
  wmoLabel,
  type ForecastDay,
  type HourPoint,
} from '@/lib/garden/weatherForecast';

// 2주 날씨 스트립 — 가든 대시보드 맨 위. 날씨가 원두 소진량에 영향이 커서 발주 판단 참고용.
// 예보 조회·매핑 규칙은 lib/garden/weatherForecast(주간 브리핑 크론과 공유)에 있다.
// 매장에서 탭을 켜둔 채 두는 용도라 3시간 주기 + 탭 복귀 시(30분 경과) 재조회한다.

const REFRESH_MS = 3 * 3600_000;
const VISIBLE_REFRESH_MIN_MS = 30 * 60_000;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const kstTodayYmd = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// ---------- 아이콘 (유니코드 글리프는 기기별 렌더가 제각각이라 상태별 SVG 고정) ----------

// 맑음 — 노란 해 + 뒤의 글로우 원이 opacity 로만 펄스(합성 레이어라 리페인트 없음)
const Sun = () => (
  <span aria-hidden style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
    <span className="ws-sun-glow" />
    <svg width="13" height="13" viewBox="0 0 14 14" style={{ position: 'relative' }}>
      <circle cx="7" cy="7" r="3" fill="#fbbf24" />
      <g stroke="#fbbf24" strokeWidth="1.2" strokeLinecap="round">
        <line x1="7" y1="0.6" x2="7" y2="2.2" />
        <line x1="7" y1="11.8" x2="7" y2="13.4" />
        <line x1="0.6" y1="7" x2="2.2" y2="7" />
        <line x1="11.8" y1="7" x2="13.4" y2="7" />
        <line x1="2.5" y1="2.5" x2="3.6" y2="3.6" />
        <line x1="10.4" y1="10.4" x2="11.5" y2="11.5" />
        <line x1="2.5" y1="11.5" x2="3.6" y2="10.4" />
        <line x1="10.4" y1="3.6" x2="11.5" y2="2.5" />
      </g>
    </svg>
  </span>
);

// 구름 조금 — 해가 구름 뒤로 빼꼼
const CloudSun = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden style={{ flexShrink: 0 }}>
    <circle cx="9.8" cy="4.2" r="2.6" fill="#fbbf24" />
    <g fill="#9ca3af">
      <circle cx="4.2" cy="9.4" r="2.4" />
      <circle cx="7" cy="8" r="2.7" />
      <circle cx="9.6" cy="9.6" r="2.1" />
      <rect x="4.2" y="8.8" width="5.4" height="2.9" />
    </g>
  </svg>
);

// 흐림 — 회색 구름
const Cloud = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden style={{ flexShrink: 0 }}>
    <g fill="#9ca3af">
      <circle cx="4.3" cy="8.6" r="2.5" />
      <circle cx="7.3" cy="7" r="3" />
      <circle cx="10" cy="8.8" r="2.3" />
      <rect x="4.3" y="8.2" width="5.7" height="2.9" />
    </g>
  </svg>
);

// 뇌우 — 노란 번개
const Bolt = () => (
  <svg width="11" height="13" viewBox="0 0 11 13" aria-hidden style={{ flexShrink: 0 }}>
    <path d="M6.5 0 L0.5 7.5 H4 L2.8 13 L10.5 5 H6.6 L8.6 0 Z" fill="#f59e0b" />
  </svg>
);

const iconOf = (code: number) => {
  if (code <= 1) return <Sun />;
  if (code === 2) return <CloudSun />;
  if (code === 3) return <Cloud />;
  if (code >= 95) return <Bolt />;
  if (isSnowCode(code)) return <span aria-hidden style={{ color: '#94a3b8' }}>❄︎</span>;
  if (isRainCode(code)) return <span aria-hidden>☂︎</span>;
  return <span aria-hidden>≡</span>; // 안개 등
};

export default function WeatherStrip() {
  const [days, setDays] = useState<ForecastDay[] | null>(null);
  const [hours, setHours] = useState<Map<string, HourPoint[]>>(new Map());
  const [pm25, setPm25] = useState<Map<string, number>>(new Map());
  // 요일별 기준 잔수 — 분석이 갱신한 최신값(실패 시 weatherImpact 내장 상수 폴백)
  const [cupsByDow, setCupsByDow] = useState<number[] | undefined>(undefined);
  // 날씨 요약 문장 — 평소엔 숨기고 '더보기'로 펼친다 (발주 판단 때만 참고하는 부가 정보)
  const [showNotes, setShowNotes] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // 카드 클릭 → 시간대별 상세
  const [failed, setFailed] = useState(false);
  const hasData = useRef(false);
  const lastFetch = useRef(0);

  const load = () => {
    lastFetch.current = Date.now();
    fetchForecast()
      .then((r) => {
        hasData.current = true;
        setFailed(false);
        setDays(r.days);
        setHours(r.hours);
      })
      .catch(() => {
        // 재조회 실패면 기존 데이터 유지 — 첫 조회부터 실패했을 때만 숨긴다
        if (!hasData.current) setFailed(true);
      });
    // 미세먼지는 부가 정보 — 실패해도 스트립엔 영향 없음
    fetchPm25()
      .then(setPm25)
      .catch(() => {});
    // 최신 기준 잔수 — 없으면(404 등) 내장 상수로 폴백
    fetch('/api/garden-weather-baselines', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.yangjaeCoffeeCupsByDow) && j.yangjaeCoffeeCupsByDow.length === 7) {
          setCupsByDow(j.yangjaeCoffeeCupsByDow as number[]);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > VISIBLE_REFRESH_MIN_MS) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null; // 날씨는 부가 정보 — 실패해도 대시보드는 그대로

  const todayYmd = kstTodayYmd();
  // 자정이 지나 재조회 전이라도 지난 날짜 카드는 걸러낸다
  const visible = days?.filter((day) => day.ymd >= todayYmd) ?? null;
  const comments = visible ? buildWeatherComments(visible) : [];
  const tomorrow = visible ? buildTomorrowForecast(visible, cupsByDow) : null;

  return (
    <section>
      {/* 날씨 이펙트 애니메이션 — 이 컴포넌트 전용이라 globals 대신 여기 둔다 */}
      <style>{`
        /* 물결 — 평평한 수면 + 좌우로 흐르는 잔물결 두 겹 + 미세한 상하 출렁임 */
        @keyframes ws2-bob { from { transform: translateY(0); } to { transform: translateY(2px); } }
        @keyframes ws2-drift-a { from { transform: translateX(0); } to { transform: translateX(48px); } }
        @keyframes ws2-drift-b { from { transform: translateX(0); } to { transform: translateX(-48px); } }
        .ws2-bob { animation: ws2-bob 3.2s ease-in-out infinite alternate; }
        .ws2-body { position: absolute; left: 0; right: 0; top: 9px; bottom: -3px; background: rgba(59, 130, 246, 0.20); }
        .ws2-surf {
          position: absolute; top: 0; left: -96px; width: calc(100% + 192px); height: 10px;
          background-repeat: repeat-x; background-size: 48px 10px;
        }
        .ws2-surf-a {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 10' preserveAspectRatio='none'%3E%3Cpath d='M0 5 Q12 0 24 5 T48 5 V10 H0 Z' fill='%233b82f6' fill-opacity='0.20'/%3E%3C/svg%3E");
          animation: ws2-drift-a 3.6s linear infinite;
        }
        .ws2-surf-b {
          top: 2px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 10' preserveAspectRatio='none'%3E%3Cpath d='M0 5 Q12 10 24 5 T48 5 V10 H0 Z' fill='%2360a5fa' fill-opacity='0.14'/%3E%3C/svg%3E");
          animation: ws2-drift-b 5.4s linear infinite;
        }
        /* 맑음 해 글로우 — opacity 펄스만이라 GPU 합성으로 처리(드롭섀도 리페인트 회피) */
        @keyframes ws-sun-pulse { from { opacity: 0.25; } to { opacity: 1; } }
        .ws-sun-glow {
          position: absolute; inset: -4px; border-radius: 9999px;
          background: radial-gradient(circle, rgba(251, 191, 36, 0.5) 0%, rgba(251, 191, 36, 0) 70%);
          animation: ws-sun-pulse 2.6s ease-in-out infinite alternate;
        }
        /* 눈 — 점 타일 두 겹이 서로 다른 속도로 내려온다 */
        @keyframes ws-snow-fall { from { transform: translateY(0); } to { transform: translateY(28px); } }
        .ws-snow {
          position: absolute; left: 0; right: 0; top: -28px; bottom: 0;
          background-repeat: repeat; background-size: 28px 28px;
        }
        .ws-snow-a {
          background-image: radial-gradient(circle at 7px 9px, rgba(148, 163, 184, 0.55) 1.3px, transparent 1.8px);
          animation: ws-snow-fall 3.8s linear infinite;
        }
        .ws-snow-b {
          background-image: radial-gradient(circle at 19px 20px, rgba(148, 163, 184, 0.35) 1px, transparent 1.5px);
          animation: ws-snow-fall 6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ws2-bob, .ws2-surf-a, .ws2-surf-b, .ws-sun-glow, .ws-snow-a, .ws-snow-b { animation: none; }
        }
        /* 달력 관습 색 — 토요일 파랑, 일요일·공휴일 빨강. 다크 모드는 한 단계 밝게 */
        .ws-day-red { color: hsl(0 72% 45%); }
        .ws-day-blue { color: hsl(217 75% 48%); }
        .dark .ws-day-red { color: hsl(0 84% 68%); }
        .dark .ws-day-blue { color: hsl(217 90% 70%); }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p className="ta-label" style={{ marginBottom: 0 }}>2주 날씨 — 판교·양재천</p>
        <span className="text-[11px] text-muted-foreground/70">
          Open-Meteo · 10일 이후는 경향 참고용 ·{' '}
          {(comments.length > 0 || tomorrow) && (
            <>
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="underline underline-offset-2 hover:text-foreground"
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
              >
                {showNotes ? '요약 접기' : '더보기'}
              </button>
              {' · '}
            </>
          )}
          <Link href="/garden/weather" className="underline underline-offset-2 hover:text-foreground">
            판매 분석 →
          </Link>
        </span>
      </div>
      {showNotes && (comments.length > 0 || tomorrow) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
          {comments.map((c) => (
            <p key={c} className="m-0 text-[13px] text-foreground">
              <span className="text-muted-foreground">▸</span> {c}
            </p>
          ))}
          {tomorrow && (
            <p className="m-0 text-[13px] text-muted-foreground">
              <span>▸</span> {tomorrow}
            </p>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {(visible ?? Array.from({ length: 16 })).map((day: ForecastDay | undefined, i) => {
          if (!day) {
            return (
              <div
                key={i}
                className="rounded-md border border-border"
                style={{ minWidth: 92, height: 132, background: 'hsl(var(--muted) / 0.4)' }}
              />
            );
          }
          const dow = new Date(day.ymd + 'T00:00:00Z').getUTCDay();
          const weekend = dow === 0 || dow === 6;
          const holiday = KR_HOLIDAYS.has(day.ymd);
          const dayOff = weekend || holiday; // 주말·공휴일 — 매출 집중일 강조
          const today = day.ymd === todayYmd;
          const label = wmoLabel(day.code);
          const rainy = day.rainMm >= 1 || (day.rainProb ?? 0) >= 40;
          // 물 채움 — 비 계열(이슬비·비·소나기·뇌우)만, 수위 = 영업시간대 강수확률
          const wet = isRainCode(day.code) && (day.rainProb ?? 0) > 0;
          const waterHeight = Math.min(96, day.rainProb ?? 0);
          const snowy = isSnowCode(day.code);
          const humidWind = [
            day.humidity != null ? `${Math.round(day.humidity)}%` : null,
            day.windMax != null ? `${Math.round(day.windMax)}㎞/h` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          const pm = pm25.get(day.ymd);
          const isSelected = selected === day.ymd;
          const [, m, dd] = day.ymd.split('-');
          return (
            <div
              key={day.ymd}
              className={`rounded-md border ${dayOff ? 'bg-muted' : 'bg-background'}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(isSelected ? null : day.ymd)}
              onKeyDown={(e) => e.key === 'Enter' && setSelected(isSelected ? null : day.ymd)}
              title="클릭하면 시간대별 상세"
              style={{
                minWidth: 92,
                padding: '9px 10px',
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0,
                cursor: 'pointer',
                borderColor: today ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
                boxShadow: isSelected ? '0 0 0 1px hsl(var(--foreground))' : undefined,
              }}
            >
              {wet && (
                <div
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }}
                >
                  <div className="ws2-bob" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${waterHeight}%` }}>
                    <div className="ws2-body" />
                    <div className="ws2-surf ws2-surf-a" />
                    <div className="ws2-surf ws2-surf-b" />
                  </div>
                </div>
              )}
              {snowy && (
                <div
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }}
                >
                  <div className="ws-snow ws-snow-a" />
                  <div className="ws-snow ws-snow-b" />
                </div>
              )}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  className={`text-[11px] ${dayOff || today ? 'font-medium' : ''} ${
                    holiday || dow === 0
                      ? 'ws-day-red'
                      : dow === 6
                        ? 'ws-day-blue'
                        : dayOff || today
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                  }`}
                >
                  {today ? '오늘' : `${Number(m)}/${Number(dd)} (${DOW[dow]}${holiday ? '·휴' : ''})`}
                </span>
                <span className="text-[13px] text-foreground" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {iconOf(day.code)}
                  <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                </span>
                <span className="tabular text-[13px]">
                  <span className="text-foreground">{Math.round(day.tMax)}°</span>
                  <span className="text-muted-foreground"> / {Math.round(day.tMin)}°</span>
                </span>
                <span className="tabular text-[11px] text-muted-foreground" style={{ whiteSpace: 'nowrap' }}>
                  체감 {Math.round(day.feelMax)}°
                </span>
                <span
                  className={`tabular text-[11px] ${rainy ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                  style={{ whiteSpace: 'nowrap' }}
                  title="강수량 · 영업시간(11–20시) 최대 강수확률"
                >
                  {day.rainMm >= 0.1 ? `${day.rainMm.toFixed(1)}mm` : '0mm'}
                  {day.rainProb != null && ` · ${day.rainProb}%`}
                </span>
                {humidWind && (
                  <span className="tabular text-[11px] text-muted-foreground/70" style={{ whiteSpace: 'nowrap' }}>
                    {humidWind}
                  </span>
                )}
                {pm != null && pm >= PM25_BAD && (
                  <span
                    className="tabular text-[11px] font-medium"
                    style={{ whiteSpace: 'nowrap', color: pm >= PM25_VERY_BAD ? 'hsl(var(--destructive))' : 'hsl(25 85% 45%)' }}
                    title="영업시간(11–20시) 최대 PM2.5"
                  >
                    미세 {pm >= PM25_VERY_BAD ? '매우 나쁨' : '나쁨'} {Math.round(pm)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selected && hours.get(selected) && (
        <div className="rounded-md border border-border bg-background" style={{ marginTop: 6, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <p className="ta-label" style={{ marginBottom: 0 }}>
              {Number(selected.slice(5, 7))}/{Number(selected.slice(8, 10))} 시간대별 — 기온 · 강수확률
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
            >
              닫기 ✕
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', alignItems: 'flex-end' }}>
            {(hours.get(selected) ?? [])
              .filter((p) => p.hour >= 8 && p.hour <= 21)
              .map((p) => (
                <div
                  key={p.hour}
                  title={`${p.hour}시 · ${Math.round(p.temp)}° · 비 ${p.prob}%${p.mm >= 0.1 ? ` ${p.mm.toFixed(1)}mm` : ''}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 34, flexShrink: 0 }}
                >
                  <span className="tabular text-[11px] text-foreground">{Math.round(p.temp)}°</span>
                  <div style={{ position: 'relative', width: 14, height: 44, background: 'hsl(var(--muted))', borderRadius: 2, overflow: 'hidden' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: `${p.prob}%`,
                        background: 'rgba(59, 130, 246, 0.55)',
                      }}
                    />
                  </div>
                  <span className={`tabular text-[11px] ${p.prob >= 40 ? 'text-foreground' : 'text-muted-foreground/70'}`}>
                    {p.prob}
                  </span>
                  <span className="tabular text-[11px] text-muted-foreground">{p.hour}시</span>
                </div>
              ))}
          </div>
          <p className="m-0 mt-2 text-[11px] text-muted-foreground/70">막대 = 강수확률(%) · 8–21시 · 회색 영역이 100%</p>
        </div>
      )}
    </section>
  );
}
