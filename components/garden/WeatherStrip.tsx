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
  '&forecast_days=16&timezone=Asia%2FSeoul';

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

export default function WeatherStrip() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(API)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
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
            rainProb: d.precipitation_probability_max[i],
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
        @media (prefers-reduced-motion: reduce) { .ws-wave, .ws-wave-b { animation: none; } }
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
                  {/* 회전하는 비정형 타원 두 장 — 수면이 서로 어긋나며 찰랑거린다 */}
                  <div className="ws-wave" style={{ top: `calc(${waterline}% - 8px)` }} />
                  <div className="ws-wave ws-wave-b" style={{ top: `calc(${waterline}% - 8px)` }} />
                </div>
              )}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                className={`text-[11px] ${weekend || today ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
              >
                {today ? '오늘' : `${day.date.getMonth() + 1}/${day.date.getDate()} (${DOW[dow]})`}
              </span>
              <span className="text-[13px] text-foreground" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden>{w.glyph}</span>
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
