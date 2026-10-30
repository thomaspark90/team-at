'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { BeanMeta, BrewType, DripRecipe, PurchaseRecord } from '@/lib/types';
import { normalize } from '@/lib/pricing';
import { flavorGradient } from '@/lib/flavor-colors';
import BrewTimer from '@/components/garden/BrewTimer';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { pangyoDialText } from '@/lib/grinder-calibration';
import { latestAlignmentDate, type AlignmentEvent } from '@/lib/grinder-alignments';
import { ETC, countryOf, isBeanArchived } from '@/lib/garden/bean-groups';

// 태블릿 레시피 보드 — 매장 태블릿(가로)에서 레시피 카드 3장을 한 화면에, 좌우 스와이프로 3장씩 넘긴다.
// 추출용으로 간추린 카드(판매가·재검토·수정 버튼 없음). 편집은 필터 레시피 탭에서.
// 넘김은 CSS scroll-snap — 터치 스와이프는 브라우저 기본 동작, 마우스는 ‹ › 버튼.

const PER_PAGE = 3;
const BREW_TYPES: BrewType[] = ['ice', 'hot'];
const btOf = (r: DripRecipe): BrewType => r.brewType ?? 'ice';
const meshFmt = (n: number) => n.toFixed(1);
const pourName = (label: string | undefined, i: number) => label ?? (i === 0 ? '뜸' : `${i}차`);

interface BoardBean {
  beanKey: string;
  bean: string;
  ice: DripRecipe | null;
  hot: DripRecipe | null;
  latestUpdate: string;
}

export default function RecipeBoard() {
  const [recipes, setRecipes] = useState<DripRecipe[]>([]);
  const [beanMetas, setBeanMetas] = useState<BeanMeta[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [grinderProfiles, setGrinderProfiles] = useState<GrinderProfiles>({});
  const [alignments, setAlignments] = useState<AlignmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [timerFor, setTimerFor] = useState<{ bean: string; brewType: BrewType; recipe: DripRecipe } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rRes, bRes, pRes, gRes] = await Promise.all([
          fetch('/api/garden-recipes', { cache: 'no-store' }),
          fetch('/api/garden-beans', { cache: 'no-store' }),
          fetch('/api/purchases', { cache: 'no-store' }),
          fetch('/api/garden-grinders', { cache: 'no-store' }),
        ]);
        if (!rRes.ok) throw new Error();
        setRecipes(await rRes.json());
        if (bRes.ok) setBeanMetas(await bRes.json());
        if (pRes.ok) setPurchases(await pRes.json());
        if (gRes.ok) setGrinderProfiles(await gRes.json());
        // 얼라인먼트는 판교 분쇄도 표기용 부가 정보 — 실패해도 조용히 넘어간다
        const aRes = await fetch('/api/garden-grinder-alignments', { cache: 'no-store' }).catch(() => null);
        if (aRes?.ok) setAlignments(await aRes.json());
      } catch {
        setFailed(true);
      }
      setLoading(false);
    })();
  }, []);

  // 보관하지 않은 레시피 원두 — 필터 레시피 탭과 같은 순서(국가 가나다순·기타 맨 뒤, 국가 안에서는 최신 업데이트순)
  const beans = useMemo(() => {
    const metaByBean = new Map(beanMetas.map((b) => [b.beanKey, b]));
    const latestByBean = new Map<string, PurchaseRecord>();
    for (const r of purchases) {
      const k = normalize(r.bean);
      const cur = latestByBean.get(k);
      if (!cur || r.createdAt.localeCompare(cur.createdAt) > 0) latestByBean.set(k, r);
    }
    const m = new Map<string, BoardBean>();
    for (const r of recipes) {
      const g = m.get(r.beanKey) ?? { beanKey: r.beanKey, bean: r.bean, ice: null, hot: null, latestUpdate: '' };
      g[btOf(r)] = r;
      if (r.updatedAt.localeCompare(g.latestUpdate) > 0) {
        g.latestUpdate = r.updatedAt;
        g.bean = r.bean;
      }
      m.set(r.beanKey, g);
    }
    return Array.from(m.values())
      .filter((g) => !isBeanArchived(metaByBean.get(g.beanKey), latestByBean.get(g.beanKey)))
      .sort((a, b) => {
        const ca = countryOf(a.bean);
        const cb = countryOf(b.bean);
        if (ca !== cb) return ca === ETC ? 1 : cb === ETC ? -1 : ca.localeCompare(cb, 'ko');
        return b.latestUpdate.localeCompare(a.latestUpdate);
      });
  }, [recipes, beanMetas, purchases]);

  const tastingByBean = useMemo(() => new Map(beanMetas.map((b) => [b.beanKey, b.tasting])), [beanMetas]);

  const pages = useMemo(() => {
    const out: BoardBean[][] = [];
    for (let i = 0; i < beans.length; i += PER_PAGE) out.push(beans.slice(i, i + PER_PAGE));
    return out;
  }, [beans]);

  const latestAligns = useMemo(
    () => ({
      yangjae: latestAlignmentDate(alignments, 'yangjae'),
      pangyo: latestAlignmentDate(alignments, 'pangyo'),
    }),
    [alignments]
  );
  // 판교 EK43 표기 — 수동 보정 우선, 없으면 산식 자동값(필터 레시피 카드와 같은 규칙)
  const pangyoText = (r: DripRecipe) => {
    if (r.pangyoMesh != null) return meshFmt(r.pangyoMesh);
    if (r.grindMesh == null) return null;
    const p = pangyoDialText(grinderProfiles, r.grindMesh, latestAligns);
    if (!p) return null;
    if (p.stale) return '재측정 필요';
    return `${p.text}${p.provisional ? '*' : ''}`;
  };

  // 스크롤 위치 → 현재 페이지 (스와이프·버튼 공통)
  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (p: number) => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.max(0, Math.min(pages.length - 1, p));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div
      className="bg-background text-foreground"
      style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* 상단 바 — 돌아가기 · 제목 · 페이지 */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', flexShrink: 0 }}>
        <Link href="/garden/recipes" className="text-body text-muted-foreground hover:text-foreground">
          ← 필터 레시피
        </Link>
        <h1 className="text-title font-medium" style={{ margin: 0 }}>
          레시피 보드
        </h1>
        <span style={{ flex: 1 }} />
        {pages.length > 1 && (
          <span className="tabular text-body text-muted-foreground">
            {page + 1} / {pages.length}
          </span>
        )}
      </header>

      {loading && <p className="text-body text-muted-foreground" style={{ padding: '0 20px' }}>불러오는 중…</p>}
      {!loading && failed && (
        <p className="text-body text-muted-foreground" style={{ padding: '0 20px' }}>
          레시피를 불러오지 못했어요. 새로고침해 주세요.
        </p>
      )}
      {!loading && !failed && beans.length === 0 && (
        <p className="text-body text-muted-foreground" style={{ padding: '0 20px' }}>
          레시피가 설정된 원두가 없어요.
        </p>
      )}

      {/* 페이지 가로 스크롤 — 한 페이지 = 화면 폭, 3장 그리드. scroll-snap 으로 페이지 단위 정지 */}
      {!loading && beans.length > 0 && (
        <div
          ref={scroller}
          onScroll={onScroll}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            overscrollBehaviorX: 'contain',
          }}
        >
          {pages.map((group, pi) => (
            <div
              key={pi}
              style={{
                flex: '0 0 100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                display: 'grid',
                gridTemplateColumns: `repeat(${PER_PAGE}, minmax(0, 1fr))`,
                gap: 12,
                padding: '0 20px 8px',
                minHeight: 0,
              }}
            >
              {group.map((g) => (
                <BoardCard
                  key={g.beanKey}
                  g={g}
                  tasting={tastingByBean.get(g.beanKey) ?? ''}
                  pangyoText={pangyoText}
                  onTimer={(bt, r) => setTimerFor({ bean: g.bean, brewType: bt, recipe: r })}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 하단 — ‹ 페이지 점 › (마우스·트랙패드용, 터치는 스와이프) */}
      {pages.length > 1 && (
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '10px 0 14px', flexShrink: 0 }}>
          <button
            onClick={() => goTo(page - 1)}
            disabled={page === 0}
            className="text-title text-muted-foreground hover:text-foreground disabled:opacity-30"
            style={navBtn}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          <span style={{ display: 'flex', gap: 8 }}>
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`${i + 1}페이지`}
                className={i === page ? 'bg-foreground' : 'bg-muted-foreground/30'}
                style={{ width: 8, height: 8, borderRadius: 999, border: 'none', padding: 0, cursor: 'pointer' }}
              />
            ))}
          </span>
          <button
            onClick={() => goTo(page + 1)}
            disabled={page === pages.length - 1}
            className="text-title text-muted-foreground hover:text-foreground disabled:opacity-30"
            style={navBtn}
            aria-label="다음 페이지"
          >
            ›
          </button>
        </footer>
      )}

      {timerFor && (
        <BrewTimer
          bean={timerFor.bean}
          brewType={timerFor.brewType}
          recipe={timerFor.recipe}
          onClose={() => setTimerFor(null)}
        />
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 8px',
  lineHeight: 1,
  fontFamily: 'inherit',
};

// 추출용 카드 — 원두명·테이스팅 헤더 + ICE/HOT 스펙·푸어링·타이머. 내용이 길면 카드 안에서 세로 스크롤
function BoardCard({
  g,
  tasting,
  pangyoText,
  onTimer,
}: {
  g: BoardBean;
  tasting: string;
  pangyoText: (r: DripRecipe) => string | null;
  onTimer: (bt: BrewType, r: DripRecipe) => void;
}) {
  return (
    <div
      className="rounded-md bg-muted/40"
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
    >
      <div
        className="bg-muted"
        style={{ padding: '12px 16px', flexShrink: 0, backgroundImage: flavorGradient(tasting) ?? undefined }}
      >
        <p className="text-title font-medium" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.bean}
        </p>
        {tasting && (
          <p className="text-caption text-muted-foreground" style={{ margin: '2px 0 0' }}>
            {tasting}
          </p>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {BREW_TYPES.map((bt) => {
          const r = g[bt];
          if (!r) return null;
          const ratio = r.doseG && r.waterG ? `1 : ${(r.waterG / r.doseG).toFixed(1)}` : null;
          const pangyo = r.grindMesh != null || r.pangyoMesh != null ? pangyoText(r) : null;
          return (
            <section key={bt} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="rounded-sm bg-foreground text-caption font-medium text-background"
                  style={{ padding: '1px 6px', letterSpacing: '0.05em' }}
                >
                  {bt.toUpperCase()}
                </span>
                {ratio && <span className="tabular text-body">{ratio}</span>}
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => onTimer(bt, r)}
                  className="ta-btn text-body"
                  style={{ height: 32, paddingLeft: 12, paddingRight: 12 }}
                >
                  ▶ 타이머
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Spec label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
                <Spec label="총 물량" value={r.waterG != null ? `${r.waterG}g` : null} />
                <Spec label="물 온도" value={r.tempC != null ? `${r.tempC}°C` : null} />
                {r.grindMesh != null ? (
                  <>
                    <Spec label="분쇄도 · 양재천" value={meshFmt(r.grindMesh)} />
                    <Spec label="분쇄도 · 판교" value={pangyo} />
                  </>
                ) : (
                  <Spec label="분쇄도" value={r.grind || null} />
                )}
                <Spec label="추출 시간(최대)" value={r.totalTime || null} />
              </div>
              {r.pours && r.pours.length > 0 && (
                <div className="rounded-md bg-muted/40" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {r.pours.map((s, i) => {
                    const cum = r.pours!.slice(0, i + 1).reduce((a, x) => a + x.water, 0);
                    return (
                      <div key={i} className="text-caption" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span className="text-muted-foreground">
                          {s.at ? `${s.at} ` : ''}
                          {pourName(s.label, i)}
                        </span>
                        <span className="tabular">
                          {s.water}g <span className="text-muted-foreground">/ {cum}g</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {r.notes && (
                <p className="text-caption text-muted-foreground" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {r.notes}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="text-body" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
