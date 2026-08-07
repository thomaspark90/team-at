'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { KR_HOLIDAYS } from '@/lib/garden/krHolidays';

// 2주 날씨 스트립 — 가든 대시보드 맨 위. 날씨가 원두 소진량에 영향이 커서 발주 판단 참고용.
// 판교·양재천 중간 좌표(37.43, 127.07) 기준 단일 예보 — 두 매장은 직선 8km라 예보가 사실상 동일.
// 데이터는 Open-Meteo(키 불필요, CORS 허용)에서 브라우저가 직접 받는다. 최대 16일.
// 매장에서 탭을 켜둔 채 두는 용도라 3시간 주기 + 탭 복귀 시(30분 경과) 재조회한다.

const LAT = 37.43;
const LON = 127.07;
const API =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean' +
  '&hourly=precipitation_probability&forecast_days=16&timezone=Asia%2FSeoul';

// 강수확률은 영업시간대(11–20시) 최대를 쓴다 — 일 최대는 새벽 소나기까지 잡혀
// '강수량 0mm · 확률 97%' 같은 혼란을 만든다(2026-08-08 대표 지적). 매장 판단엔 낮 시간이 중요.
const BIZ_START = 11;
const BIZ_END = 20;

const REFRESH_MS = 3 * 3600_000;
const VISIBLE_REFRESH_MIN_MS = 30 * 60_000;

type Day = {
  ymd: string; // 'YYYY-MM-DD'
  code: number;
  tMax: number;
  tMin: number;
  feelMax: number;
  rainMm: number;
  rainProb: number | null;
  windMax: number | null;
  humidity: number | null;
};

// WMO weather code → 라벨 (아이콘은 코드별 SVG/글리프로 렌더)
const wmo = (code: number): string => {
  if (code === 0) return '맑음';
  if (code === 1) return '대체로 맑음';
  if (code === 2) return '구름 조금';
  if (code === 3) return '흐림';
  if (code === 45 || code === 48) return '안개';
  if (code >= 51 && code <= 57) return '이슬비';
  if (code >= 61 && code <= 67) return '비';
  if (code >= 71 && code <= 77) return '눈';
  if (code >= 80 && code <= 82) return '소나기';
  if (code === 85 || code === 86) return '소낙눈';
  if (code >= 95) return '뇌우';
  return '—';
};

const isSnowCode = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86;
const isRainCode = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;

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
  const [days, setDays] = useState<Day[] | null>(null);
  const [failed, setFailed] = useState(false);
  const hasData = useRef(false);
  const lastFetch = useRef(0);

  const load = () => {
    lastFetch.current = Date.now();
    fetch(API)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        // 날짜별 영업시간대 최대 강수확률
        const bizProb = new Map<string, number>();
        const h = j.hourly;
        for (let i = 0; i < (h?.time?.length ?? 0); i++) {
          const hour = Number(h.time[i].slice(11, 13));
          if (hour < BIZ_START || hour > BIZ_END) continue;
          const p = h.precipitation_probability[i];
          if (p == null) continue;
          const date = h.time[i].slice(0, 10);
          bizProb.set(date, Math.max(bizProb.get(date) ?? 0, p));
        }
        const d = j.daily;
        const out: Day[] = [];
        for (let i = 0; i < d.time.length; i++) {
          // 마지막 날은 모델 커버리지에 따라 값이 비기도 함 — 핵심값 없으면 제외
          if (d.temperature_2m_max[i] == null || d.weather_code[i] == null) continue;
          out.push({
            ymd: d.time[i],
            code: d.weather_code[i],
            tMax: d.temperature_2m_max[i],
            tMin: d.temperature_2m_min[i],
            feelMax: d.apparent_temperature_max[i] ?? d.temperature_2m_max[i],
            rainMm: d.precipitation_sum[i] ?? 0,
            rainProb: bizProb.get(d.time[i]) ?? d.precipitation_probability_max[i],
            windMax: d.wind_speed_10m_max[i],
            humidity: d.relative_humidity_2m_mean[i],
          });
        }
        hasData.current = true;
        setFailed(false);
        setDays(out);
      })
      .catch(() => {
        // 재조회 실패면 기존 데이터 유지 — 첫 조회부터 실패했을 때만 숨긴다
        if (!hasData.current) setFailed(true);
      });
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
      `}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p className="ta-label" style={{ marginBottom: 0 }}>2주 날씨 — 판교·양재천</p>
        <span className="text-[11px] text-muted-foreground/70">
          Open-Meteo · 10일 이후는 경향 참고용 ·{' '}
          <Link href="/garden/weather" className="underline underline-offset-2 hover:text-foreground">
            판매 분석 →
          </Link>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {(visible ?? Array.from({ length: 16 })).map((day: Day | undefined, i) => {
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
          const label = wmo(day.code);
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
          const [, m, dd] = day.ymd.split('-');
          return (
            <div
              key={day.ymd}
              className={`rounded-md border ${dayOff ? 'bg-muted' : 'bg-background'}`}
              style={{
                minWidth: 92,
                padding: '9px 10px',
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0,
                borderColor: today ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
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
                <span className={`text-[11px] ${dayOff || today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
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
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
