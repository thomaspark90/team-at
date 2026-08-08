'use client';

import { CHAMPION_RECIPES } from '@/lib/champion-recipes';

export default function ChampionRecipes() {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <div className="min-w-0">
        <p className="ta-label" style={{ marginBottom: 4 }}>필터 레시피 추천 — 월드 브루어스컵 챔피언</p>
        <p className="text-[11px] text-muted-foreground" style={{ margin: 0 }}>
          24·25·26년 우승 레시피를 매장 카드 형식으로 정리했어요. 출처에 공개된 수치 그대로이며, 없는 값은 생략.
          바리스타 챔피언십(WBC)은 에스프레소 종목이라 필터 레시피가 없어 브루어스컵 기준이에요.
        </p>
      </div>

      {CHAMPION_RECIPES.map((r) => (
        <div key={r.year} className="rounded-md border border-border" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* 헤더 — 연도·대회·챔피언 */}
          <div className="bg-muted" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '10px 16px', borderBottom: '1px solid hsl(var(--border))', flexWrap: 'wrap' }}>
            <span className="text-[15px] text-foreground" style={{ fontWeight: 500 }}>
              {r.year} {r.event} <span className="text-muted-foreground text-[12px]">({r.location})</span>
            </span>
            <span className="text-[13px] text-foreground" style={{ flexShrink: 0 }}>
              {r.champion} <span className="text-muted-foreground text-[11px]">{r.nation}</span>
            </span>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>☕ {r.coffee}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SpecRow label="드리퍼" value={r.dripper} />
              <SpecRow label="필터" value={r.filter ?? null} />
              <SpecRow label="도징량" value={`${r.doseG}g`} />
              <SpecRow label="총 물량" value={`${r.waterG}g · ${r.ratio}`} />
              <SpecRow label="물 온도" value={r.temp} />
              <SpecRow label="분쇄도" value={r.grind ?? null} />
              <SpecRow label="추출수" value={r.brewWater ?? null} />
              <SpecRow label="총 추출 시간" value={r.totalTime} />
            </div>

            {/* 푸어링 단계 — 대시보드 카드와 동일 포맷 */}
            <div className="rounded-md border border-border" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.steps.map((s, i) => {
                const cum = r.steps.slice(0, i + 1).reduce((a, x) => a + x.water, 0);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                    <span className="text-muted-foreground">
                      {s.at} {s.label}
                    </span>
                    {s.water > 0 && (
                      <span className="tabular text-foreground" style={{ flexShrink: 0 }}>
                        {s.water}g <span className="text-muted-foreground">/ {cum}g</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {r.tips.length > 0 && (
              <ul className="text-[11px] text-muted-foreground" style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {r.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}

            <p className="text-[11px] text-muted-foreground" style={{ margin: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              출처:
              {r.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                  {s.label}
                </a>
              ))}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
      <span className="text-muted-foreground" style={{ flexShrink: 0 }}>{label}</span>
      <span className="tabular text-foreground" style={{ textAlign: 'right', minWidth: 0 }}>{value}</span>
    </div>
  );
}
