'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BeanMeta, BrewFeedback, BrewType, DripRecipe, StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { flavorGradient } from '@/lib/flavor-colors';
import BrewFeedbackPanel from '@/components/garden/BrewFeedbackPanel';
import BoardBeanList from '@/components/garden/board/BoardBeanList';
import BrewerPicker from '@/components/garden/board/BrewerPicker';
import BrewScreen from '@/components/garden/board/BrewScreen';
import RecipeQuickEdit from '@/components/garden/RecipeQuickEdit';
import SegmentControl from '@/components/nav/SegmentControl';
import { toast } from '@/components/Toast';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { convertDial, pangyoDialText } from '@/lib/grinder-calibration';
import { latestAlignmentDate, type AlignmentEvent } from '@/lib/grinder-alignments';
import { ETC, countryOf, isBeanArchived, resolveTasting } from '@/lib/garden/bean-groups';
import { recipesForStore, sameRecipeSlot } from '@/lib/garden/recipe-store';
import { brewOnStyle } from '@/lib/garden/brew-colors';
import { bypassOf, drinkG } from '@/lib/garden/bypass';
import { starterRecipe } from '@/lib/garden/starter-recipe';
import { pourName } from '@/lib/garden/pour-name';
import { roastInfo } from '@/lib/garden/roast';

// 태블릿 레시피 보드 — 추출 흐름(2026-11-25 대표 결정):
//   ① 보드에는 원두 이름만(BoardBeanList — 판매 중 위, 대기 중 아래 흐리게) → ② 원두를 누르면 「누가 추출하나요?」 이름 버튼(BrewerPicker)
//   → ③ 레시피가 화면 전체에(BrewScreen, HOT · ICE 는 여기서) → ④ 추출 평가(레시피 카드 + 평가 카드) → ⑤ 저장하면 이름을 지우고 보드로.
// 이름은 기기에 기억하지 않는다(공용 태블릿 — 앞사람 이름으로 평가가 남지 않게). 평가 없이 닫는 버튼은 없다.
// 타이머 없음(저울 타이머 사용). 전체 편집은 필터커피 탭에서 — 보드는 보기 + 추출 평가 +
// 추출 화면의 '의견 · 레시피 수정'(− / + 바로 수정, 2026-11-13) + 아직 없는 레시피를 처음 만드는 '레시피 설정'(준비 중 원두, 2026-11-25).
// 레시피 카드(BoardCard, M2 2026-10-30)는 평가·수정 화면 왼쪽과 아카이브 크게 보기에서 쓴다.

const PER_PAGE = 3; // 아카이브 칩 한 줄 개수: 태블릿 가로·PC — 모바일(폭 700px 이하) 1, 태블릿 세로(701~1023px) 2 (2026-11-02)
const MOBILE_QUERY = '(max-width: 700px)';
const NARROW_QUERY = '(max-width: 1023px)';
const COMPACT_QUERY = '(max-width: 1140px)'; // 아이패드 미니 가로(1024·1133px) 이하 — 크게 보기를 화면 전체로 (2026-11-10)
const STORE_KEY = 'garden-board-store'; // 기기별 지점 기억
const STAFF_KEY = 'garden-board-staff'; // 옛 키 — 마지막 이름을 기억하던 시절의 값. 이제 기억하지 않으므로 열 때 지운다
const CACHE_KEY = 'garden-recipe-board-cache-v1'; // 마지막 보드 응답 — 다음 열 때 즉시 그리기용

// /api/garden-recipe-board 응답
interface BoardData {
  recipes: DripRecipe[];
  beans: BeanMeta[];
  latestPurchaseAt: Record<string, string>;
  purchaseTasting?: Record<string, string>; // 발주 때 입력한 노트(원두별 최신)
  purchaseBean?: Record<string, string>; // 원두별 최근 발주 표기명
  purchaseRoast?: Record<string, { roastDate?: string; orderDate?: string; createdAt: string }>; // 원두별 최근 발주의 로스팅일 재료
  grinderProfiles: GrinderProfiles;
  alignments: AlignmentEvent[];
  feedback: BrewFeedback[];
  staffNames: string[];
}
const BREW_TYPES: BrewType[] = ['hot', 'ice']; // 표시 순서·기본 선택 — HOT 먼저(2026-11-04)
const btOf = (r: DripRecipe): BrewType => r.brewType ?? 'ice';
const meshFmt = (n: number) => n.toFixed(1);
// 아카이브 국가 탭 — 자주 들어오는 산지만 따로, 나머지는 '그 외' (2026-10-30 대표 지시)
const ARCHIVE_TABS = ['전체', '에티오피아', '콜롬비아', '과테말라', '그 외'] as const;
type ArchiveTab = (typeof ARCHIVE_TABS)[number];
const archiveTabOf = (country: string): ArchiveTab =>
  (ARCHIVE_TABS as readonly string[]).includes(country) && country !== '전체' ? (country as ArchiveTab) : '그 외';

interface BoardBean {
  beanKey: string;
  bean: string;
  ice: DripRecipe | null;
  hot: DripRecipe | null;
  fallback: Partial<Record<BrewType, boolean>>; // 판교 화면에서 양재천 레시피를 대신 보여주는 슬롯
  latestUpdate: string;
}

export default function RecipeBoard() {
  const [recipes, setRecipes] = useState<DripRecipe[]>([]);
  const [beanMetas, setBeanMetas] = useState<BeanMeta[]>([]);
  const [latestPurchaseAt, setLatestPurchaseAt] = useState<Record<string, string>>({}); // 원두별 마지막 발주 시각
  const [purchaseTasting, setPurchaseTasting] = useState<Record<string, string>>({});
  const [purchaseBean, setPurchaseBean] = useState<Record<string, string>>({});
  const [purchaseRoast, setPurchaseRoast] = useState<NonNullable<BoardData['purchaseRoast']>>({});
  const [grinderProfiles, setGrinderProfiles] = useState<GrinderProfiles>({});
  const [alignments, setAlignments] = useState<AlignmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<'board' | 'archive'>('board'); // 필터 커피 아카이브 화면 전환
  const [openArchived, setOpenArchived] = useState<string | null>(null); // 아카이브에서 크게 펼쳐 본 원두 beanKey
  // 이름 고르는 창을 띄운 원두(beanKey) — 보드·대기 목록에서 원두를 누르면
  const [picking, setPicking] = useState<string | null>(null);
  // 들어온 원두 — brew: 추출 화면 / eval: 추출 평가 / edit: 의견 · 레시피 수정 / setup: 준비 중 원두의 레시피 설정(이름 없이 들어옴)
  const [focus, setFocus] = useState<{ beanKey: string; bt: BrewType; stage: 'brew' | 'eval' | 'edit' | 'setup' } | null>(null);
  // 크게 보기에서 조절 중인 레시피 — 저장 전 값을 왼쪽 카드에 비춘다 (의견 · 레시피 수정 탭)
  const [preview, setPreview] = useState<DripRecipe | null>(null);
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('전체');
  const [store, setStore] = useState<StoreId>('yangjae');
  const [feedback, setFeedback] = useState<BrewFeedback[]>([]);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [staff, setStaff] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'pangyo' || saved === 'yangjae') setStore(saved);
    localStorage.removeItem(STAFF_KEY);
  }, []);
  // 이름은 들어올 때마다 새로 고른다 — 기기에 남기지 않고, 보드로 돌아가면 지운다
  const pickStaff = (name: string) => setStaff(name);
  const closeFocus = () => {
    setFocus(null);
    setPreview(null);
    setStaff('');
  };
  const pickStore = (id: string) => {
    setStore(id as StoreId);
    localStorage.setItem(STORE_KEY, id);
  };

  // 첫 로딩 — 보드 전용 묶음 API 한 번(/api/garden-recipe-board). 마지막 응답을 기기에 캐시해 두고
  // 다음에 열 때는 캐시로 즉시 그린 뒤 새 응답으로 조용히 바꾼다(태블릿은 같은 화면을 반복해서 연다).
  useEffect(() => {
    const apply = (d: BoardData) => {
      setRecipes(d.recipes ?? []);
      setBeanMetas(d.beans ?? []);
      setLatestPurchaseAt(d.latestPurchaseAt ?? {});
      setPurchaseTasting(d.purchaseTasting ?? {});
      setPurchaseBean(d.purchaseBean ?? {});
      setPurchaseRoast(d.purchaseRoast ?? {});
      setGrinderProfiles(d.grinderProfiles ?? {});
      setAlignments(d.alignments ?? []);
      setFeedback(d.feedback ?? []);
      setStaffNames(d.staffNames ?? []);
    };
    let cached = false;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        apply(JSON.parse(raw) as BoardData);
        cached = true;
        setLoading(false);
      }
    } catch {
      localStorage.removeItem(CACHE_KEY);
    }
    (async () => {
      try {
        const res = await fetch('/api/garden-recipe-board', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const d = (await res.json()) as BoardData;
        apply(d);
        setFailed(false);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(d));
        } catch {
          // 저장 공간 부족 등 — 캐시는 선택 사항
        }
      } catch {
        // 캐시로 그리고 있으면 그대로 둔다(오프라인·일시 장애). 캐시도 없을 때만 실패 표시
        if (!cached) setFailed(true);
      }
      setLoading(false);
    })();
  }, []);

  // 레시피 원두 — 필터커피 탭과 같은 순서(국가 가나다순·기타 맨 뒤, 국가 안에서는 최신 업데이트순).
  // 보드엔 보관하지 않은 것(beans), 아카이브 화면엔 보관한 것(archivedBeans)
  const [allLiveBeans, archivedBeans] = useMemo(() => {
    const metaByBean = new Map(beanMetas.map((b) => [b.beanKey, b]));
    const m = new Map<string, BoardBean>();
    // 지점별 레시피(판교에 없는 슬롯은 양재천 레시피로 대체)
    for (const { recipe: r, fallback } of recipesForStore(recipes, store)) {
      const g = m.get(r.beanKey) ?? { beanKey: r.beanKey, bean: r.bean, ice: null, hot: null, fallback: {}, latestUpdate: '' };
      g[btOf(r)] = r;
      if (fallback) g.fallback[btOf(r)] = true;
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
    const archived = (g: BoardBean) => {
      const at = latestPurchaseAt[g.beanKey];
      return isBeanArchived(metaByBean.get(g.beanKey), at ? { createdAt: at } : undefined);
    };
    return [all.filter((g) => !archived(g)), all.filter(archived)];
  }, [recipes, beanMetas, latestPurchaseAt, store]);

  // 판매 대기 — 이 지점에서 대기로 둔 원두는 보드 아래 '대기 중' 묶음으로 (지점별, 2026-11-01)
  const waitingSet = useMemo(
    () => new Set(beanMetas.filter((m) => m.waitingStores?.includes(store)).map((m) => m.beanKey)),
    [beanMetas, store]
  );
  const beans = useMemo(() => allLiveBeans.filter((g) => !waitingSet.has(g.beanKey)), [allLiveBeans, waitingSet]);
  const waitingBeans = useMemo(() => allLiveBeans.filter((g) => waitingSet.has(g.beanKey)), [allLiveBeans, waitingSet]);

  // 레시피 없음 — 발주는 됐지만 레시피가 아직 하나도 없는 원두(보관한 원두 제외), 최근 발주순. 보드에서는 '대기 중' 묶음의 뒤쪽
  const pendingBeans = useMemo(() => {
    const has = new Set(recipes.map((r) => r.beanKey));
    const metaByBean = new Map(beanMetas.map((b) => [b.beanKey, b]));
    return Object.entries(purchaseBean)
      .filter(([k]) => !has.has(k) && !isBeanArchived(metaByBean.get(k), latestPurchaseAt[k] ? { createdAt: latestPurchaseAt[k] } : undefined))
      .map(([beanKey, bean]) => ({ beanKey, bean, orderedAt: latestPurchaseAt[beanKey] ?? '' }))
      .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
  }, [recipes, beanMetas, purchaseBean, latestPurchaseAt]);

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

  // 아카이브 '기록 삭제' — 그 원두 레시피 전부(ICE·HOT·모든 지점)와 이력. 발주·추출 평가는 남는다. 되돌릴 수 없음
  const deleteRecord = async (beanKey: string, bean: string) => {
    const res = await fetch('/api/garden-recipes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, all: true }),
    }).catch(() => null);
    if (!res?.ok) {
      toast('삭제하지 못했어요. 다시 시도해 주세요.', 'error');
      return;
    }
    setOpenArchived(null);
    setRecipes((rs) => rs.filter((r) => r.beanKey !== beanKey));
    toast(`${bean} — 아카이브 기록을 삭제했어요.`);
  };

  // 판매 대기 / 판매 시작 — 이 지점만. 낙관적 반영, 실패하면 되돌린다
  const setWaiting = async (beanKey: string, bean: string, on: boolean) => {
    const prev = beanMetas;
    const toggle = (list: StoreId[] = []) => (on ? Array.from(new Set([...list, store])) : list.filter((x) => x !== store));
    setBeanMetas((ms) =>
      ms.some((m) => m.beanKey === beanKey)
        ? ms.map((m) => (m.beanKey === beanKey ? { ...m, waitingStores: toggle(m.waitingStores) } : m))
        : [...ms, { beanKey, bean, tasting: '', waitingStores: toggle(), updatedAt: new Date().toISOString() }]
    );
    const res = await fetch('/api/garden-beans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, bean, waiting: { store, on } }),
    }).catch(() => null);
    if (!res?.ok) {
      setBeanMetas(prev);
      toast('저장하지 못했어요. 다시 시도해 주세요.', 'error');
      return;
    }
    const st = STORES.find((x) => x.id === store)?.short ?? '';
    toast(on ? `${bean} — ${st} 판매 대기로 옮겼어요.` : `${bean} — ${st} 판매를 시작했어요.`);
  };

  // 노트 — 레시피에서 쓴 노트 우선, 없으면 발주 때 입력한 노트 (필터커피 탭과 같은 규칙)
  const tastingByBean = useMemo(() => {
    const m = new Map(Object.entries(purchaseTasting));
    for (const b of beanMetas) m.set(b.beanKey, resolveTasting(b, m.get(b.beanKey)));
    return m;
  }, [beanMetas, purchaseTasting]);
  // 보드 한 줄 — 오른쪽 글자는 이 지점에서 볼 수 있는 레시피 타입, 로스팅일은 최근 발주 기준(필터커피 화면의 D+ 와 같은 값)
  const rowOf = (g: BoardBean) => ({
    beanKey: g.beanKey,
    bean: g.bean,
    tasting: tastingByBean.get(g.beanKey) ?? '',
    types: BREW_TYPES.filter((t) => g[t]),
    roast: roastInfo(purchaseRoast[g.beanKey]),
  });

  // 크게 보기에서 아직 없는 레시피(준비 중 원두 · 한쪽 타입만 있는 원두)의 시작값 — 저장 전까지 왼쪽 카드에 비추고
  // 오른쪽 '레시피 설정'의 기준이 된다. 매 렌더마다 새 객체면 조절값이 초기화되므로 원두 단위로 기억해 둔다
  const focusKey = focus?.beanKey ?? null;
  const focusStarters = useMemo(() => {
    if (!focusKey) return null;
    const bean = allLiveBeans.find((x) => x.beanKey === focusKey)?.bean ?? purchaseBean[focusKey] ?? '';
    const make = (brewType: BrewType) => starterRecipe({ recipes, grinderProfiles, beanKey: focusKey, bean, brewType, store });
    return { bean, hot: make('hot'), ice: make('ice') };
  }, [focusKey, allLiveBeans, purchaseBean, recipes, grinderProfiles, store]);

  // 모바일이면 한 페이지에 카드 1장 — 3장을 좁은 폭에 넣으면 글자가 세로로 쪼개진다
  const [isMobile, setIsMobile] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false); // 아이패드 세로 등 — 3장은 너무 좁아 2장
  const [isCompact, setIsCompact] = useState(false); // 아이패드 미니 등 작은 태블릿 — 크게 보기가 화면을 꽉 채운다
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const nq = window.matchMedia(NARROW_QUERY);
    const cq = window.matchMedia(COMPACT_QUERY);
    const on = () => {
      setIsMobile(mq.matches);
      setIsNarrow(nq.matches);
      setIsCompact(cq.matches);
    };
    on();
    mq.addEventListener('change', on);
    nq.addEventListener('change', on);
    cq.addEventListener('change', on);
    return () => {
      mq.removeEventListener('change', on);
      nq.removeEventListener('change', on);
      cq.removeEventListener('change', on);
    };
  }, []);
  const perPage = isMobile ? 1 : isNarrow ? 2 : PER_PAGE;

  const latestAligns = useMemo(
    () => ({
      yangjae: latestAlignmentDate(alignments, 'yangjae'),
      pangyo: latestAlignmentDate(alignments, 'pangyo'),
    }),
    [alignments]
  );
  // 이 지점 분쇄도 — 표기 문자열 + 슬라이더 기준 수치(판교 잠정 범위·재측정 필요면 수치 없음)
  const storeMesh = (r: DripRecipe): { text: string | null; value: number | null } => {
    // 그 지점 레시피면 grindMesh 가 곧 그 지점 다이얼. 판교 화면의 양재천 대체 레시피만 환산한다
    if (store === 'yangjae' || r.store === 'pangyo') {
      return r.grindMesh != null ? { text: meshFmt(r.grindMesh), value: r.grindMesh } : { text: r.grind || null, value: null };
    }
    if (r.pangyoMesh != null) return { text: meshFmt(r.pangyoMesh), value: r.pangyoMesh };
    if (r.grindMesh == null) return { text: null, value: null };
    return { text: pangyoText(r), value: convertDial(grinderProfiles, 'yangjae', 'pangyo', r.grindMesh) };
  };
  // 판교 EK43 표기 — 수동 보정 우선, 없으면 산식 자동값(필터커피 카드와 같은 규칙)
  const pangyoText = (r: DripRecipe) => {
    if (r.pangyoMesh != null) return meshFmt(r.pangyoMesh);
    if (r.grindMesh == null) return null;
    const p = pangyoDialText(grinderProfiles, r.grindMesh, latestAligns);
    if (!p) return null;
    if (p.stale) return '재측정 필요';
    return `${p.text}${p.provisional ? '*' : ''}`;
  };

  return (
    <div
      className="bg-background text-foreground"
      style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* 상단 바 — 돌아가기 · 제목 · 페이지 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          columnGap: isMobile ? 14 : 16,
          rowGap: 10,
          padding: isMobile ? '12px 16px' : '12px 20px',
          flexShrink: 0,
          whiteSpace: 'nowrap', // 좁은 폭에서 글자가 한 자씩 세로로 쪼개지지 않게 — 넘치면 줄 단위로 감싼다
        }}
      >
        {view === 'board' ? (
          <Link href="/garden/filtercoffee" className="text-body text-muted-foreground hover:text-foreground">
            {isMobile ? '←' : '← 필터커피'}
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
        {/* 대기 · 준비 중은 보드 아래 '대기 중' 묶음으로, 아카이브는 오른쪽 아래 고정 버튼으로 옮겼다(2026-11-25) — 위쪽에는 지점 전환만 */}
        <SegmentControl
          items={[...STORES].reverse().map((s) => ({ id: s.id, label: s.short }))}
          value={store}
          onSelect={pickStore}
          ariaLabel="지점"
        />
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
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))`, gap: 12 }}>
                {groups.map((g) => (
                  <div
                    key={g.beanKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenArchived(g.beanKey)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenArchived(g.beanKey)}
                    className="rounded-md bg-background shadow-soft"
                    style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '20px 24px', cursor: 'pointer', minWidth: 0, outline: 'none' }}
                  >
                    <span className="text-title font-medium" style={{ flex: 1, minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
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
              style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgb(0 0 0 / 0.5)' }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: 'min(420px, 92vw)', height: 'min(760px, 90dvh)', display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <button onClick={() => setOpenArchived(null)} className="text-body" style={{ ...plainBtn, alignSelf: 'flex-end', color: '#fff' }}>
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
                  floating
                  onArchive={() => {
                    setOpenArchived(null);
                    setArchived(g.beanKey, g.bean, false);
                  }}
                  onDeleteRecord={() => deleteRecord(g.beanKey, g.bean)}
                />
              </div>
            </div>
          );
        })()}

      {view === 'board' && !loading && !failed && beans.length + waitingBeans.length + pendingBeans.length === 0 && (
        <p className="text-body text-muted-foreground" style={{ padding: '0 20px' }}>
          레시피가 설정된 원두가 없어요.
        </p>
      )}

      {/* 보드 — 원두 이름만 한 줄에 하나씩. 판매 중이 위, 대기 중(판매 대기 + 레시피 없는 원두)이 아래 흐리게 */}
      {view === 'board' && !loading && beans.length + waitingBeans.length + pendingBeans.length > 0 && (
        <BoardBeanList
          selling={beans.map(rowOf)}
          waiting={[
            ...waitingBeans.map(rowOf),
            ...pendingBeans.map((p) => ({ beanKey: p.beanKey, bean: p.bean, tasting: tastingByBean.get(p.beanKey) ?? '', types: [], roast: roastInfo(purchaseRoast[p.beanKey]) })),
          ]}
          isMobile={isMobile}
          onPick={(beanKey) => {
            // 레시피가 있으면 이름 고르는 창, 하나도 없으면 이름 없이 '레시피 설정'(HOT 부터 — 이름은 저장할 때 고른다)
            if (allLiveBeans.some((x) => x.beanKey === beanKey)) setPicking(beanKey);
            else setFocus({ beanKey, bt: 'hot', stage: 'setup' });
          }}
        />
      )}

      {/* 아카이브 — 오른쪽 아래 고정 버튼(2026-11-25 대표 결정, 위쪽 글자 버튼에서 옮김). 아카이브한 원두가 없으면 숨긴다 */}
      {view === 'board' && archivedBeans.length > 0 && (
        <button type="button" onClick={() => setView('archive')} className="fc-fab-sub tabular text-body">
          아카이브 <span className="text-caption text-muted-foreground">{archivedBeans.length}</span>
        </button>
      )}

      {/* 누가 추출하나요? — 이름을 누르면 추출 화면으로(HOT 먼저). 대기 · 소진 · 판매 시작도 여기서 */}
      {view === 'board' &&
        picking &&
        (() => {
          const g = allLiveBeans.find((x) => x.beanKey === picking);
          if (!g) return null;
          return (
            <BrewerPicker
              bean={g.bean}
              staffNames={staffNames}
              waiting={waitingSet.has(g.beanKey)}
              onEnter={(name) => {
                setStaff(name);
                setPicking(null);
                setFocus({ beanKey: g.beanKey, bt: BREW_TYPES.find((t) => g[t]) ?? 'hot', stage: 'brew' });
              }}
              onWaiting={(on) => {
                setPicking(null);
                setWaiting(g.beanKey, g.bean, on);
              }}
              onArchive={() => {
                setPicking(null);
                setArchived(g.beanKey, g.bean, true);
              }}
              onClose={() => setPicking(null)}
            />
          );
        })()}

      {/* 들어온 원두 — 추출 화면(brew) → 추출 평가(eval). 의견 · 레시피 수정(edit)·레시피 설정(setup)은 레시피 카드 + 오른쪽 카드 두 장 */}
      {view === 'board' &&
        focus &&
        (() => {
          if (!focusStarters) return null;
          // 레시피가 하나도 없는 '준비 중' 원두도 연다 — 저장된 레시피가 없는 타입은 시작값으로 채워 '레시피 설정'으로
          const live = allLiveBeans.find((x) => x.beanKey === focus.beanKey);
          const pending = !live && pendingBeans.some((x) => x.beanKey === focus.beanKey);
          if (!live && !pending) return null;
          const saved: BoardBean = live ?? { beanKey: focus.beanKey, bean: focusStarters.bean, ice: null, hot: null, fallback: {}, latestUpdate: '' };
          const g: BoardBean = { ...saved, hot: saved.hot ?? focusStarters.hot, ice: saved.ice ?? focusStarters.ice };
          const unsaved = { hot: !saved.hot, ice: !saved.ice };
          const isNew = unsaved[focus.bt];
          const savedBt: BrewType = live?.[focus.bt] ? focus.bt : (BREW_TYPES.find((t) => live?.[t]) ?? focus.bt);
          // 추출 화면 — 저장된 레시피만 보여준다(없는 타입은 고를 수 없음)
          if (live && focus.stage === 'brew') {
            const rr = live[savedBt];
            return (
              <BrewScreen
                bean={live.bean}
                tasting={tastingByBean.get(live.beanKey) ?? ''}
                store={store}
                staff={staff}
                bt={savedBt}
                onBtChange={(bt) => setFocus({ beanKey: live.beanKey, bt, stage: 'brew' })}
                recipes={{ hot: live.hot, ice: live.ice }}
                fallback={live.fallback}
                storeMesh={storeMesh}
                opinionCount={
                  rr
                    ? feedback.filter((f) => f.beanKey === live.beanKey && f.brewType === savedBt && f.store === store && f.recipeVersion === rr.updatedAt).length
                    : 0
                }
                isMobile={isMobile}
                onBack={closeFocus}
                onEdit={() => setFocus({ beanKey: live.beanKey, bt: savedBt, stage: 'edit' })}
                onFinish={() => setFocus({ beanKey: live.beanKey, bt: savedBt, stage: 'eval' })}
              />
            );
          }
          // 이름을 누르고 들어온 흐름(eval · edit)은 추출 화면으로 돌아가고, 준비 중 원두의 레시피 설정(setup)은 보드로 닫는다
          const fromBrew = !!live && focus.stage !== 'setup';
          const back = () => {
            if (!fromBrew) return closeFocus();
            setPreview(null);
            setFocus({ beanKey: focus.beanKey, bt: savedBt, stage: 'brew' });
          };
          const mode: 'eval' | 'edit' = focus.stage === 'eval' && !isNew ? 'eval' : 'edit';
          const r = g[focus.bt] as DripRecipe;
          const shown = preview && preview.beanKey === g.beanKey && btOf(preview) === focus.bt ? { ...g, [focus.bt]: preview } : g;
          // 모바일은 두 카드를 위아래로 쌓고 화면 전체를 스크롤
          // 작은 태블릿(아이패드 미니)은 어두운 배경 없이 두 카드가 화면을 반씩 꽉 채운다 — 닫기는 위쪽 버튼으로만
          const full = isCompact && !isMobile;
          const box: React.CSSProperties = isMobile
            ? { width: '92vw', height: '82dvh', display: 'flex', minWidth: 0, flexShrink: 0 }
            : full
              ? { flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }
              : { width: 'min(404px, 44vw)', height: 'min(690px, 86dvh)', display: 'flex', minWidth: 0 };
          return (
            <div
              onClick={full ? undefined : back}
              className={full ? 'bg-background' : undefined}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 50,
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: full ? 'stretch' : 'center',
                justifyContent: isMobile ? 'flex-start' : 'center',
                gap: full ? 12 : 16,
                padding: isMobile ? '56px 0 24px' : full ? '48px 16px 16px' : 0,
                overflowY: isMobile ? 'auto' : 'visible',
                background: full ? undefined : 'rgb(0 0 0 / 0.5)',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  back();
                }}
                className={full ? 'text-body text-foreground' : 'text-body'}
                style={{
                  ...plainBtn,
                  position: 'absolute',
                  top: full ? 12 : 18,
                  // 돌아가기는 왼쪽 위, 닫기는 오른쪽 위
                  ...(fromBrew ? { left: full ? 20 : 24 } : { right: full ? 20 : 24 }),
                  ...(full ? {} : { color: '#fff' }), // 어두운 배경 위 — 다크 모드에서도 흰 글자
                }}
              >
                {fromBrew ? '← 레시피' : '닫기 ×'}
              </button>
              <div onClick={(e) => e.stopPropagation()} style={box}>
                <BoardCard
                  g={shown}
                  store={store}
                  tasting={tastingByBean.get(g.beanKey) ?? ''}
                  storeMesh={storeMesh}
                  staffNames={staffNames}
                  staff={staff}
                  onPickStaff={pickStaff}
                  feedback={feedback}
                  onFeedback={(rec) => setFeedback((xs) => [...xs, rec])}
                  onArchive={() => undefined}
                  bt={focus.bt}
                  onBtChange={(bt) => setFocus({ beanKey: g.beanKey, bt, stage: focus.stage })}
                  floating={!full}
                  unsaved={unsaved}
                  noActions // 대기 · 소진 · 판매 시작은 이름 고르는 창에서
                />
              </div>
              <div onClick={(e) => e.stopPropagation()} style={box}>
                <EvalCard
                  key={`${g.beanKey}:${store}`}
                  isFallback={!!g.fallback[focus.bt]}
                  isNew={isNew}
                  mode={mode}
                  onPreview={setPreview}
                  onRecipeSaved={(saved) => {
                    setPreview(null);
                    // 방금 만든 레시피의 반대 타입이 아직 없으면 이어서 그 타입 설정으로(HOT → ICE)
                    const other: BrewType = focus.bt === 'hot' ? 'ice' : 'hot';
                    if (isNew && unsaved[other]) setFocus({ beanKey: g.beanKey, bt: other, stage: focus.stage });
                    const merge = (xs: DripRecipe[]) => [...xs.filter((x) => !sameRecipeSlot(x, saved.beanKey, btOf(saved), store)), saved];
                    setRecipes(merge);
                    // 기기 캐시도 같이 고친다 — 다음에 보드를 열 때 옛 레시피가 잠깐 보이지 않게
                    try {
                      const raw = localStorage.getItem(CACHE_KEY);
                      if (raw) {
                        const d = JSON.parse(raw) as BoardData;
                        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...d, recipes: merge(d.recipes ?? []) }));
                      }
                    } catch {
                      // 캐시는 선택 사항
                    }
                  }}
                  store={store}
                  g={g}
                  bt={focus.bt}
                  recipe={r}
                  baseMesh={storeMesh(r).value}
                  staffNames={staffNames}
                  staff={staff}
                  onPickStaff={pickStaff}
                  feedback={feedback.filter((f) => f.beanKey === g.beanKey && f.brewType === focus.bt && f.store === store)}
                  onSaved={(rec) => {
                    // 평가를 남기면 이름을 지우고 보드로 — 다음 사람은 원두와 이름을 새로 고른다
                    setFeedback((xs) => [...xs, rec]);
                    closeFocus();
                  }}
                  floating={!full}
                />
              </div>
            </div>
          );
        })()}

    </div>
  );
}

// 노트를 두 줄로 — 쉼표 목록을 앞 절반 / 뒤 절반으로 나눈다(홀수면 윗줄이 하나 더). 쉼표가 없으면 한 줄
const tastingLines = (t: string): string[] => {
  const items = t.split(/[,，·]/).map((x) => x.trim()).filter(Boolean);
  if (items.length < 2) return [t];
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half).join(', '), items.slice(half).join(', ')];
};

const plainBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' };

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
  bt: btProp,
  onBtChange,
  floating = false,
  waiting = false,
  onWaiting,
  onDeleteRecord,
  unsaved,
  noActions = false,
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
  bt?: BrewType; // 평가·수정 화면의 카드 — ICE/HOT 을 오른쪽 카드와 맞추려고 바깥에서 제어
  onBtChange?: (bt: BrewType) => void;
  floating?: boolean; // 어두운 배경 위에 뜬 카드 — 그림자를 절반으로(빛 번짐이 세 보여서)
  waiting?: boolean; // 이 지점 판매 대기 — '대기'·'소진' 대신 '판매 시작'
  onWaiting?: (on: boolean) => void;
  onDeleteRecord?: () => void; // 아카이브 크게 보기 — '기록 삭제'(확인 1회)
  unsaved?: Partial<Record<BrewType, boolean>>; // 크게 보기 — 아직 저장 전인 타입(시작값을 비추는 중)
  noActions?: boolean; // 저장된 레시피가 하나도 없는 원두 — '대기'·'소진'을 숨긴다
}) {
  const types = BREW_TYPES.filter((bt) => g[bt]);
  const [ownBt, setOwnBt] = useState<BrewType>(types[0] ?? 'ice');
  const bt = btProp ?? ownBt;
  const setBt = (t: BrewType) => (onBtChange ? onBtChange(t) : setOwnBt(t));
  const [confirmArchive, setConfirmArchive] = useState(false); // 소진 — 실수 방지로 한 번 더 확인
  const r = g[bt] ?? g[types[0]];
  if (!r) return null;
  const ratio = r.doseG && r.waterG ? `1:${(r.waterG / r.doseG).toFixed(1)}` : null;
  const mesh = storeMesh(r);
  const isFallback = !!g.fallback[bt];
  // 카드 안 버튼(ICE/HOT·소진 등)은 카드 열기와 겹치지 않게 전파를 막는다
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      className={`rounded-md bg-background ${floating ? '' : 'shadow-soft'}`}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        // shadow-soft 의 절반(오프셋·번짐·불투명도 ½) — 어두운 배경 위 흰 빛 번짐이 너무 세서 (2026-11-01)
        boxShadow: floating ? '3px 3px 8px hsl(45 8% 78% / 0.21), -3px -3px 8px hsl(0 0% 100% / 0.45)' : undefined,
      }}
    >
      {/* 헤더(N2 상단, 2026-10-31) — 노트 색은 얇은 띠 하나로만, 아래 흰 바탕에 원두명. 스크롤해도 고정 */}
      <div style={{ flexShrink: 0, padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          className="bg-muted"
          style={{ height: 6, borderRadius: 999, backgroundImage: flavorGradient(tasting) ?? undefined }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          {/* 원두명은 자르지 않고 줄바꿈 — 한글은 어절 단위(keep-all) */}
          <p className="text-title font-medium" style={{ flex: 1, minWidth: 0, margin: 0, lineHeight: 1.35, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {g.bean}
          </p>
          {/* 소진 — 못 팔게 되면 필터 커피 아카이브로 (레시피·이력·평가는 유지, 레시피 탭에서 되돌릴 수 있음) */}
          {noActions ? null : archived && confirmArchive ? (
            <span className="text-caption" style={{ display: 'flex', gap: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
              <span className="text-destructive">레시피를 완전히 지울까요?</span>
              <button onClick={stop(() => onDeleteRecord?.())} className="text-destructive underline" style={plainBtn}>
                삭제
              </button>
              <button onClick={stop(() => setConfirmArchive(false))} className="text-muted-foreground hover:text-foreground" style={plainBtn}>
                취소
              </button>
            </span>
          ) : archived ? (
            <span style={{ display: 'flex', gap: 12, flexShrink: 0, whiteSpace: 'nowrap' }}>
              <button
                onClick={stop(onArchive)}
                className="text-caption text-muted-foreground hover:text-foreground"
                style={plainBtn}
                title="레시피 보드로 되돌리기"
              >
                되돌리기
              </button>
              {onDeleteRecord && (
                <button
                  onClick={stop(() => setConfirmArchive(true))}
                  className="text-caption text-muted-foreground hover:text-destructive"
                  style={plainBtn}
                  title="레시피(ICE·HOT·모든 지점)와 수정 이력 삭제 — 발주 기록·추출 평가는 남아요"
                >
                  기록 삭제
                </button>
              )}
            </span>
          ) : confirmArchive ? (
            <span className="text-caption" style={{ display: 'flex', gap: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
              <span className="text-muted-foreground">아카이브로 보낼까요?</span>
              <button onClick={stop(onArchive)} className="text-foreground underline" style={plainBtn}>
                확인
              </button>
              <button onClick={stop(() => setConfirmArchive(false))} className="text-muted-foreground hover:text-foreground" style={plainBtn}>
                취소
              </button>
            </span>
          ) : waiting && onWaiting ? (
            <button
              onClick={stop(() => onWaiting(false))}
              className="text-caption text-foreground underline"
              style={{ ...plainBtn, flexShrink: 0, whiteSpace: 'nowrap' }}
              title="이 지점 판매 시작 — 레시피 보드에 올라가요"
            >
              판매 시작
            </button>
          ) : (
            <span style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {onWaiting && (
              <button
                onClick={stop(() => onWaiting(true))}
                className="text-caption text-muted-foreground hover:text-foreground"
                style={{ ...plainBtn, whiteSpace: 'nowrap' }}
                title="이 지점 판매 대기 — 보드에서 빠지고 위쪽 '대기' 목록으로"
              >
                대기
              </button>
            )}
            <button
              onClick={stop(() => setConfirmArchive(true))}
              className="text-caption text-muted-foreground hover:text-foreground"
              style={{ ...plainBtn, flexShrink: 0, whiteSpace: 'nowrap' }}
              title="원두 소진 — 필터 커피 아카이브로 보내기"
            >
              소진
            </button>
            </span>
          )}
        </div>
      </div>
      {/* 레시피 — 길면 카드 안에서 세로 스크롤 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* flex: 1 — 추출비·추출 시간을 흰 영역 맨 아래에 붙이기 위해 높이를 채운다 */}
        <div style={{ flex: 1, padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ICE/HOT 세그먼트 — 글자 전환은 잘 안 보여 세그먼트로 복귀, 카드 폭의 절반 크기 (2026-10-31 대표 지시).
              레시피가 하나뿐이어도 같은 자리(카드 간 줄 맞춤). 없는 타입은 흐리게·비활성 */}
          <div className="ta-seg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '50%', alignSelf: 'flex-start' }}>
            {BREW_TYPES.map((t) => (
              <button
                key={t}
                onClick={stop(() => setBt(t))}
                disabled={!g[t]}
                className={`ta-seg-item ${t === bt ? 'ta-seg-on' : ''} disabled:cursor-default disabled:opacity-30`}
                style={t === bt ? brewOnStyle(t) : undefined}
                title={g[t] ? undefined : `${t.toUpperCase()} 레시피 없음`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {isFallback && (
            <p className="text-caption text-muted-foreground" style={{ margin: '-12px 0 0' }}>
              판교 레시피 없음 · 양재천 레시피 기준(분쇄도는 판교 환산)
            </p>
          )}
          {unsaved?.[bt] && (
            <p className="text-caption text-muted-foreground" style={{ margin: '-12px 0 0' }}>
              {bt.toUpperCase()} 레시피 없음 · 저장 전 기준값
            </p>
          )}

          {/* 2칸 × 2줄 큰 숫자(N2 상단) — 숫자 위, 라벨은 아래 옅게 */}
          <div className="tabular" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16, rowGap: 24 }}>
            <Stat label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
            <Stat label="추출량" value={r.waterG != null ? `${r.waterG}g` : null} />
            <Stat label="온도" value={r.tempC != null ? `${r.tempC}°` : null} />
            {/* 지점은 위쪽 바 전환으로 이미 정해져 라벨에서 뺀다 */}
            <Stat label="분쇄도 EK43" value={mesh.text} warn={mesh.text === '재측정 필요'} />
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

          {/* 가수 — 추출이 끝난 뒤 서버에 더하는 물. 푸어링 목록 바로 아래 한 줄, 오른쪽은 음료량(추출량 + 가수) */}
          {bypassOf(r) > 0 && (
            <div
              className="tabular text-body border-t border-border"
              style={{ display: 'grid', gridTemplateColumns: '1fr auto 64px', gap: 12, alignItems: 'baseline', marginTop: -16, paddingTop: 12 }}
            >
              <span className="text-muted-foreground">가수 (추출 후)</span>
              <span>+{bypassOf(r)}g</span>
              <span className="text-muted-foreground" style={{ textAlign: 'right' }}>{drinkG(r) != null ? `${drinkG(r)}g` : ''}</span>
            </div>
          )}

          {r.notes && (
            <p className="text-caption text-muted-foreground" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {r.notes}
            </p>
          )}

          {/* 테이스팅 노트 — 푸어링과 추출비 사이 빈 공간 정중앙 (2026-10-30 대표 지시) */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {tasting && (
              <p className="text-body text-muted-foreground" style={{ margin: 0, textAlign: 'center', lineHeight: 1.8, wordBreak: 'keep-all' }}>
                {tastingLines(tasting).map((line, i) => (
                  <span key={i} style={{ display: 'block' }}>
                    {line}
                  </span>
                ))}
              </p>
            )}
          </div>

          {/* 추출비·추출 시간 — 흰 영역 맨 아래 정렬, 같은 크기 */}
          {(ratio || r.totalTime) && (
            <div className="tabular text-body" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span>{ratio && `추출비: ${ratio}`}</span>
              <span>{r.totalTime && `추출 시간: ${r.totalTime}`}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// 추출 평가 카드 — 크게 띄운 레시피 카드 옆, 같은 크기. 내용은 BrewFeedbackPanel 그대로
function EvalCard({
  store,
  g,
  bt,
  recipe,
  baseMesh,
  staffNames,
  staff,
  onPickStaff,
  feedback,
  onSaved,
  floating = true,
  isFallback,
  isNew = false,
  mode,
  onPreview,
  onRecipeSaved,
}: {
  isFallback: boolean;
  mode: 'eval' | 'edit'; // eval: 추출 평가(이름은 들어올 때 정해짐) / edit: 의견 · 레시피 수정
  isNew?: boolean; // 이 타입 레시피가 아직 없다 — 평가 탭 없이 '레시피 설정'만
  onPreview: (r: DripRecipe | null) => void;
  onRecipeSaved: (r: DripRecipe) => void;
  store: StoreId;
  g: BoardBean;
  bt: BrewType;
  recipe: DripRecipe;
  baseMesh: number | null;
  staffNames: string[];
  staff: string;
  onPickStaff: (name: string) => void;
  feedback: BrewFeedback[];
  onSaved: (rec: BrewFeedback) => void;
  floating?: boolean; // 어두운 배경 위(기본) — 화면 전체 보기에선 보드 카드와 같은 그림자
}) {
  // 추출 화면에서 고른 길 하나만 보여준다 — [추출 끝 · 평가 남기기] 또는 「의견 · 레시피 수정」(2026-11-25, 탭 폐지)
  const currentCount = feedback.filter((f) => f.recipeVersion === recipe.updatedAt).length;
  return (
    <div
      className={`rounded-md bg-background ${floating ? '' : 'shadow-soft'}`}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        boxShadow: floating ? '3px 3px 8px hsl(45 8% 78% / 0.21), -3px -3px 8px hsl(0 0% 100% / 0.45)' : undefined,
      }}
    >
      <div className="border-b border-border" style={{ flexShrink: 0, margin: '24px 24px 0', display: 'flex', alignItems: 'baseline', gap: 20 }}>
        <span className="tabular text-body font-medium text-foreground" style={{ padding: '0 0 10px', whiteSpace: 'nowrap', boxShadow: '0 2px 0 hsl(var(--foreground))' }}>
          {isNew ? '레시피 설정' : mode === 'eval' ? '추출 평가' : `의견 ${currentCount} · 레시피 수정`}
        </span>
        <span className="text-caption text-muted-foreground" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {STORES.find((s) => s.id === store)?.short} · {bt.toUpperCase()}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px 24px' }}>
        {mode === 'eval' && !isNew ? (
          <BrewFeedbackPanel
            store={store}
            beanKey={g.beanKey}
            bean={g.bean}
            brewType={bt}
            recipe={recipe}
            baseMesh={baseMesh}
            staffNames={staffNames}
            staff={staff}
            onPickStaff={onPickStaff}
            lockStaff
            feedback={feedback}
            onSaved={onSaved}
          />
        ) : (
          <RecipeQuickEdit
            key={bt}
            store={store}
            beanKey={g.beanKey}
            bean={g.bean}
            brewType={bt}
            recipe={recipe}
            baseMesh={baseMesh}
            isFallback={isFallback}
            isNew={isNew}
            feedback={feedback}
            staffNames={staffNames}
            staff={staff}
            onPickStaff={onPickStaff}
            onPreview={onPreview}
            onSaved={onRecipeSaved}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string | null; warn?: boolean }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        className={warn ? 'text-body text-amber-600 dark:text-amber-500' : 'text-display'}
        // 보드 큰 숫자는 display(34px)보다 한 단계 작게 28px — 2026-10-31 대표 지정(폰트 램프 예외, 보드 전용)
        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1, ...(warn ? {} : { fontSize: 28 }) }}
      >
        {value ?? '—'}
      </div>
      <div className="text-caption text-muted-foreground" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  );
}
