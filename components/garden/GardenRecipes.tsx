'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { BeanMeta, BrewType, DripRecipe, PourStep, StoreId } from '@/lib/types';
import { STORES, stockOf, beanRegisteredAt, daysSince, dPlusColor } from '@/lib/types';
import { normalize } from '@/lib/pricing';
import { flavorGradient } from '@/lib/flavor-colors';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

const BREW_TYPES: BrewType[] = ['ice', 'hot'];
const btOf = (r: DripRecipe): BrewType => (r.brewType === 'hot' ? 'hot' : 'ice');
const pourName = (p: PourStep, i: number) => p.label ?? (i === 0 ? '뜸' : `${i}차`);
const ratioOf = (doseG: number | null, waterG: number | null) =>
  doseG && waterG ? `1 : ${(waterG / doseG).toFixed(1).replace(/\.0$/, '')}` : null;

// 원두명에서 국가 추출 — 이름에 포함된 산지 국가명으로 카테고리 분류
const COUNTRIES = [
  '에티오피아',
  '케냐',
  '콜롬비아',
  '브라질',
  '과테말라',
  '온두라스',
  '파나마',
  '페루',
  '코스타리카',
  '엘살바도르',
  '니카라과',
  '볼리비아',
  '에콰도르',
  '르완다',
  '부룬디',
  '인도네시아',
  '예멘',
  '멕시코',
  '인도',
  '베트남',
  '탄자니아',
  '우간다',
  '파푸아뉴기니',
  '중국',
];
const ETC = '기타';
const countryOf = (bean: string) => {
  const b = normalize(bean);
  return COUNTRIES.find((c) => b.includes(normalize(c))) ?? ETC;
};

interface BeanGroup {
  beanKey: string;
  bean: string;
  ice?: DripRecipe;
  hot?: DripRecipe;
  latest: string; // 정렬용 최신 updatedAt
}

export default function GardenRecipes() {
  const [recipes, setRecipes] = useState<DripRecipe[]>([]);
  const [beanMetas, setBeanMetas] = useState<BeanMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('전체');

  const refresh = async () => {
    const [rRes, bRes] = await Promise.all([
      fetch('/api/garden-recipes', { cache: 'no-store' }),
      fetch('/api/garden-beans', { cache: 'no-store' }),
    ]);
    if (rRes.ok) setRecipes(await rRes.json());
    if (bRes.ok) setBeanMetas(await bRes.json());
    setLoading(false);
  };
  useEffect(() => {
    refresh();
  }, []);

  const tastingByBean = useMemo(
    () => new Map(beanMetas.map((b) => [b.beanKey, b.tasting])),
    [beanMetas]
  );

  // 지점별 재고량 — 구버전 소진 기록은 0%/100%로 해석
  const metaByBean = useMemo(() => new Map(beanMetas.map((b) => [b.beanKey, b])), [beanMetas]);

  // 재고 0% 지점 칩 클릭 → 그 지점 재고 100%로 재입고 (대시보드로 복귀)
  const restockStore = async (beanKey: string, bean: string, storeId: StoreId) => {
    await fetch('/api/garden-beans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, bean, stockByStore: { [storeId]: 100 } }),
    });
    refresh();
  };

  // 국가 → 원두 그룹(ICE/HOT 슬롯) 정리
  const sections = useMemo(() => {
    const byBean = new Map<string, BeanGroup>();
    for (const r of recipes) {
      const g = byBean.get(r.beanKey) ?? { beanKey: r.beanKey, bean: r.bean, latest: r.updatedAt };
      g[btOf(r)] = r;
      if (r.updatedAt.localeCompare(g.latest) > 0) {
        g.latest = r.updatedAt;
        g.bean = r.bean;
      }
      byBean.set(r.beanKey, g);
    }
    const byCountry = new Map<string, BeanGroup[]>();
    for (const g of Array.from(byBean.values())) {
      const c = countryOf(g.bean);
      const arr = byCountry.get(c) ?? [];
      arr.push(g);
      byCountry.set(c, arr);
    }
    const list = Array.from(byCountry.entries()).map(([country, groups]) => ({
      country,
      groups: groups.sort((a, b) => a.bean.localeCompare(b.bean, 'ko')),
    }));
    // 국가 가나다순, '기타'는 맨 뒤
    list.sort((a, b) =>
      a.country === ETC ? 1 : b.country === ETC ? -1 : a.country.localeCompare(b.country, 'ko')
    );
    return list;
  }, [recipes]);

  const chips = ['전체', ...sections.map((s) => s.country)];
  const visible = selected === '전체' ? sections : sections.filter((s) => s.country === selected);

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p className="ta-label" style={{ marginBottom: 0 }}>필터 레시피 — 국가별</p>
        <Link href="/garden" className="text-[11px] text-muted-foreground hover:text-foreground">
          레시피 추가·수정은 대시보드에서 →
        </Link>
      </div>

      {/* 국가 필터 칩 */}
      {sections.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c) => {
            const on = selected === c;
            return (
              <button
                key={c}
                onClick={() => setSelected(c)}
                className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                  on
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {c}
                {c !== '전체' && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    {sections.find((s) => s.country === c)?.groups.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {loading && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}
      {!loading && sections.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          아직 저장된 레시피가 없어요. <Link href="/garden" className="underline">대시보드</Link>에서 원두별 레시피를 설정해 보세요.
        </p>
      )}

      {visible.map(({ country, groups }) => (
        <div key={country} className="min-w-0">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid hsl(var(--border))', paddingBottom: 6, marginBottom: 12 }}>
            <h3 className="text-[14px] text-foreground" style={{ margin: 0, fontWeight: 500 }}>{country}</h3>
            <span className="text-[11px] text-muted-foreground">{groups.length}종</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {groups.map((g) => (
              <div key={g.beanKey} className="rounded-md border border-border" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* 헤더 — 대시보드와 동일하게 테이스팅 노트 색 그라데이션(카운터컬처 플레이버 휠 차용) */}
                <div
                  className="bg-muted"
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid hsl(var(--border))',
                    backgroundImage: flavorGradient(tastingByBean.get(g.beanKey) ?? '') ?? undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                      <span className="text-[15px] text-foreground" style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.bean}
                      </span>
                      {/* 등록 시점부터 경과일 — 등록 당일 D+0, 24일 초과 주황·30일 초과 빨강 */}
                      {(() => {
                        const regAt = beanRegisteredAt([g.ice, g.hot]);
                        if (!regAt) return null;
                        const n = daysSince(regAt);
                        const warn = dPlusColor(n);
                        return (
                          <span className="tabular text-[11px] text-muted-foreground" style={{ flexShrink: 0, ...(warn ? { color: warn, fontWeight: 500 } : {}) }} title={`등록 ${fmtDate(regAt)}`}>
                            D+{n}
                          </span>
                        );
                      })()}
                    </span>
                    {/* 재고 20% 이하 지점 칩 — 0% 칩은 클릭하면 100%로 재입고 */}
                    {STORES.some((s) => stockOf(metaByBean.get(g.beanKey), s.id) <= 20) && (
                      <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {STORES.filter((s) => stockOf(metaByBean.get(g.beanKey), s.id) <= 20).map((s) => {
                          const pct = stockOf(metaByBean.get(g.beanKey), s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => pct === 0 && restockStore(g.beanKey, g.bean, s.id)}
                              className="rounded-sm border text-[11px] tabular"
                              style={{
                                background: 'none',
                                cursor: pct === 0 ? 'pointer' : 'default',
                                padding: '0 6px',
                                borderColor: 'rgba(220, 38, 38, 0.4)',
                                color: '#dc2626',
                              }}
                              title={pct === 0 ? `${s.label} 재고 100%로 재입고` : `${s.label} 재고 ${pct}%`}
                            >
                              {s.short} {pct}%{pct === 0 && ' ↺'}
                            </button>
                          );
                        })}
                      </span>
                    )}
                  </div>
                  {tastingByBean.get(g.beanKey) && (
                    <span className="text-[11px] text-muted-foreground" style={{ display: 'block', marginTop: 2 }}>
                      {tastingByBean.get(g.beanKey)}
                    </span>
                  )}
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {BREW_TYPES.map((bt, idx) => {
                    const r = g[bt];
                    if (!r) return null;
                    return (
                      <div key={bt} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: idx > 0 && g.ice ? '1px solid hsl(var(--border))' : 'none', paddingTop: idx > 0 && g.ice ? 12 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <BrewBadge bt={bt} />
                          {ratioOf(r.doseG, r.waterG) && (
                            <span className="tabular text-[13px] text-foreground">{ratioOf(r.doseG, r.waterG)}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <SpecRow label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
                          <SpecRow label="총 물량" value={r.waterG != null ? `${r.waterG}g` : null} />
                          <SpecRow label="물 온도" value={r.tempC != null ? `${r.tempC}°C` : null} />
                          <SpecRow
                            label="분쇄도"
                            value={r.grindMesh != null ? `EK43(양재천) ${r.grindMesh.toFixed(1)}` : r.grind || null}
                          />
                          <SpecRow label="추출 시간(최대)" value={r.totalTime || null} />
                        </div>
                        {r.pours && r.pours.length > 0 && (
                          <div className="rounded-md border border-border" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {r.pours.map((s, i) => {
                              const cum = r.pours!.slice(0, i + 1).reduce((a, x) => a + x.water, 0);
                              return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                                  <span className="text-muted-foreground">
                                    {s.at ? `${s.at} ` : ''}
                                    {pourName(s, i)}
                                  </span>
                                  <span className="tabular text-foreground">
                                    {s.water}g <span className="text-muted-foreground">/ {cum}g</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {r.notes && (
                          <p className="text-[11px] text-muted-foreground" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                            {r.notes}
                          </p>
                        )}
                        <span className="tabular text-[11px] text-muted-foreground">
                          {fmtDate(r.updatedAt)}
                          {r.updatedBy && ` · ${r.updatedBy.split('@')[0]}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// 대시보드와 동일한 ICE/HOT 배지 (라이트/다크 공통 리터럴)
function BrewBadge({ bt }: { bt: BrewType }) {
  return (
    <span
      className="rounded-sm text-[11px]"
      style={{
        padding: '1px 6px',
        letterSpacing: '0.05em',
        flexShrink: 0,
        fontWeight: 500,
        backgroundColor: bt === 'ice' ? '#3b82f6' : '#dc2626',
        color: '#ffffff',
      }}
    >
      {bt.toUpperCase()}
    </span>
  );
}

function SpecRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular text-foreground">{value}</span>
    </div>
  );
}
