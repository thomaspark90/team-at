'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// 2주 날씨 스트립 — 가든 대시보드 맨 위. 날씨가 원두 소진량에 영향이 커서 발주 판단 참고용.
// 판교·양재천 중간 좌표(37.43, 127.07) 기준 단일 예보 — 두 매장은 직선 8km라 예보가 사실상 동일.
// 데이터는 Open-Meteo(키 불필요, CORS 허용)에서 브라우저가 직접 받는다. 최대 16일.
// 10일 이후 예보는 신뢰도가 낮아 캡션으로 참고용임을 밝힌다.

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

type Day = {
  date: Date;
  code: number;
  tMax: number;
  tMin: number;
  feelMax: number;
  rainMm: number;
  rainProb: number | null;
  windMax: number | null;
  humidity: number | null;
};

// WMO weather code → 모노 글리프(U+FE0E 텍스트 표현) + 한글 라벨
const wmo = (code: number): { glyph: string; label: string } => {
  if (code === 0) return { glyph: '☀︎', label: '맑음' };
  if (code === 1) return { glyph: '☀︎', label: '대체로 맑음' };
  if (code === 2) return { glyph: '☁︎', label: '구름 조금' };
  if (code === 3) return { glyph: '☁︎', label: '흐림' };
  if (code === 45 || code === 48) return { glyph: '≡', label: '안개' };
  if (code >= 51 && code <= 57) return { glyph: '☂︎', label: '이슬비' };
  if (code >= 61 && code <= 67) return { glyph: '☂︎', label: '비' };
  if (code >= 71 && code <= 77) return { glyph: '❄︎', label: '눈' };
  if (code >= 80 && code <= 82) return { glyph: '☂︎', label: '소나기' };
  if (code === 85 || code === 86) return { glyph: '❄︎', label: '소낙눈' };
  if (code >= 95) return { glyph: '⚡︎', label: '뇌우' };
  return { glyph: '☁︎', label: '—' };
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 뇌우 전용 번개 아이콘 — 유니코드 ⚡︎ 는 기기에 따라 렌더가 제각각이라 SVG 로 고정
const Bolt = () => (
  <svg width="11" height="13" viewBox="0 0 11 13" aria-hidden style={{ flexShrink: 0 }}>
    <path d="M6.5 0 L0.5 7.5 H4 L2.8 13 L10.5 5 H6.6 L8.6 0 Z" fill="#f59e0b" />
  </svg>
);

// 맑음(코드 0·1) 전용 해 아이콘 — 노란 태양이 은은하게 빛난다(글로우 펄스)
const Sun = () => (
  <svg className="ws-sun" width="13" height="13" viewBox="0 0 14 14" aria-hidden style={{ flexShrink: 0 }}>
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
);

type WaveVariant = 'a' | 'b';

export default function WeatherStrip() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [failed, setFailed] = useState(false);
  // 물결 디자인 비교용 토글 — A: 회전 타원(가운데 봉긋), B: 평평한 수면 + 흐르는 잔물결
  const [variant, setVariant] = useState<WaveVariant>('b');

  useEffect(() => {
    const saved = localStorage.getItem('ws-wave-variant');
    if (saved === 'a' || saved === 'b') setVariant(saved);
  }, []);
  const cycleVariant = () => {
    const next: WaveVariant = variant === 'a' ? 'b' : 'a';
    setVariant(next);
    localStorage.setItem('ws-wave-variant', next);
  };

  useEffect(() => {
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
            date: new Date(d.time[i] + 'T00:00:00+09:00'),
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
        setDays(out);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null; // 날씨는 부가 정보 — 실패해도 대시보드는 그대로

  return (
    <section>
      {/* 물결 애니메이션 — 이 컴포넌트 전용이라 globals 대신 여기 둔다 */}
      <style>{`
        @keyframes ws-slosh-a { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ws-slosh-b { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .ws-wave {
          position: absolute; left: 50%; width: 280px; height: 280px; margin-left: -140px;
          border-radius: 46% 54% 50% 50% / 52% 48% 55% 45%;
          background: rgba(59, 130, 246, 0.20);
          animation: ws-slosh-a 9s linear infinite;
        }
        .ws-wave-b {
          border-radius: 54% 46% 48% 52% / 46% 54% 47% 53%;
          background: rgba(96, 165, 250, 0.16);
          animation: ws-slosh-b 13s linear infinite;
        }
        /* B안 — 평평한 수면 + 좌우로 흐르는 잔물결 두 겹 + 미세한 상하 출렁임 */
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
        /* 맑음 해 글로우 — 드롭섀도가 커졌다 작아지며 빛나는 느낌 */
        @keyframes ws-sun-glow {
          from { filter: drop-shadow(0 0 0.5px rgba(251, 191, 36, 0.6)); }
          to { filter: drop-shadow(0 0 3.5px rgba(251, 191, 36, 0.95)); }
        }
        .ws-sun { animation: ws-sun-glow 2.6s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .ws-wave, .ws-wave-b, .ws2-bob, .ws2-surf-a, .ws2-surf-b, .ws-sun { animation: none; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p className="ta-label" style={{ marginBottom: 0 }}>2주 날씨 — 판교·양재천</p>
        <span className="text-[11px] text-muted-foreground/70">
          Open-Meteo · 10일 이후는 경향 참고용 ·{' '}
          <button
            type="button"
            onClick={cycleVariant}
            title="비 오는 날 물결 디자인 전환 (A: 회전 타원 / B: 흐르는 잔물결)"
            className="hover:text-foreground"
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            물결 {variant.toUpperCase()}
          </button>{' '}
          ·{' '}
          <Link href="/garden/weather" className="underline underline-offset-2 hover:text-foreground">
            판매 분석 →
          </Link>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {(days ?? Array.from({ length: 16 })).map((day: Day | undefined, i) => {
          if (!day) {
            return (
              <div
                key={i}
                className="rounded-md border border-border"
                style={{ minWidth: 92, height: 132, background: 'hsl(var(--muted) / 0.4)' }}
              />
            );
          }
          const dow = day.date.getDay();
          const weekend = dow === 0 || dow === 6;
          const today = i === 0;
          const w = wmo(day.code);
          const rainy = day.rainMm >= 1 || (day.rainProb ?? 0) >= 40;
          // 물 채움 — 비 계열(이슬비·비·소나기·뇌우)만, 수위 = 강수확률
          const wet = (w.glyph === '☂︎' || w.glyph === '⚡︎') && (day.rainProb ?? 0) > 0;
          const waterline = 100 - Math.min(96, day.rainProb ?? 0);
          return (
            <div
              key={day.date.toISOString()}
              className={`rounded-md border ${weekend ? 'bg-muted' : 'bg-background'}`}
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
                  {variant === 'a' ? (
                    <>
                      {/* A안: 회전하는 비정형 타원 두 장 — 수면이 서로 어긋나며 찰랑거린다 */}
                      <div className="ws-wave" style={{ top: `calc(${waterline}% - 8px)` }} />
                      <div className="ws-wave ws-wave-b" style={{ top: `calc(${waterline}% - 8px)` }} />
                    </>
                  ) : (
                    /* B안: 평평한 수면 위로 잔물결이 좌우로 흐르고 전체가 살짝 출렁인다 */
                    <div className="ws2-bob" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${100 - waterline}%` }}>
                      <div className="ws2-body" />
                      <div className="ws2-surf ws2-surf-a" />
                      <div className="ws2-surf ws2-surf-b" />
                    </div>
                  )}
                </div>
              )}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                className={`text-[11px] ${weekend || today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
              >
                {today ? '오늘' : `${day.date.getMonth() + 1}/${day.date.getDate()} (${DOW[dow]})`}
              </span>
              <span className="text-[13px] text-foreground" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {day.code <= 1 ? <Sun /> : day.code >= 95 ? <Bolt /> : <span aria-hidden>{w.glyph}</span>}
                <span style={{ whiteSpace: 'nowrap' }}>{w.label}</span>
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
              <span className="tabular text-[11px] text-muted-foreground/70" style={{ whiteSpace: 'nowrap' }}>
                {day.humidity != null && `${Math.round(day.humidity)}%`}
                {day.windMax != null && ` · ${Math.round(day.windMax)}㎞/h`}
              </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
