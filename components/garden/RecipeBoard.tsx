'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { BeanMeta, BrewFeedback, BrewType, DripRecipe, PurchaseRecord, StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { normalize } from '@/lib/pricing';
import { flavorGradient } from '@/lib/flavor-colors';
import BrewFeedbackPanel from '@/components/garden/BrewFeedbackPanel';
import SegmentControl from '@/components/nav/SegmentControl';
import { toast } from '@/components/Toast';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { convertDial, pangyoDialText } from '@/lib/grinder-calibration';
import { latestAlignmentDate, type AlignmentEvent } from '@/lib/grinder-alignments';
import { ETC, countryOf, isBeanArchived } from '@/lib/garden/bean-groups';

// 태블릿 레시피 보드 — 매장 태블릿(가로)에서 레시피 카드 3장을 한 화면에, 좌우 스와이프로 3장씩 넘긴다.
// 추출용 카드(M2, 2026-10-30): ICE/HOT 전환 · 스펙(이 지점 분쇄도) · 푸어링 · 추출비, 맨 아래 접힌 추출 평가.
// 타이머 없음(저울 타이머 사용). 편집은 필터 레시피 탭에서 — 보드는 보기 + 추출 평가만.
// 넘김은 CSS scroll-snap — 터치 스와이프는 브라우저 기본 동작, 마우스는 ‹ › 버튼.

const PER_PAGE = 3;
const STORE_KEY = 'garden-board-store'; // 기기별 지점 기억
const STAFF_KEY = 'garden-board-staff'; // 공용 태블릿 — 마지막으로 고른 이름 기억
const BREW_TYPES: BrewType[] = ['ice', 'hot'];
const btOf = (r: DripRecipe): BrewType => r.brewType ?? 'ice';
const meshFmt = (n: number) => n.toFixed(1);
// 아카이브 국가 탭 — 자주 들어오는 산지만 따로, 나머지는 '그 외' (2026-10-30 대표 지시)
const ARCHIVE_TABS = ['전체', '에티오피아', '콜롬비아', '과테말라', '그 외'] as const;
type ArchiveTab = (typeof ARCHIVE_TABS)[number];
const archiveTabOf = (country: string): ArchiveTab =>
  (ARCHIVE_TABS as readonly string[]).includes(country) && country !== '전체' ? (country as ArchiveTab) : '그 외';

const BLOOM_SEC = 35; // 매장 기준 뜸 시간 — 전 레시피 공통(2026-10-30 대표 결정), 레시피별 입력은 아직 없음
const pourName = (label: string | undefined, i: number) => {
  const name = label ?? (i === 0 ? '뜸' : `${i}차`);
  return name === '뜸' ? `뜸(${BLOOM_SEC}s)` : name;
};

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
  const [view, setView] = useState<'board' | 'archive'>('board'); // 필터 커피 아카이브 화면 전환
  const [openArchived, setOpenArchived] = useState<string | null>(null); // 아카이브에서 크게 펼쳐 본 원두 beanKey
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('전체');
  const [store, setStore] = useState<StoreId>('yangjae');
  const [feedback, setFeedback] = useState<BrewFeedback[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [staff, setStaff] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'pangyo' || saved === 'yangjae') setStore(saved);
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem(STAFF_KEY);
    if (saved && staffNames.includes(saved)) setStaff(saved);
  }, [staffNames]);
  const pickStaff = (name: string) => {
    setStaff(name);
    if (name) localStorage.setItem(STAFF_KEY, name);
    else localStorage.removeItem(STAFF_KEY);
  };
  const pickStore = (id: string) => {
    setStore(id as StoreId);
    localStorage.setItem(STORE_KEY, id);
  };

  useEffect(() => {
    // 추출 평가·스탭 명단은 부가 정보 — 실패해도 레시피는 보인다
    fetch('/api/garden-brew-feedback', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setFeedback)
      .catch(() => {});
    fetch('/api/garden-options', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { staffNames: [] }))
      .then((j) => setStaffNames(j.staffNames ?? []))
      .catch(() => {});
  }, []);

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

  // 레시피 원두 — 필터 레시피 탭과 같은 순서(국가 가나다순·기타 맨 뒤, 국가 안에서는 최신 업데이트순).
  // 보드엔 보관하지 않은 것(beans), 아카이브 화면엔 보관한 것(archivedBeans)
  const [beans, archivedBeans] = useMemo(() => {
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
    const all = Array.from(m.values()).sort((a, b) => {
      const ca = countryOf(a.bean);
      const cb = countryOf(b.bean);
      if (ca !== cb) return ca === ETC ? 1 : cb === ETC ? -1 : ca.localeCompare(cb, 'ko');
      return b.latestUpdate.localeCompare(a.latestUpdate);
    });
    const archived = (g: BoardBean) => isBeanArchived(metaByBean.get(g.beanKey), latestByBean.get(g.beanKey));
    return [all.filter((g) => !archived(g)), all.filter(archived)];
  }, [recipes, beanMetas, purchases]);

  // 아카이브 국가별 묶음 — 이미 국가순으로 정렬돼 있어 순서대로 쌓는다
  const archiveSections = useMemo(() => {
    const out: { country: string; groups: BoardBean[] }[] = [];
    for (const g of archivedBeans) {
      const c = countryOf(g.bean);
      const last = out[out.length - 1];
      if (last?.country === c) last.groups.push(g);
      else out.push({ country: c, groups: [g] });
    }
    return out;
  }, [archivedBeans]);

  // 소진 → 필터 커피 아카이브(보관) / 아카이브에서 되돌리기. 낙관적으로 반영하고 실패하면 되돌린다
  const setArchived = async (beanKey: string, bean: string, archived: boolean) => {
    const prev = beanMetas;
    const at = archived ? new Date().toISOString() : null;
    setBeanMetas((ms) =>
      ms.some((m) => m.beanKey === beanKey)
        ? ms.map((m) => (m.beanKey === beanKey ? { ...m, archivedAt: at } : m))
        : [...ms, { beanKey, bean, tasting: '', archivedAt: at, updatedAt: at ?? '' }]
    );
    const res = await fetch('/api/garden-beans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, bean, archived }),
    }).catch(() => null);
    if (!res?.ok) {
      setBeanMetas(prev);
      toast(archived ? '아카이브로 보내지 못했어요. 다시 시도해 주세요.' : '되돌리지 못했어요. 다시 시도해 주세요.', 'error');
      return;
    }
    toast(archived ? `${bean} — 필터 커피 아카이브로 보냈어요.` : `${bean} — 레시피 보드로 되돌렸어요.`);
  };

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
  // 이 지점 분쇄도 — 표기 문자열 + 슬라이더 기준 수치(판교 잠정 범위·재측정 필요면 수치 없음)
  const storeMesh = (r: DripRecipe): { text: string | null; value: number | null } => {
    if (store === 'yangjae') {
      return r.grindMesh != null ? { text: meshFmt(r.grindMesh), value: r.grindMesh } : { text: r.grind || null, value: null };
    }
    if (r.pangyoMesh != null) return { text: meshFmt(r.pangyoMesh), value: r.pangyoMesh };
    if (r.grindMesh == null) return { text: null, value: null };
    return { text: pangyoText(r), value: convertDial(grinderProfiles, 'yangjae', 'pangyo', r.grindMesh) };
  };
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
        {view === 'board' ? (
          <Link href="/garden/recipes" className="text-body text-muted-foreground hover:text-foreground">
            ← 필터 레시피
          </Link>
        ) : (
          <button onClick={() => setView('board')} className="text-body text-muted-foreground hover:text-foreground" style={plainBtn}>
            ← 레시피 보드
          </button>
        )}
        <h1 className="text-title font-medium" style={{ margin: 0 }}>
          {view === 'board' ? '레시피 보드' : '필터 커피 아카이브'}
        </h1>
        <span style={{ flex: 1 }} />
        {view === 'board' && archivedBeans.length > 0 && (
          <button onClick={() => setView('archive')} className="tabular text-body text-muted-foreground hover:text-foreground" style={plainBtn}>
            아카이브 {archivedBeans.length}
          </button>
        )}
        <SegmentControl
          items={[...STORES].reverse().map((s) => ({ id: s.id, label: s.short }))}
          value={store}
          onSelect={pickStore}
          ariaLabel="지점"
        />
        {view === 'board' && pages.length > 1 && (
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
      {/* 필터 커피 아카이브 — 국가별 묶음, 원두명 칩만 쫙 펼쳐 두고 누르면 보드 크기 카드로 크게 연다 */}
      {view === 'archive' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 20px 40px', display: 'flex', flexDirection: 'column', gap: 40 }}>
          {archiveSections.length === 0 && <p className="text-body text-muted-foreground">아카이브한 원두가 없어요.</p>}
          {/* 국가 탭 — 전체 | 에티오피아 | 콜롬비아 | 과테말라 | 그 외 */}
          {archiveSections.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 6 }}>
              {ARCHIVE_TABS.map((t) => {
                const n =
                  t === '전체'
                    ? archivedBeans.length
                    : archivedBeans.filter((g) => archiveTabOf(countryOf(g.bean)) === t).length;
                const on = archiveTab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setArchiveTab(t)}
                    disabled={n === 0}
                    className={`text-body ${on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:opacity-30`}
                    style={{ ...plainBtn, padding: '4px 0', borderBottom: `1px solid ${on ? 'hsl(var(--foreground))' : 'transparent'}`, cursor: n ? 'pointer' : 'default' }}
                  >
                    {t} <span className="tabular text-caption text-muted-foreground">{n}</span>
                  </button>
                );
              })}
            </div>
          )}
          {archiveSections
            .filter(({ country }) => archiveTab === '전체' || archiveTabOf(country) === archiveTab)
            .map(({ country, groups }) => (
            <section key={country} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 className="text-title font-medium" style={{ margin: 0 }}>{country}</h2>
                <span className="tabular text-caption text-muted-foreground">{groups.length}종</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PER_PAGE}, minmax(0, 1fr))`, gap: 12 }}>
                {groups.map((g) => (
                  <div
                    key={g.beanKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenArchived(g.beanKey)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenArchived(g.beanKey)}
                    className="rounded-md bg-background shadow-soft"
                    style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '20px 24px', cursor: 'pointer', minWidth: 0 }}
                  >
                    <span className="text-title font-medium" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.bean}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setArchived(g.beanKey, g.bean, false);
                      }}
                      className="text-caption text-muted-foreground hover:text-foreground"
                      style={{ ...plainBtn, flexShrink: 0 }}
                      title="레시피 보드로 되돌리기"
                    >
                      되돌리기
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 아카이브 원두 크게 보기 — 보드 카드 한 장 크기, 바깥을 누르면 닫힘 */}
      {view === 'archive' &&
        (() => {
          const g = archivedBeans.find((x) => x.beanKey === openArchived);
          if (!g) return null;
          return (
            <div
              onClick={() => setOpenArchived(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--foreground) / 0.45)' }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: 'min(420px, 92vw)', height: 'min(640px, 88dvh)', display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <button onClick={() => setOpenArchived(null)} className="text-body text-background" style={{ ...plainBtn, alignSelf: 'flex-end' }}>
                  닫기 ×
                </button>
                <BoardCard
                  g={g}
                  store={store}
                  tasting={tastingByBean.get(g.beanKey) ?? ''}
                  storeMesh={storeMesh}
                  staffNames={staffNames}
                  staff={staff}
                  onPickStaff={pickStaff}
                  feedback={feedback}
                  onFeedback={(rec) => setFeedback((xs) => [...xs, rec])}
                  archived
                  onArchive={() => {
                    setOpenArchived(null);
                    setArchived(g.beanKey, g.bean, false);
                  }}
                />
              </div>
            </div>
          );
        })()}

      {view === 'board' && !loading && !failed && beans.length === 0 && (
        <p className="text-body text-muted-foreground" style={{ padding: '0 20px' }}>
          레시피가 설정된 원두가 없어요.
        </p>
      )}

      {/* 페이지 가로 스크롤 — 한 페이지 = 화면 폭, 3장 그리드. scroll-snap 으로 페이지 단위 정지 */}
      {view === 'board' && !loading && beans.length > 0 && (
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
                  store={store}
                  tasting={tastingByBean.get(g.beanKey) ?? ''}
                  storeMesh={storeMesh}
                  staffNames={staffNames}
                  staff={staff}
                  onPickStaff={pickStaff}
                  feedback={feedback}
                  onFeedback={(rec) => setFeedback((xs) => [...xs, rec])}
                  onArchive={() => setArchived(g.beanKey, g.bean, true)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 하단 — ‹ 페이지 점 › (마우스·트랙패드용, 터치는 스와이프) */}
      {view === 'board' && pages.length > 1 && (
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

    </div>
  );
}

const plainBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' };

const navBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 8px',
  lineHeight: 1,
  fontFamily: 'inherit',
};

// 추출용 카드(M2, 2026-10-30) — 원두명·테이스팅 + ICE/HOT 전환 + 스펙·푸어링·추출비, 맨 아래 접힌 추출 평가. 길면 카드 안에서 세로 스크롤
function BoardCard({
  g,
  store,
  tasting,
  storeMesh,
  staffNames,
  staff,
  onPickStaff,
  feedback,
  onFeedback,
  archived = false,
  onArchive,
}: {
  g: BoardBean;
  store: StoreId;
  tasting: string;
  storeMesh: (r: DripRecipe) => { text: string | null; value: number | null };
  staffNames: string[];
  staff: string;
  onPickStaff: (name: string) => void;
  feedback: BrewFeedback[];
  onFeedback: (rec: BrewFeedback) => void;
  archived?: boolean; // 아카이브 화면 — '소진' 대신 '되돌리기'
  onArchive: () => void;
}) {
  const types = BREW_TYPES.filter((bt) => g[bt]);
  const [bt, setBt] = useState<BrewType>(types[0] ?? 'ice');
  const [evalOpen, setEvalOpen] = useState(false); // 추출 평가 접어두기(M2) — 내린 뒤 펼친다
  const [confirmArchive, setConfirmArchive] = useState(false); // 소진 — 실수 방지로 한 번 더 확인
  const r = g[bt] ?? g[types[0]];
  if (!r) return null;
  const ratio = r.doseG && r.waterG ? `1:${(r.waterG / r.doseG).toFixed(1)}` : null;
  const mesh = storeMesh(r);
  const mine = feedback.filter((f) => f.beanKey === g.beanKey && f.brewType === bt && f.store === store);
  const mineCurrent = mine.filter((f) => f.recipeVersion === r.updatedAt).length;
  return (
    <div className="rounded-md bg-background shadow-soft" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      {/* 헤더 — 테이스팅 노트 색 그라데이션(카운터컬처 플레이버 휠 차용) + 원두명 + 노트. 스크롤해도 고정 */}
      <div
        className="bg-muted"
        style={{ flexShrink: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 6, backgroundImage: flavorGradient(tasting) ?? undefined }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <p className="text-title font-medium" style={{ flex: 1, minWidth: 0, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.bean}
          </p>
          {/* 소진 — 못 팔게 되면 필터 커피 아카이브로 (레시피·이력·평가는 유지, 레시피 탭에서 되돌릴 수 있음) */}
          {archived ? (
            <button
              onClick={onArchive}
              className="text-caption text-muted-foreground hover:text-foreground"
              style={{ ...plainBtn, flexShrink: 0 }}
              title="레시피 보드로 되돌리기"
            >
              되돌리기
            </button>
          ) : confirmArchive ? (
            <span className="text-caption" style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <span className="text-muted-foreground">아카이브로 보낼까요?</span>
              <button onClick={onArchive} className="text-foreground underline" style={plainBtn}>
                확인
              </button>
              <button onClick={() => setConfirmArchive(false)} className="text-muted-foreground hover:text-foreground" style={plainBtn}>
                취소
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmArchive(true)}
              className="text-caption text-muted-foreground hover:text-foreground"
              style={{ ...plainBtn, flexShrink: 0 }}
              title="원두 소진 — 필터 커피 아카이브로 보내기"
            >
              소진
            </button>
          )}
        </div>
        {tasting && (
          <p className="text-caption text-muted-foreground" style={{ margin: 0 }}>
            {tasting}
          </p>
        )}
      </div>
      {/* 레시피 + 접힌 추출 평가가 한 스크롤 — 평가를 펼치면 카드 안에서 아래로 이어진다 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* flex: 1 — 추출비·추출 시간을 흰 영역 맨 아래에 붙이기 위해 높이를 채운다 */}
        <div style={{ flex: 1, padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ICE/HOT 전환은 레시피가 하나뿐이어도 같은 모양으로 — 카드 간 줄 맞춤. 없는 타입은 흐리게·비활성 */}
          <div className="ta-seg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {BREW_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setBt(t)}
                disabled={!g[t]}
                className={`ta-seg-item ${t === bt ? 'ta-seg-on' : ''} disabled:cursor-default disabled:opacity-30`}
                title={g[t] ? undefined : `${t.toUpperCase()} 레시피 없음`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="tabular" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, rowGap: 4 }}>
            <Stat label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
            <Stat label="추출량" value={r.waterG != null ? `${r.waterG}g` : null} />
            <Stat label="온도" value={r.tempC != null ? `${r.tempC}°C` : null} />
            {/* 지점은 위쪽 바 전환으로 이미 정해져 라벨에서 뺀다 */}
            <Stat label="분쇄도(EK43)" value={mesh.text} warn={mesh.text === '재측정 필요'} />
          </div>

          {r.pours && r.pours.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {r.pours.map((s, i) => {
                const cum = r.pours!.slice(0, i + 1).reduce((a, x) => a + x.water, 0);
                return (
                  <div key={i} className="tabular text-body" style={{ display: 'grid', gridTemplateColumns: '1fr auto 64px', gap: 12, alignItems: 'baseline' }}>
                    <span className="text-muted-foreground">
                      {s.at ? `${s.at} ` : ''}
                      {pourName(s.label, i)}
                    </span>
                    <span>{s.water}g</span>
                    <span className="text-muted-foreground" style={{ textAlign: 'right' }}>{cum}g</span>
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

          {/* 추출비·추출 시간 — 흰 영역 맨 아래 정렬, 같은 크기 */}
          {(ratio || r.totalTime) && (
            <div className="tabular text-body" style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span>{ratio && `추출비: ${ratio}`}</span>
              <span>{r.totalTime && `추출 시간: ${r.totalTime}`}</span>
            </div>
          )}
        </div>

        <div className="bg-accent">
          <button
            onClick={() => setEvalOpen((o) => !o)}
            className="text-body text-foreground"
            aria-expanded={evalOpen}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span>추출 평가 남기기</span>
            <span className="tabular text-muted-foreground">
              {mineCurrent > 0 && `의견 ${mineCurrent} `}
              {evalOpen ? '▴' : '▾'}
            </span>
          </button>
          {evalOpen && (
            <div style={{ padding: '4px 24px 28px' }}>
              <BrewFeedbackPanel
                store={store}
                beanKey={g.beanKey}
                bean={g.bean}
                brewType={bt}
                recipe={r}
                baseMesh={mesh.value}
                staffNames={staffNames}
                staff={staff}
                onPickStaff={onPickStaff}
                feedback={mine}
                onSaved={onFeedback}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string | null; warn?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="text-caption text-muted-foreground" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div className={warn ? 'text-body text-amber-600 dark:text-amber-500' : 'text-title'} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}
