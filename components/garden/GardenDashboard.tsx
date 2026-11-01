'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BeanMeta, BrewType, DripRecipe, DripRecipeSnapshot, PourStep, PurchaseRecord, StoreId } from '@/lib/types';
import { STORES, STOCK_LEVELS, stockOf, beanRegisteredAt, daysSince, dPlusLevel } from '@/lib/types';
import { costPerCup, normalize } from '@/lib/pricing';
import { applyPreset, presetById } from '@/lib/drip-presets';
import { flavorGradient } from '@/lib/flavor-colors';
import BrewTimer from '@/components/garden/BrewTimer';
import { toast } from '@/components/Toast';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { convertDial, pangyoDialText } from '@/lib/grinder-calibration';
import { latestAlignmentDate, type AlignmentEvent } from '@/lib/grinder-alignments';
import { fmtDate } from '@/lib/garden/format';
import { ETC, countryOf, isBeanArchived, resolveTasting } from '@/lib/garden/bean-groups';
import { recipeChanges, recipesForStore, sameRecipeSlot } from '@/lib/garden/recipe-store';
import { recentDefaults } from '@/lib/garden/recent-defaults';
import SegmentControl from '@/components/nav/SegmentControl';
import TastingNoteEditor from '@/components/garden/TastingNoteEditor';

// 카드 헤더의 지점별 재고량 칩(판교 100% · 양재천 100%) — 2026-10-31 대표 지시로 '일단' 숨김.
// 재고 데이터·알림 로직은 그대로라 true 로 바꾸면 바로 복구된다.
const SHOW_STOCK_CHIPS = false;

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

const BREW_TYPES: BrewType[] = ['ice', 'hot'];
const btOf = (r: DripRecipe): BrewType => r.brewType ?? 'ice';
const btLabel = (bt: BrewType) => bt.toUpperCase();
const housePresetId = (bt: BrewType) => (bt === 'ice' ? 'house-ice' : 'house-hot');

// ---- 드랍다운 선택지 ----
const DOSE_OPTS = Array.from({ length: 9 }, (_, i) => 16 + i); // 도징량 16~24g (1g)
const TEMP_OPTS = [91, 92, 93, 94]; // 물 온도 °C
const POUR_OPTS = Array.from({ length: 17 }, (_, i) => 20 + i * 5); // 푸어링당 20~100g (5g, 2026-10-31 확장)
const TIME_OPTS = Array.from({ length: 10 }, (_, i) => {
  const s = 150 + i * 10; // 2:30 ~ 4:00 (10초)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

// 분쇄도 (EK43 양재천 기준) — 0.1 단위 스테퍼, 4.0~9.0
const MESH_MIN = 4;
const MESH_MAX = 9;
const meshFmt = (n: number) => n.toFixed(1);

// 프리셋/구 기록 값이 범위 밖이면 그 값도 선택지에 포함해 표기 유지
const withCur = (opts: number[], cur: number | null) =>
  cur != null && !opts.includes(cur) ? [...opts, cur].sort((a, b) => a - b) : opts;
const withCurStr = (opts: string[], cur: string) =>
  cur && !opts.includes(cur) ? [...opts, cur].sort() : opts;

const pourName = (p: PourStep, i: number) => p.label ?? (i === 0 ? '뜸' : `${i}차`);

const meshBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: 1,
  padding: '0 14px',
  height: '100%',
  fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
};

// 비율 표기 (1 : n.n) — 도징·물량 둘 다 있을 때만
const ratioOf = (doseG: number | null | undefined, waterG: number | null | undefined) =>
  doseG && waterG ? `1 : ${(waterG / doseG).toFixed(1).replace(/\.0$/, '')}` : null;

// 레시피 편집 폼 상태 (셀렉트 값은 문자열, '' = 미설정)
interface Draft {
  beanKey: string;
  bean: string;
  brewType: BrewType;
  store: StoreId; // 레시피 지점 — 판교 레시피의 분쇄도는 판교 EK43 다이얼
  presetId: string;
  doseG: string;
  tempC: string;
  grindMesh: string; // '' = 미설정, 그 외 '6.5' 형태
  totalTime: string;
  pours: PourStep[];
  notes: string; // 사용자가 직접 쓴 메모만 — 추천 안내문은 notesHint(placeholder)로만 노출
  notesHint: string;
  tasting: string; // 테이스팅 노트 (원두 공통 — 저장 시 garden-beans로 별도 업서트)
}

// 타입별 매장 기준 안내문 — 메모 칸 회색 placeholder로만 쓰고 저장하지 않는다
const houseHint = (bt: BrewType) => {
  const p = presetById(housePresetId(bt));
  return p ? applyPreset(p).notes : '';
};

// 구 기록의 분쇄도 텍스트(예: 'EK43(양재천) 6.5')에서 수치만 추출.
// 첫 숫자를 그대로 잡으면 'EK43'의 43이 걸리므로, EK43 다이얼로 말이 되는
// 범위(4~13)의 숫자만 mesh로 인정한다.
const meshFromLegacy = (grind: string) => {
  const nums = (grind.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const mesh = nums.find((n) => n >= 4 && n <= 13);
  return mesh != null ? String(mesh) : '';
};

const draftFromRecipe = (r: DripRecipe): Draft => ({
  beanKey: r.beanKey,
  bean: r.bean,
  brewType: btOf(r),
  store: r.store ?? 'yangjae',
  presetId: r.presetId ?? '',
  doseG: r.doseG != null ? String(r.doseG) : '',
  tempC: r.tempC != null ? String(r.tempC) : '',
  grindMesh: r.grindMesh != null ? meshFmt(r.grindMesh) : meshFromLegacy(r.grind),
  totalTime: r.totalTime,
  // 푸어링 없이 총 물량만 있는 구 기록은 한 단계로 변환해 표시
  pours: r.pours ?? (r.waterG != null ? [{ water: r.waterG, label: '총 물량' }] : []),
  notes: r.notes,
  notesHint: houseHint(btOf(r)),
  tasting: '', // openEditor에서 원두 공통 노트로 채움
});

// 새 레시피 — 해당 타입의 매장 기준 프리셋으로 채워서 시작
const presetDraft = (beanKey: string, bean: string, brewType: BrewType, store: StoreId): Draft => {
  const presetId = housePresetId(brewType);
  const p = presetById(presetId);
  const a = applyPreset(p!);
  return {
    beanKey,
    bean,
    brewType,
    store,
    presetId,
    doseG: String(a.doseG),
    tempC: a.tempC != null ? String(a.tempC) : '',
    grindMesh: a.grindMesh != null ? meshFmt(a.grindMesh) : '',
    totalTime: a.totalTime,
    pours: a.pours,
    notes: '',
    notesHint: a.notes,
    tasting: '', // openEditor에서 원두 공통 노트로 채움
  };
};

// 원두 하나 = ICE/HOT 레시피 슬롯 한 쌍
interface BeanGroup {
  beanKey: string;
  bean: string;
  ice: DripRecipe | null;
  hot: DripRecipe | null;
  latestUpdate: string;
}

// section: 'unset' = 가든 대시보드(미설정 원두만) / 'recipes' = 필터 레시피 탭(카드 전체, 국가별)
// 편집기·타이머 오버레이는 두 모드 공통.
export default function GardenDashboard({ section = 'recipes' }: { section?: 'unset' | 'recipes' }) {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [recipes, setRecipes] = useState<DripRecipe[]>([]);
  const [beanMetas, setBeanMetas] = useState<BeanMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // 테이스팅 노트 인라인 편집 상태 (원두 단위)
  const [tastingEdit, setTastingEdit] = useState<{ beanKey: string; bean: string; value: string } | null>(null);
  const [tastingSaving, setTastingSaving] = useState(false);
  // 이력 펼침 상태 — `${beanKey}:${brewType}` 키
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  // 재고량 칩 → 퍼센트 선택 중인 원두·지점
  const [stockPicker, setStockPicker] = useState<{ beanKey: string; store: StoreId } | null>(null);
  // 추출 타이머 오버레이 — 열려 있는 레시피
  const [timerFor, setTimerFor] = useState<{ bean: string; brewType: BrewType; recipe: DripRecipe } | null>(null);
  // 지점별 그라인더 측정 프로파일 (분쇄도 지점 간 환산용)
  const [grinderProfiles, setGrinderProfiles] = useState<GrinderProfiles>({});
  // 얼라인먼트 이력 — 07-16 오프셋 폴백이 아직 유효한지 판정용 (실패해도 화면은 동작)
  const [alignments, setAlignments] = useState<AlignmentEvent[]>([]);
  // 미설정 원두 삭제 진행 중인 beanKey
  const [deletingBean, setDeletingBean] = useState<string | null>(null);
  // 국가 필터 칩 (recipes 모드)
  const [selectedCountry, setSelectedCountry] = useState('전체');
  // 레시피 지점 — 태블릿 레시피 보드와 같은 기기 저장값을 공유(한 기기 = 한 매장)
  const [store, setStore] = useState<StoreId>('yangjae');
  useEffect(() => {
    const saved = localStorage.getItem('garden-board-store');
    if (saved === 'pangyo' || saved === 'yangjae') setStore(saved);
  }, []);
  const pickStore = (id: string) => {
    setStore(id as StoreId);
    localStorage.setItem('garden-board-store', id);
    setDraft(null); // 다른 지점 레시피를 편집 중이면 닫는다 — 엉뚱한 지점에 저장되는 것 방지
  };
  // 보관함 펼침 (recipes 모드)
  const [archiveOpen, setArchiveOpen] = useState(false);
  // 되돌리기 — 판매가가 잘못됐으면 판매가 담당자에게 재검토를 요청 (beanKey 단위로 노트 입력창 하나만 연다)
  const [priceReviewOpenFor, setPriceReviewOpenFor] = useState<string | null>(null);
  const [priceReviewNote, setPriceReviewNote] = useState('');
  const [priceReviewSending, setPriceReviewSending] = useState(false);

  const refresh = async () => {
    try {
      const [pRes, rRes, bRes, gRes] = await Promise.all([
        fetch('/api/purchases', { cache: 'no-store' }),
        fetch('/api/garden-recipes', { cache: 'no-store' }),
        fetch('/api/garden-beans', { cache: 'no-store' }),
        fetch('/api/garden-grinders', { cache: 'no-store' }),
      ]);
      if (pRes.ok) setPurchases(await pRes.json());
      if (rRes.ok) setRecipes(await rRes.json());
      if (bRes.ok) setBeanMetas(await bRes.json());
      if (gRes.ok) setGrinderProfiles(await gRes.json());
      // 조회 실패 시 빈 화면이 "레시피 없음"으로 오해되지 않게 알린다
      if (![pRes, rRes, bRes, gRes].every((r) => r.ok)) toast('일부 데이터를 불러오지 못했어요. 새로고침해 주세요.', 'error');
      // 얼라인먼트는 부가 정보 — 권한이 없거나 실패해도 조용히 넘어간다
      const aRes = await fetch('/api/garden-grinder-alignments', { cache: 'no-store' }).catch(() => null);
      if (aRes?.ok) setAlignments(await aRes.json());
    } catch {
      toast('데이터를 불러오지 못했어요. 네트워크를 확인해 주세요.', 'error');
    }
    setLoading(false);
  };
  useEffect(() => {
    refresh();
  }, []);

  const requestPriceReview = async (purchaseId: string) => {
    if (priceReviewSending) return;
    setPriceReviewSending(true);
    try {
      const res = await fetch('/api/purchases/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: purchaseId, target: 'price', note: priceReviewNote.trim() || undefined }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error ?? '요청에 실패했어요.');
      setPurchases((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setPriceReviewOpenFor(null);
      setPriceReviewNote('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setPriceReviewSending(false);
    }
  };

  // 원두별 최신 발주 기록 (표시명·책정 판매가 참조용)
  const latestByBean = useMemo(() => {
    const m = new Map<string, PurchaseRecord>();
    for (const r of purchases) {
      const k = normalize(r.bean);
      const cur = m.get(k);
      if (!cur || r.createdAt.localeCompare(cur.createdAt) > 0) m.set(k, r);
    }
    return m;
  }, [purchases]);

  // 선택 지점 레시피 — 판교에 아직 없는 슬롯은 양재천 레시피로 대신 보여준다(fallbackIds)
  const storeView = useMemo(() => recipesForStore(recipes, store), [recipes, store]);
  const fallbackIds = useMemo(
    () => new Set(storeView.filter((x) => x.fallback).map((x) => x.recipe.id ?? '')),
    [storeView]
  );
  const isFallback = (r: DripRecipe) => fallbackIds.has(r.id ?? '');

  // 레시피가 하나라도 있는 원두 — ICE/HOT 슬롯으로 묶고 최신 업데이트순
  const beanGroups = useMemo(() => {
    const m = new Map<string, BeanGroup>();
    for (const { recipe: r } of storeView) {
      const g = m.get(r.beanKey) ?? { beanKey: r.beanKey, bean: r.bean, ice: null, hot: null, latestUpdate: '' };
      g[btOf(r)] = r;
      if (r.updatedAt.localeCompare(g.latestUpdate) > 0) {
        g.latestUpdate = r.updatedAt;
        g.bean = r.bean;
      }
      m.set(r.beanKey, g);
    }
    return Array.from(m.values()).sort((a, b) => b.latestUpdate.localeCompare(a.latestUpdate));
  }, [storeView]);

  // 테이스팅 노트 — 레시피에서 직접 쓴 노트(garden-beans)가 우선, 없으면 발주 때 입력한 노트를 그대로 쓴다
  // (2026-10-31 대표 지시: 발주 노트를 레시피에서 다시 입력하지 않게). 발주 노트는 원두별 가장 최근 입력분.
  const tastingByBean = useMemo(() => {
    const m = new Map<string, string>();
    const at = new Map<string, string>();
    for (const r of purchases) {
      const t = r.tastingNotes?.trim();
      if (!t) continue;
      const k = normalize(r.bean);
      if (!at.has(k) || r.createdAt.localeCompare(at.get(k)!) > 0) {
        at.set(k, r.createdAt);
        m.set(k, t);
      }
    }
    for (const b of beanMetas) m.set(b.beanKey, resolveTasting(b, m.get(b.beanKey)));
    return m;
  }, [beanMetas, purchases]);
  // 지점별 재고량 — stockByStore 우선, 구버전 소진 기록은 0%/100%로 해석
  const metaByBean = useMemo(() => new Map(beanMetas.map((b) => [b.beanKey, b])), [beanMetas]);
  const stockOfBean = (beanKey: string, storeId: StoreId) => stockOf(metaByBean.get(beanKey), storeId);

  // 보관 여부 — 보관 이후 같은 원두 발주가 새로 들어왔으면 자동 해제로 본다
  const isArchived = (beanKey: string) => isBeanArchived(metaByBean.get(beanKey), latestByBean.get(beanKey));
  const [activeGroups, archivedGroups] = useMemo(
    () => [beanGroups.filter((g) => !isArchived(g.beanKey)), beanGroups.filter((g) => isArchived(g.beanKey))],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isArchived 는 metaByBean·latestByBean 만 참조
    [beanGroups, metaByBean, latestByBean]
  );

  // 레시피 분쇄도(양재천 EK43 기준) → 판교 EK43 표기 — 피팅 준비 시 확정값,
  // 아니면 2026-07-16 실측 오프셋 기반 잠정 범위(*)로 폴백.
  // 오프셋 측정일 이후 얼라인이 있으면 낡은 범위 대신 '재측정 필요'를 표시한다.
  const latestAligns = useMemo(
    () => ({
      yangjae: latestAlignmentDate(alignments, 'yangjae'),
      pangyo: latestAlignmentDate(alignments, 'pangyo'),
    }),
    [alignments]
  );
  const pangyoMeshText = (mesh: number | null | undefined) => {
    if (mesh == null) return null;
    const p = pangyoDialText(grinderProfiles, mesh, latestAligns);
    if (!p) return null;
    if (p.stale) return '재측정 필요';
    return `${p.text}${p.provisional ? '*' : ''}`;
  };

  // 국가별 섹션 (recipes 모드) — 보관하지 않은 레시피 원두(재고 유무 무관), 국가 가나다순 · '기타' 맨 뒤,
  // 국가 안에서는 beanGroups의 최신 업데이트순 유지
  const countrySections = useMemo(() => {
    const byCountry = new Map<string, BeanGroup[]>();
    for (const g of activeGroups) {
      const c = countryOf(g.bean);
      byCountry.set(c, [...(byCountry.get(c) ?? []), g]);
    }
    const list = Array.from(byCountry.entries()).map(([country, groups]) => ({ country, groups }));
    list.sort((a, b) =>
      a.country === ETC ? 1 : b.country === ETC ? -1 : a.country.localeCompare(b.country, 'ko')
    );
    return list;
  }, [activeGroups]);

  // 발주 기록엔 있지만 레시피가 하나도 없는 원두
  const unsetBeans = useMemo(() => {
    const has = new Set(recipes.map((r) => r.beanKey));
    return Array.from(latestByBean.entries())
      .filter(([k]) => !has.has(k))
      .map(([, rec]) => rec)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [latestByBean, recipes]);

  // 미설정 원두 목록에서 제거 — 최신 건만 지우면 이전 발주가 다시 노출되므로 해당 원두 기록 전체 삭제
  const deleteUnsetBean = async (rec: PurchaseRecord) => {
    const k = normalize(rec.bean);
    const targets = purchases.filter((r) => normalize(r.bean) === k);
    if (!window.confirm(`'${rec.bean}' 발주 기록 ${targets.length}건을 삭제할까요?`)) return;
    setDeletingBean(k);
    try {
      // 서버가 blob 전체를 읽고 다시 쓰는 구조라 병렬 삭제는 유실 위험 — 순차 실행
      for (const r of targets) {
        await fetch('/api/purchases', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: r.id }),
        });
      }
      await refresh();
    } finally {
      setDeletingBean(null);
    }
  };

  // 미설정 원두의 "레시피 설정" — ICE 편집을 열고, 저장하면 같은 원두의 HOT 편집이 자동으로 이어진다
  const [chainHotFor, setChainHotFor] = useState<string | null>(null);
  const startUnsetSetup = (beanKey: string, bean: string) => {
    // openEditor가 이전 연결 플래그를 지우므로, 연 뒤에 설정해야 이번 연결이 살아남는다
    openEditor(beanKey, bean, 'ice');
    setChainHotFor(beanKey);
  };

  // 새 레시피 기본값 — 같은 지점·타입 최근 20개 레시피의 최빈값(2026-11-01). 항목이 비면 매장 기준 프리셋 값 유지.
  // 판교 레시피가 아직 없으면 양재천 최근값을 쓰되 분쇄도는 판교 다이얼로 환산(환산 불가면 프리셋).
  const defaultDraft = (beanKey: string, bean: string, brewType: BrewType, st: StoreId): Draft => {
    const base = presetDraft(beanKey, bean, brewType, st);
    let d = recentDefaults(recipes, brewType, st);
    let grind = d?.grindMesh ?? null;
    if (!d && st === 'pangyo') {
      d = recentDefaults(recipes, brewType, 'yangjae');
      grind = d?.grindMesh != null ? convertDial(grinderProfiles, 'yangjae', 'pangyo', d.grindMesh) : null;
    }
    if (!d) return base;
    return {
      ...base,
      presetId: '', // 프리셋이 아니라 최근 레시피 기준
      doseG: d.doseG != null ? String(d.doseG) : base.doseG,
      tempC: d.tempC != null ? String(d.tempC) : base.tempC,
      grindMesh: grind != null ? meshFmt(grind) : base.grindMesh,
      totalTime: d.totalTime ?? base.totalTime,
      pours: d.pours ?? base.pours,
    };
  };

  // 편집 열기 — 기존 레시피가 있으면 불러오고, 없으면 최근 레시피 기준 기본값으로 시작
  const openEditor = (beanKey: string, bean: string, brewType: BrewType) => {
    // 다른 편집을 열면 이전 ICE→HOT 연결은 무효 — 남아 있으면 나중에 엉뚱한 HOT 편집이 이어진다
    setChainHotFor(null);
    const existing = recipes.find((r) => sameRecipeSlot(r, beanKey, brewType, store));
    // 판교 레시피가 아직 없으면 양재천 레시피를 바탕으로 판교 레시피를 새로 만든다 — 분쇄도는 판교 값(보정 > 확정 환산)
    const yangjae = store === 'pangyo' && !existing ? recipes.find((r) => sameRecipeSlot(r, beanKey, brewType, 'yangjae')) : undefined;
    let base: Draft;
    if (existing) base = draftFromRecipe(existing);
    else if (yangjae) {
      const pg = yangjae.pangyoMesh ?? (yangjae.grindMesh != null ? convertDial(grinderProfiles, 'yangjae', 'pangyo', yangjae.grindMesh) : null);
      base = { ...draftFromRecipe(yangjae), store: 'pangyo', grindMesh: pg != null ? meshFmt(pg) : '' };
    } else base = defaultDraft(beanKey, bean, brewType, store);
    setDraft({ ...base, tasting: tastingByBean.get(beanKey) ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 이력 스냅샷을 편집 폼에 불러오기 — 저장을 눌러야 실제 복원됨
  const restoreSnapshot = (beanKey: string, bean: string, brewType: BrewType, s: DripRecipeSnapshot) => {
    setChainHotFor(null);
    const base = draftFromRecipe({
      beanKey,
      bean,
      brewType,
      doseG: s.doseG,
      waterG: s.waterG,
      pours: s.pours,
      tempC: s.tempC,
      grind: s.grind,
      grindMesh: s.grindMesh,
      totalTime: s.totalTime,
      notes: s.notes,
      presetId: s.presetId,
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
    });
    setDraft({ ...base, store, tasting: tastingByBean.get(beanKey) ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleHistory = (key: string) =>
    setOpenHistory((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // 테이스팅 노트 저장 (비우면 삭제)
  const saveTasting = async () => {
    if (!tastingEdit || tastingSaving) return;
    setTastingSaving(true);
    const res = await fetch('/api/garden-beans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey: tastingEdit.beanKey, bean: tastingEdit.bean, tasting: tastingEdit.value }),
    }).catch(() => null);
    if (!res?.ok) {
      // 실패 시 편집창을 닫지 않는다 — 입력값 유실 방지
      toast('테이스팅 노트 저장에 실패했어요. 다시 시도해 주세요.', 'error');
      setTastingSaving(false);
      return;
    }
    await refresh();
    setTastingEdit(null);
    setTastingSaving(false);
  };

  // 지점 재고량 저장 — 한 지점만 병합 업데이트
  const setStock = async (beanKey: string, bean: string, storeId: StoreId, pct: number) => {
    setStockPicker(null);
    const res = await fetch('/api/garden-beans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, bean, stockByStore: { [storeId]: pct } }),
    }).catch(() => null);
    if (!res?.ok) {
      toast('재고량 저장에 실패했어요. 다시 시도해 주세요.', 'error');
      return;
    }
    refresh();
  };

  // 보관/해제 — 낙관적 반영, 실패 시 되돌림. 레시피·이력은 그대로 두고 레시피 탭에서만 뺀다
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
      toast(archived ? '보관에 실패했어요. 다시 시도해 주세요.' : '보관 해제에 실패했어요. 다시 시도해 주세요.', 'error');
    }
  };

  const saveDraft = async () => {
    if (!draft || saving) return;
    setSaving(true);
    const num = (s: string) => {
      const n = Number(s);
      return s && Number.isFinite(n) && n > 0 ? n : null;
    };
    const waterG = draft.pours.reduce((a, s) => a + s.water, 0);
    const saveRes = await fetch('/api/garden-recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beanKey: draft.beanKey,
        brewType: draft.brewType,
        store: draft.store,
        bean: draft.bean,
        doseG: num(draft.doseG),
        waterG: waterG > 0 ? waterG : null,
        pours: draft.pours,
        tempC: num(draft.tempC),
        grind: '',
        grindMesh: num(draft.grindMesh),
        totalTime: draft.totalTime,
        notes: draft.notes.trim(),
        presetId: draft.presetId || null,
      }),
    }).catch(() => null);
    // 저장 실패 시 편집창을 닫지 않는다 — 입력값 유실 방지
    if (!saveRes?.ok) {
      toast('레시피 저장에 실패했어요. 다시 시도해 주세요.', 'error');
      setSaving(false);
      return;
    }
    // 테이스팅 노트는 원두 공통 — 값이 바뀐 경우에만 별도 업서트
    if (draft.tasting.trim() !== (tastingByBean.get(draft.beanKey) ?? '')) {
      const tRes = await fetch('/api/garden-beans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beanKey: draft.beanKey, bean: draft.bean, tasting: draft.tasting }),
      }).catch(() => null);
      if (!tRes?.ok) toast('레시피는 저장됐지만 테이스팅 노트 저장에 실패했어요.', 'error');
    }
    await refresh();
    // 미설정 원두에서 시작한 경우 ICE 저장 후 같은 원두의 HOT 편집으로 자동 전환
    if (draft.brewType === 'ice' && chainHotFor === draft.beanKey) {
      setChainHotFor(null);
      setDraft({ ...defaultDraft(draft.beanKey, draft.bean, 'hot', draft.store), tasting: draft.tasting });
      setSaving(false);
      toast('ICE 레시피 저장 완료 — 이어서 HOT 레시피를 설정하세요.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setDraft(null);
    setSaving(false);
    toast('레시피를 저장했어요.');
  };

  // 낙관적 삭제 — 화면에서 먼저 빼고, 서버 실패 시 되돌린다 (서버 왕복 + 전체 재조회로 ~3초 걸리던 대기 제거)
  const deleteRecipe = async (beanKey: string, brewType: BrewType) => {
    const prev = recipes;
    setRecipes((rs) => rs.filter((r) => !sameRecipeSlot(r, beanKey, brewType, store)));
    const res = await fetch('/api/garden-recipes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, brewType, store }),
    }).catch(() => null);
    if (!res?.ok) {
      setRecipes(prev);
      toast('레시피 삭제에 실패했어요. 다시 시도해 주세요.', 'error');
    }
  };

  const setD = (key: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [key]: v } : d));

  // 매장 기준 레시피로 초기화 (현재 타입 기준)
  const resetToHouse = () =>
    setDraft((d) => (d ? { ...defaultDraft(d.beanKey, d.bean, d.brewType, d.store), tasting: d.tasting } : d));

  // 분쇄도 ±0.1 — 미설정이면 타입별 매장 기준값에서 시작
  const adjMesh = (delta: number) =>
    setDraft((d) => {
      if (!d) return d;
      const cur = Number(d.grindMesh);
      const base = d.grindMesh && Number.isFinite(cur) ? cur : d.brewType === 'ice' ? 6.5 : 7;
      const next = Math.min(MESH_MAX, Math.max(MESH_MIN, Math.round((base + (d.grindMesh ? delta : 0)) * 10) / 10));
      return { ...d, grindMesh: meshFmt(next) };
    });

  // ---- 푸어링 단계 조작 ----
  const setPour = (i: number, water: number) =>
    setDraft((d) => {
      if (!d) return d;
      const pours = d.pours.map((s, j) => (j === i ? { ...s, water } : s));
      return { ...d, pours };
    });
  const addPour = () =>
    setDraft((d) => {
      if (!d) return d;
      const label = d.pours.length === 0 ? '뜸' : `${d.pours.length}차`;
      return { ...d, pours: [...d.pours, { water: 40, label }] };
    });
  const removePour = (i: number) =>
    setDraft((d) => (d ? { ...d, pours: d.pours.filter((_, j) => j !== i) } : d));

  const draftWater = draft ? draft.pours.reduce((a, s) => a + s.water, 0) : 0;

  // 원두 카드 한 장
  const renderBeanCard = (g: BeanGroup) => {
    const latest = latestByBean.get(g.beanKey);
    const regAt = beanRegisteredAt([g.ice, g.hot]);
    return (
      <div key={g.beanKey} className="rounded-md bg-muted/40" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* 원두명 헤더 — muted 배경 밴드 + 테이스팅 노트 색 그라데이션(카운터컬처 플레이버 휠 차용) */}
        <div
          className="bg-muted"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '10px 16px',
            backgroundImage: flavorGradient(tastingByBean.get(g.beanKey) ?? '') ?? undefined,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span className="text-title font-medium text-foreground" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.bean}
              </span>
              {/* 등록 시점부터 경과일 — 등록 당일 D+0, D+25부터 주황·D+31부터 빨강 */}
              {regAt && (() => {
                const n = daysSince(regAt);
                const level = dPlusLevel(n);
                const levelCls =
                  level === 'bad' ? 'text-destructive font-medium'
                  : level === 'warn' ? 'text-amber-600 dark:text-amber-500 font-medium'
                  : 'text-muted-foreground';
                return (
                  <span className={`tabular text-caption ${levelCls}`} style={{ flexShrink: 0 }} title={`등록 ${fmtDate(regAt)}`}>
                    D+{n}
                  </span>
                );
              })()}
              {/* 보관 — 소진된 원두를 지우지 않고 보관함으로 */}
              {(() => {
                const archived = isArchived(g.beanKey);
                return (
                  <button
                    onClick={() => setArchived(g.beanKey, g.bean, !archived)}
                    className="text-caption text-muted-foreground hover:text-foreground"
                    style={{ ...ghostBtn, flexShrink: 0 }}
                    title={archived ? '레시피 탭으로 되돌리기' : '레시피 탭에서 빼고 필터 커피 아카이브로 (레시피·이력 유지)'}
                  >
                    {archived ? '보관 해제' : '보관'}
                  </button>
                );
              })()}
            </span>
            {SHOW_STOCK_CHIPS && (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
              {/* 지점별 재고량 칩 — 누르면 100~0% 선택. 20% 이하 주의색(amber, §1 상태색 토큰) */}
              {STORES.map((s) => {
                const pct = stockOfBean(g.beanKey, s.id);
                const low = pct <= 20;
                if (stockPicker?.beanKey === g.beanKey && stockPicker.store === s.id) {
                  return (
                    <span key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span className="text-caption text-muted-foreground">{s.short}</span>
                      {STOCK_LEVELS.map((lv) => (
                        <button
                          key={lv}
                          onClick={() => setStock(g.beanKey, g.bean, s.id, lv)}
                          className={`rounded-sm border text-caption tabular ${
                            lv === pct
                              ? 'border-foreground text-foreground'
                              : lv <= 20
                              ? 'border-amber-500/40 text-amber-600 dark:text-amber-500'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                          style={{ ...ghostBtn, padding: '1px 5px' }}
                          title={`${s.label} 재고 ${lv}%`}
                        >
                          {lv}%
                        </button>
                      ))}
                      <button
                        onClick={() => setStockPicker(null)}
                        className="text-muted-foreground hover:text-foreground"
                        style={{ ...ghostBtn, fontSize: 13 }}
                        title="취소"
                      >
                        ×
                      </button>
                    </span>
                  );
                }
                return (
                  <button
                    key={s.id}
                    onClick={() => setStockPicker({ beanKey: g.beanKey, store: s.id })}
                    className={`rounded-sm border text-caption tabular ${
                      low ? 'border-amber-500/40 text-amber-600 dark:text-amber-500' : 'border-border text-foreground hover:bg-accent'
                    }`}
                    style={{ ...ghostBtn, padding: '1px 8px' }}
                    title={`${s.label} 재고량 변경`}
                  >
                    {s.short} {pct}%
                  </button>
                );
              })}
            </span>
            )}
          </div>
          {/* 테이스팅 노트(좌) + 판매가/재료비율(우) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {tastingEdit?.beanKey === g.beanKey ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={tastingEdit.value}
                    onChange={(e) => setTastingEdit((t) => (t ? { ...t, value: e.target.value } : t))}
                    onKeyDown={(e) => e.key === 'Enter' && saveTasting()}
                    placeholder="예: 자두 · 홍차 · 긴 단맛"
                    className="ta-input w-full"
                    style={{ height: 30, fontSize: 13 }}
                    autoFocus
                  />
                  <button onClick={saveTasting} disabled={tastingSaving} className="ta-btn" style={{ height: 30, paddingLeft: 10, paddingRight: 10, fontSize: 11, flexShrink: 0 }}>
                    {tastingSaving ? '…' : '저장'}
                  </button>
                  <button
                    onClick={() => setTastingEdit(null)}
                    className="text-muted-foreground hover:text-foreground"
                    style={{ ...ghostBtn, fontSize: 13, flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setTastingEdit({ beanKey: g.beanKey, bean: g.bean, value: tastingByBean.get(g.beanKey) ?? '' })}
                  className={`text-caption ${tastingByBean.get(g.beanKey) ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/60 hover:text-foreground'}`}
                  style={{ ...ghostBtn, textAlign: 'left' }}
                  title="테이스팅 노트 편집"
                >
                  {tastingByBean.get(g.beanKey) || '+ 테이스팅 노트'}
                </button>
              )}
            </div>
            {latest?.chosenPrice != null && latest.chosenPrice > 0 && (
              // 책정 판매가 / 재료비율(잔당 재료비 ÷ 판매가)
              <span className="tabular text-body text-muted-foreground" style={{ flexShrink: 0 }}>
                {won(latest.chosenPrice)} / {Math.round((latest.costPerCup / latest.chosenPrice) * 100)}%
              </span>
            )}
          </div>
          {/* 되돌리기 — 원두카드 담당자가 이 레시피를 되돌렸으면 배지로, 이 레시피의 판매가가
              잘못됐으면 판매가 담당자에게 되돌리기 요청 */}
          {latest && (latest.recipeReview || latest.chosenPrice != null) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {latest.recipeReview && (
                <p className="text-caption" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>
                  ⚠ 원두카드 담당자가 레시피 재검토를 요청했어요 · {fmtDate(latest.recipeReview.at)}
                  {latest.recipeReview.note ? ` · ${latest.recipeReview.note}` : ''}
                </p>
              )}
              {latest.chosenPrice != null &&
                (latest.priceReview ? (
                  <p className="text-caption text-muted-foreground" style={{ margin: 0 }}>
                    판매가 재검토 요청됨 · {fmtDate(latest.priceReview.at)}
                    {latest.priceReview.note ? ` · ${latest.priceReview.note}` : ''}
                  </p>
                ) : priceReviewOpenFor === g.beanKey ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      value={priceReviewNote}
                      onChange={(e) => setPriceReviewNote(e.target.value)}
                      placeholder="사유 (선택)"
                      className="ta-input"
                      style={{ flex: '1 1 160px', minWidth: 0, height: 28, fontSize: 12 }}
                    />
                    <button
                      onClick={() => requestPriceReview(latest.id)}
                      disabled={priceReviewSending}
                      className="ta-btn-primary"
                      style={{ height: 28, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}
                    >
                      {priceReviewSending ? '…' : '요청'}
                    </button>
                    <button
                      onClick={() => setPriceReviewOpenFor(null)}
                      className="text-muted-foreground hover:text-foreground"
                      style={{ ...ghostBtn, fontSize: 12 }}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setPriceReviewOpenFor(g.beanKey);
                      setPriceReviewNote('');
                    }}
                    className="text-caption text-muted-foreground hover:text-foreground"
                    style={{ ...ghostBtn, textAlign: 'left' }}
                  >
                    판매가 재검토 요청 (되돌리기)
                  </button>
                ))}
            </div>
          )}
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {BREW_TYPES.map((bt, idx) => {
            const r = g[bt];
            // 이 레시피 도징량 기준 잔당 재료비 (최신 발주가의 g당 원가 × 도징)
            const matCost =
              r && r.doseG != null && latest
                ? costPerCup(latest.purchasePrice, { ...latest.settings, doseG: r.doseG })
                : null;
            return (
              <div key={bt} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: idx > 0 ? '1px solid hsl(var(--border))' : 'none', paddingTop: idx > 0 ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <BrewBadge bt={bt} />
                    {r && ratioOf(r.doseG, r.waterG) && (
                      <span className="tabular text-body text-foreground">{ratioOf(r.doseG, r.waterG)}</span>
                    )}
                  </span>
                  {r ? (
                    <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <button
                        onClick={() => setTimerFor({ bean: g.bean, brewType: bt, recipe: r })}
                        className="text-caption text-muted-foreground hover:text-foreground"
                        style={ghostBtn}
                        title="추출 타이머 열기"
                      >
                        ▶ 타이머
                      </button>
                      <button
                        onClick={() => openEditor(g.beanKey, g.bean, bt)}
                        className="text-caption text-muted-foreground hover:text-foreground"
                        style={ghostBtn}
                      >
                        수정
                      </button>
                      {/* 양재천 레시피를 대신 보여주는 중이면 삭제 숨김 — 판교 화면에서 양재천 레시피가 지워지지 않게 */}
                      {!isFallback(r) && (
                        <button
                          onClick={() => deleteRecipe(g.beanKey, bt)}
                          className="text-caption text-muted-foreground hover:text-foreground"
                          style={ghostBtn}
                        >
                          삭제
                        </button>
                      )}
                    </span>
                  ) : (
                    <button
                      onClick={() => openEditor(g.beanKey, g.bean, bt)}
                      className="ta-btn"
                      style={{ height: 26, paddingLeft: 10, paddingRight: 10, fontSize: 11, flexShrink: 0 }}
                    >
                      {btLabel(bt)} 레시피 설정
                    </button>
                  )}
                </div>

                {r && isFallback(r) && (
                  <p className="text-caption text-muted-foreground" style={{ margin: 0 }}>
                    판교 레시피가 아직 없어 양재천 레시피를 보여줘요 — 「수정」하면 판교 레시피가 따로 생겨요
                  </p>
                )}

                {r && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <SpecRow label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
                      <SpecRow label="총 물량" value={r.waterG != null ? `${r.waterG}g` : null} />
                      <SpecRow label="물 온도" value={r.tempC != null ? `${r.tempC}°C` : null} />
                      {r.grindMesh != null ? (
                        isFallback(r) ? (
                          // 판교 화면 · 판교 레시피 없음 — 양재천 값의 판교 환산 + 지점 수동 보정
                          <PangyoMeshRow recipe={r} autoText={pangyoMeshText(r.grindMesh)} onSaved={refresh} />
                        ) : (
                          <SpecRow label={`분쇄도 · ${store === 'pangyo' ? '판교' : '양재천'} EK43`} value={meshFmt(r.grindMesh)} />
                        )
                      ) : (
                        <SpecRow label="분쇄도" value={r.grind || null} />
                      )}
                      <SpecRow label="추출 시간(최대)" value={r.totalTime || null} />
                      <SpecRow
                        label="재료비"
                        value={
                          matCost != null
                            ? `${won(matCost)}${
                                latest?.chosenPrice != null && latest.chosenPrice > 0
                                  ? ` / ${Math.round((matCost / latest.chosenPrice) * 100)}%`
                                  : ''
                              }`
                            : null
                        }
                      />
                    </div>

                    {r.pours && r.pours.length > 0 && (
                      <div className="rounded-md bg-muted/40" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                      <p className="text-caption text-muted-foreground" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                        {r.notes}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="tabular text-caption text-muted-foreground">
                        {fmtDate(r.updatedAt)}
                        {r.updatedBy && ` · ${r.updatedBy.split('@')[0]}`}
                      </span>
                      {(r.history?.length ?? 0) > 0 && (
                        <button
                          onClick={() => toggleHistory(`${g.beanKey}:${bt}`)}
                          className="tabular text-caption text-muted-foreground hover:text-foreground"
                          style={{ ...ghostBtn, flexShrink: 0 }}
                        >
                          이력 {r.history!.length} {openHistory.has(`${g.beanKey}:${bt}`) ? '▴' : '▾'}
                        </button>
                      )}
                    </div>

                    {/* 이전 버전 목록 — 복원은 편집 폼에 불러온 뒤 저장해야 반영 */}
                    {openHistory.has(`${g.beanKey}:${bt}`) && (r.history?.length ?? 0) > 0 && (
                      <div className="rounded-md bg-muted/40" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* 각 줄 = 그 버전으로 저장된 시점 + 바로 다음 버전에서 바뀐 점(최신 줄은 현재 레시피와 비교) */}
                        {r.history!.map((s, i) => {
                          const next = i === 0 ? r : r.history![i - 1];
                          const changes = recipeChanges(s, next);
                          return (
                          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, minWidth: 0 }}>
                            <span className="tabular text-muted-foreground" style={{ flexShrink: 0 }}>{fmtDate(s.updatedAt)}</span>
                            <span className="tabular text-foreground" style={{ minWidth: 0 }}>
                              {[
                                s.doseG != null ? `${s.doseG}g` : null,
                                s.waterG != null ? `${s.waterG}g` : null,
                                s.tempC != null ? `${s.tempC}°C` : null,
                                s.grindMesh != null ? `mesh ${meshFmt(s.grindMesh)}` : null,
                                s.totalTime || null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                              {changes.length > 0 && (
                                <span className="text-muted-foreground" style={{ display: 'block' }}>
                                  → {fmtDate(next.updatedAt)}{next.updatedBy ? ` ${next.updatedBy.split('@')[0]}` : ''} 수정: {changes.join(' · ')}
                                </span>
                              )}
                            </span>
                            <span style={{ flex: 1 }} />
                            <button
                              onClick={() => restoreSnapshot(g.beanKey, g.bean, bt, s)}
                              className="text-caption text-muted-foreground hover:text-foreground"
                              style={{ ...ghostBtn, flexShrink: 0 }}
                              title="이 버전을 편집 폼에 불러오기 (저장해야 복원됨)"
                            >
                              복원
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 레시피 미설정 원두 카드 — 대시보드(unset)와 필터 레시피 탭 양쪽에서 노출.
  // 발주 직후 레시피 페이지에서도 바로 설정을 유도하기 위함.
  const unsetCard = unsetBeans.length > 0 && (
    <div className="ta-panel min-w-0">
      <p className="mb-3 text-body font-medium">레시피 미설정 원두 <span className="font-normal text-muted-foreground">새 발주</span></p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {unsetBeans.map((rec) => (
          <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="text-body text-foreground" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rec.bean}
            </span>
            <span className="tabular text-caption text-muted-foreground" style={{ flexShrink: 0 }}>
              {fmtDate(rec.createdAt)} 발주
              {rec.chosenPrice != null && ` · ${won(rec.chosenPrice)}`}
            </span>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => startUnsetSetup(normalize(rec.bean), rec.bean)}
              className="ta-btn"
              style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 13, flexShrink: 0 }}
            >
              레시피 설정 (ICE→HOT)
            </button>
            <button
              onClick={() => deleteUnsetBean(rec)}
              disabled={deletingBean === normalize(rec.bean)}
              title="발주 기록 삭제"
              className="text-muted-foreground hover:text-foreground"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: 6, margin: -6 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // 판매가 미책정 카드 — 발주는 됐는데 판매가가 아직 없는 기록. 책정은 권한이 분리된
  // '판매가 설정' 탭(saleprice) 담당이라 여기서는 건수·원두명만 보여주고 링크로 유도한다.
  const unpriced = purchases.filter((r) => r.chosenPrice == null && !r.priceDismissed); // X로 숨긴 건 제외
  const unpricedCard = unpriced.length > 0 && (
    <div className="ta-panel min-w-0">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p className="text-body font-medium" style={{ margin: 0 }}>판매가 미책정 <span className="font-normal text-muted-foreground tabular">{unpriced.length}건</span></p>
        <span
          className="text-caption text-muted-foreground"
          style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {unpriced.slice(0, 3).map((r) => r.bean).join(' · ')}
          {unpriced.length > 3 && ' 외'}
        </span>
        <span style={{ flex: 1 }} />
        <Link
          href="/garden/saleprice"
          className="ta-btn"
          style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 13, flexShrink: 0, textDecoration: 'none' }}
        >
          판매가 설정 열기 ›
        </Link>
      </div>
    </div>
  );

  return (
    // unset(대시보드) 모드는 아래 캘리브레이션과 같은 풀폭, recipes 모드는 기존 720 유지
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 40, minWidth: 0 }}>
      {/* 레시피 편집 폼 — 설정/수정 클릭 시 상단에 노출 */}
      {draft && (
        <div className="min-w-0">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p className="ta-label" style={{ marginBottom: 0 }}>
              {draft.bean} — {STORES.find((x) => x.id === draft.store)?.short} {btLabel(draft.brewType)} 레시피
            </p>
            <button
              onClick={resetToHouse}
              className="text-caption text-muted-foreground hover:text-foreground"
              style={{ ...ghostBtn, flexShrink: 0 }}
              title={`${btLabel(draft.brewType)} 기본값(최근 레시피 20개에서 가장 많이 쓴 값)으로 되돌리기`}
            >
              기본값으로 초기화
            </button>
          </div>

          {/* ICE / HOT 전환 — 같은 원두의 다른 타입 레시피로 이동 */}
          <div className="inline-flex gap-1 ta-seg" style={{ margin: '24px 0' }}>
            {BREW_TYPES.map((bt) => {
              const on = draft.brewType === bt;
              return (
                <button
                  key={bt}
                  onClick={() => !on && openEditor(draft.beanKey, draft.bean, bt)}
                  className={`ta-seg-item px-3 py-1 text-body transition-colors ${
                    on ? 'ta-seg-on' : ''
                  }`}
                >
                  {btLabel(bt)}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 12px' }}>
            <SelField
              label="도징량(g)"
              value={draft.doseG}
              onChange={(v) => setD('doseG', v)}
              options={withCur(DOSE_OPTS, Number(draft.doseG) || null).map(String)}
              unit="g"
            />
            <SelField
              label="물 온도(°C)"
              value={draft.tempC}
              onChange={(v) => setD('tempC', v)}
              options={withCur(TEMP_OPTS, Number(draft.tempC) || null).map(String)}
              unit="°C"
            />
            <SelField
              label="추출 시간(최대)"
              value={draft.totalTime}
              onChange={(v) => setD('totalTime', v)}
              options={withCurStr(TIME_OPTS, draft.totalTime)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="text-caption text-muted-foreground">분쇄도 (Mesh · EK43 {draft.store === 'pangyo' ? '판교' : '양재천'})</span>
              <div className="rounded-md border border-input" style={{ display: 'flex', alignItems: 'center', height: 36 }}>
                <button onClick={() => adjMesh(-0.1)} className="text-muted-foreground hover:text-foreground" style={meshBtn} title="0.1 곱게">
                  ‹
                </button>
                <span className="tabular text-body text-foreground" style={{ flex: 1, textAlign: 'center' }}>
                  {draft.grindMesh || '—'}
                </span>
                <button onClick={() => adjMesh(0.1)} className="text-muted-foreground hover:text-foreground" style={meshBtn} title="0.1 굵게">
                  ›
                </button>
              </div>
              {draft.store === 'yangjae' && draft.grindMesh && pangyoMeshText(Number(draft.grindMesh)) === '재측정 필요' && (
                <p className="text-body text-muted-foreground" style={{ margin: '4px 0 0' }}>
                  판교점 EK43 메쉬 — 재얼라인 이후 재측정 필요 (6/8/10 프로토콜 측정을 올려주세요)
                </p>
              )}
              {draft.store === 'yangjae' && draft.grindMesh && pangyoMeshText(Number(draft.grindMesh)) != null && pangyoMeshText(Number(draft.grindMesh)) !== '재측정 필요' && (
                <span className="tabular text-caption text-muted-foreground">
                  판교점 EK43 메쉬 ≈ {pangyoMeshText(Number(draft.grindMesh))}
                </span>
              )}
            </div>
          </div>

          {/* 푸어링 단계 — 물 투입량 30~60g, 5g 단위 드랍다운 */}
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="text-caption text-muted-foreground">푸어링 (단계별 물 투입량)</span>
            {draft.pours.map((p, i) => {
              const cum = draft.pours.slice(0, i + 1).reduce((a, s) => a + s.water, 0);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="text-body text-foreground" style={{ width: 76, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.at ? `${p.at} ` : ''}
                    {pourName(p, i)}
                  </span>
                  <select
                    value={String(p.water)}
                    onChange={(e) => setPour(i, Number(e.target.value))}
                    className="ta-input tabular"
                    style={{ width: 96, cursor: 'pointer' }}
                  >
                    {withCur(POUR_OPTS, p.water).map((w) => (
                      <option key={w} value={w}>
                        {w}g
                      </option>
                    ))}
                  </select>
                  <span className="tabular text-caption text-muted-foreground" style={{ flexShrink: 0 }}>
                    누적 {cum}g
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={() => removePour(i)}
                    className="text-muted-foreground hover:text-foreground"
                    style={{ ...ghostBtn, fontSize: 13, flexShrink: 0 }}
                    title="단계 삭제"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={addPour} className="ta-btn" style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 13 }}>
                + 푸어링 추가
              </button>
              {draftWater > 0 && (
                <span className="tabular text-caption text-muted-foreground">
                  총 물량 {draftWater}g{ratioOf(Number(draft.doseG) || null, draftWater) ? ` · 비율 ${ratioOf(Number(draft.doseG) || null, draftWater)}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* 테이스팅 노트 — 발주 때 입력한 노트가 그대로 채워져 있고, 칩으로 더하거나 지운다 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
            <span className="text-caption text-muted-foreground">테이스팅 노트 (ICE/HOT 공통 · 발주 때 노트에서 시작)</span>
            <TastingNoteEditor value={draft.tasting} onChange={(v) => setD('tasting', v)} />
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 24 }}>
            <span className="text-caption text-muted-foreground">메모</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setD('notes', e.target.value)}
              placeholder={draft.notesHint || '메모를 남기면 카드에 표시돼요'}
              className="ta-input w-full"
              style={{ height: 'auto', minHeight: 96, paddingTop: 8, paddingBottom: 8, resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
            <button onClick={saveDraft} disabled={saving} className="ta-btn-primary" style={{ flex: 1 }}>
              {saving ? '저장 중…' : `${btLabel(draft.brewType)} 레시피 저장`}
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setChainHotFor(null);
              }}
              className="ta-btn"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 필터 레시피 — 모든 레시피 원두를 국가별 그룹으로, 카드 전체 기능(수정·타이머·이력·재고칩) */}
      {section === 'recipes' && (
        <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {loading && <p className="text-body text-muted-foreground">불러오는 중…</p>}
          {/* 지점 — 레시피는 지점별(2026-10-30). 기기에 기억돼 레시피 보드와 공유 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SegmentControl
              items={[...STORES].reverse().map((s) => ({ id: s.id, label: s.label }))}
              value={store}
              onSelect={pickStore}
              ariaLabel="레시피 지점"
            />
            <span className="text-caption text-muted-foreground">
              {store === 'pangyo' ? '판교 레시피 — 없는 원두는 양재천 레시피를 보여줘요' : '양재천 레시피'}
            </span>
          </div>

          {/* 태블릿 레시피 보드 — 3장씩 좌우 스와이프로 넘겨 보는 매장용 화면 */}
          {!loading && activeGroups.length > 0 && (
            <Link href="/garden/recipes/board" className="text-body text-muted-foreground underline hover:text-foreground" style={{ alignSelf: 'flex-start' }}>
              태블릿 레시피 보드로 보기 →
            </Link>
          )}
          {/* 새 발주 원두 — 레시피 미설정이면 상단에서 바로 설정 유도 */}
          {!loading && unsetCard}
          {!loading && activeGroups.length === 0 && unsetBeans.length === 0 && (
            <p className="text-body text-muted-foreground">
              아직 레시피가 설정된 원두가 없어요. 가격 세팅에서 원두를 발주하면 여기에서 레시피를 만들 수
              있어요.
            </p>
          )}

          {/* 국가 필터 칩 */}
          {countrySections.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['전체', ...countrySections.map((s) => s.country)].map((c) => {
                const on = selectedCountry === c;
                return (
                  <button
                    key={c}
                    onClick={() => setSelectedCountry(c)}
                    className={`rounded-md border px-2.5 py-1 text-body transition-colors ${
                      on
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {c}
                    {c !== '전체' && (
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>
                        {countrySections.find((s) => s.country === c)?.groups.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {(selectedCountry === '전체'
            ? countrySections
            : countrySections.filter((s) => s.country === selectedCountry)
          ).map(({ country, groups }) => (
            <div key={country} className="min-w-0">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid hsl(var(--border))', paddingBottom: 6, marginBottom: 24 }}>
                <h3 className="text-title font-medium text-foreground" style={{ margin: 0 }}>{country}</h3>
                <span className="text-caption text-muted-foreground">{groups.length}종</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px 12px' }}>
                {groups.map(renderBeanCard)}
              </div>
            </div>
          ))}

          {/* 필터 커피 아카이브(구 보관함) — 보관·소진 처리한 원두 카드. 펼쳐서 보고 '보관 해제'로 되돌린다 */}
          {!loading && archivedGroups.length > 0 && (
            <div className="min-w-0">
              <button
                onClick={() => setArchiveOpen((o) => !o)}
                className="text-body text-muted-foreground hover:text-foreground"
                style={{ ...ghostBtn, marginBottom: archiveOpen ? 24 : 0 }}
              >
                필터 커피 아카이브 {archivedGroups.length} {archiveOpen ? '▴' : '▾'}
              </button>
              {/* 국가별 묶음 — 국가 가나다순·기타 맨 뒤 (위 국가 섹션과 같은 규칙) */}
              {archiveOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                  {Array.from(
                    archivedGroups.reduce((m, g) => m.set(countryOf(g.bean), [...(m.get(countryOf(g.bean)) ?? []), g]), new Map<string, BeanGroup[]>())
                  )
                    .sort(([a], [b]) => (a === ETC ? 1 : b === ETC ? -1 : a.localeCompare(b, 'ko')))
                    .map(([country, groups]) => (
                      <div key={country} className="min-w-0">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                          <h4 className="text-body font-medium text-foreground" style={{ margin: 0 }}>{country}</h4>
                          <span className="text-caption text-muted-foreground">{groups.length}종</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px 12px' }}>
                          {groups.map(renderBeanCard)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {!loading && activeGroups.length > 0 && (
            <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
              판교 분쇄도는 지점 캘리브레이션 실측 기반 메쉬 값입니다. <strong>*</strong>는 잠정 범위(메쉬 실측 전),
              &lsquo;재측정 필요&rsquo;는 재얼라인 이후 새 측정이 아직 없다는 뜻입니다 —{' '}
              <Link href="/garden/calibration/report" className="underline hover:text-foreground">
                리포트 보기
              </Link>
            </p>
          )}
        </div>
      )}

      {/* 레시피 미설정 원두 — 가격 세팅에서 저장한 원두 목록 (대시보드) */}
      {section === 'unset' && unsetBeans.length === 0 && !loading && (
        <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
          레시피 미설정 원두가 없어요. 레시피 카드는{' '}
          <Link href="/garden/recipes" className="underline hover:text-foreground">필터 레시피</Link>
          에서 관리합니다.
        </p>
      )}
      {/* 판매가 미책정 — 책정 담당자가 대시보드만 봐도 대기 건을 알 수 있게 */}
      {section === 'unset' && unpricedCard}
      {section === 'unset' && unsetCard}

      {/* 추출 타이머 오버레이 — 카드의 ▶ 타이머로 열기 */}
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

// ICE/HOT 배지 — 장식적 컬러 액센트 없이(§1) 텍스트로만 구분, 진한 단색 칩으로 강조
function BrewBadge({ bt }: { bt: BrewType }) {
  return (
    <span
      className="rounded-sm bg-foreground text-caption font-medium text-background"
      style={{ padding: '1px 6px', letterSpacing: '0.05em', flexShrink: 0 }}
    >
      {bt.toUpperCase()}
    </span>
  );
}

// 판교 EK43 분쇄도 행 — 산식 자동값 표시 + 지점 수동 보정(물 pH·미네랄 차이 대응) + 보정 이력.
// 수동값이 있으면 '(보정)' 표기, 자동값은 잠정이면 * 유지. 양재천 값 변경 시 서버가 자동값으로 복귀시킨다.
function PangyoMeshRow({
  recipe,
  autoText,
  onSaved,
}: {
  recipe: DripRecipe;
  autoText: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const manual = recipe.pangyoMesh != null;
  const history = recipe.pangyoMeshHistory ?? [];

  const save = async (mesh: number | null) => {
    if (saving) return;
    setSaving(true);
    const res = await fetch('/api/garden-recipes/pangyo-mesh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey: recipe.beanKey, brewType: recipe.brewType ?? 'ice', mesh }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      onSaved();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span className="text-muted-foreground">분쇄도 · 판교 EK43</span>
        {editing ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder={recipe.pangyoMesh != null ? meshFmt(recipe.pangyoMesh) : '8.3'}
              className="ta-input tabular"
              style={{ width: 64, height: 26, fontSize: 13 }}
              autoFocus
            />
            <button onClick={() => save(Number(value))} disabled={saving || value.trim() === ''} className="ta-btn-primary" style={{ height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 11 }}>
              저장
            </button>
            {manual && (
              <button onClick={() => save(null)} disabled={saving} className="ta-btn" style={{ height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 11 }} title="산식 자동값으로 복귀">
                자동으로
              </button>
            )}
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
              취소
            </button>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="tabular text-foreground">
              {manual ? `${meshFmt(recipe.pangyoMesh!)} (보정)` : autoText ?? '—'}
            </span>
            <button
              onClick={() => {
                setValue(recipe.pangyoMesh != null ? meshFmt(recipe.pangyoMesh) : '');
                setEditing(true);
              }}
              className="text-muted-foreground hover:text-foreground"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, textDecoration: 'underline', padding: 0 }}
              title="판교 물 성질에 맞춰 분쇄도 보정"
            >
              수정
            </button>
            {history.length > 0 && (
              <button
                onClick={() => setHistoryOpen((o) => !o)}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
                title="보정 이력"
              >
                이력 {history.length}{historyOpen ? '▴' : '▾'}
              </button>
            )}
          </span>
        )}
      </div>
      {historyOpen && history.length > 0 && (
        <div className="rounded-md bg-muted/40" style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {history.map((h, i) => (
            <div key={i} className="tabular text-caption text-muted-foreground" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.mesh != null ? `판교 ${h.mesh.toFixed(1)}` : '산식 자동값 복귀'}
                {h.baseMesh != null && h.mesh != null ? ` (양재천 ${h.baseMesh.toFixed(1)} 기준)` : ''}
                {h.reason ? ` — ${h.reason}` : ''}
              </span>
              <span style={{ flexShrink: 0 }}>
                {h.updatedAt.slice(2, 10).replace(/-/g, '.')}
                {h.updatedBy ? ` · ${h.updatedBy.split('@')[0]}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
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

// 드랍다운 필드 — '' 선택지는 미설정(—)
function SelField({
  label,
  value,
  onChange,
  options,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  unit?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span className="text-caption text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="ta-input w-full tabular" style={{ cursor: 'pointer' }}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
            {unit ?? ''}
          </option>
        ))}
      </select>
    </label>
  );
}
