'use client';

import { CHAMPION_RECIPES } from '@/lib/champion-recipes';
import GuideHead from '@/components/garden/GuideHead';

export default function ChampionRecipes() {
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {/* 머리 — 교육 자료 세 화면 공통 틀(제목 + 한 줄 설명 + 목차, 2026-11-24) */}
      <GuideHead
        title="필터 레시피 추천"
        lead="월드 브루어스컵 챔피언의 24·25·26년 우승 레시피를 매장 카드 형식으로 정리했어요. 출처에 공개된 수치 그대로이며, 없는 값은 생략. 바리스타 챔피언십(WBC)은 에스프레소 종목이라 필터 레시피가 없어 브루어스컵 기준이에요."
        sections={CHAMPION_RECIPES.map((r) => ({ id: `champion-${r.year}`, label: `${r.year} ${r.champion}` }))}
      />

      {CHAMPION_RECIPES.map((r, idx) => (
        <div key={r.year} id={`champion-${r.year}`} className={`min-w-0 scroll-mt-28 ${idx === 0 ? 'pb-[54px]' : idx === CHAMPION_RECIPES.length - 1 ? 'fc-shade-t pt-[54px]' : 'fc-shade-t py-[54px]'}`} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* 헤더 — 연도·대회·챔피언 */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="text-title font-medium text-foreground">
              {r.year} {r.event} <span className="text-muted-foreground text-caption">({r.location})</span>
            </span>
            <span className="text-body text-foreground" style={{ flexShrink: 0 }}>
              {r.champion} <span className="text-muted-foreground text-caption">{r.nation}</span>
            </span>
          </div>

          <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p className="text-body text-muted-foreground" style={{ margin: 0 }}>☕ {r.coffee}</p>

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
            <div className="fc-shade-t text-caption" style={{ padding: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.steps.map((s, i) => {
                const cum = r.steps.slice(0, i + 1).reduce((a, x) => a + x.water, 0);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
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
              <ul className="text-caption text-muted-foreground" style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {r.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}

            <p className="text-caption text-muted-foreground" style={{ margin: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
