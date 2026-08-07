'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BeanMeta, BrewType, DripRecipe, DripRecipeSnapshot, PourStep, PurchaseRecord, StoreId } from '@/lib/types';
import { STORES, STOCK_LEVELS, stockOf, beanRegisteredAt, daysSince, dPlusColor } from '@/lib/types';
import { costPerCup, normalize } from '@/lib/pricing';
import { applyPreset, presetById } from '@/lib/drip-presets';
import { flavorGradient } from '@/lib/flavor-colors';
import BrewTimer from '@/components/garden/BrewTimer';
import { toast } from '@/components/Toast';
import type { GrinderProfiles } from '@/lib/grinder-calibration';
import { pangyoDialText } from '@/lib/grinder-calibration';
import { latestAlignmentDate, type AlignmentEvent } from '@/lib/grinder-alignments';

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

const BREW_TYPES: BrewType[] = ['ice', 'hot'];
const btOf = (r: DripRecipe): BrewType => r.brewType ?? 'ice';
const btLabel = (bt: BrewType) => bt.toUpperCase();
const housePresetId = (bt: BrewType) => (bt === 'ice' ? 'house-ice' : 'house-hot');

// ---- 드랍다운 선택지 ----
const DOSE_OPTS = Array.from({ length: 9 }, (_, i) => 16 + i); // 도징량 16~24g (1g)
const TEMP_OPTS = [91, 92, 93, 94]; // 물 온도 °C
const POUR_OPTS = Array.from({ length: 7 }, (_, i) => 30 + i * 5); // 푸어링당 30~60g (5g)
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
  fontSize: 16,
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
const presetDraft = (beanKey: string, bean: string, brewType: BrewType): Draft => {
  const presetId = housePresetId(brewType);
  const p = presetById(presetId);
  const a = applyPreset(p!);
  return {
    beanKey,
    bean,
    brewType,
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

// 원두명에서 국가 추출 — 필터 레시피 화면의 국가별 그룹핑용 (구 GardenRecipes에서 이식)
const COUNTRIES = [
  '에티오피아', '케냐', '콜롬비아', '브라질', '과테말라', '온두라스', '파나마', '페루',
  '코스타리카', '엘살바도르', '니카라과', '볼리비아', '에콰도르', '르완다', '부룬디',
  '인도네시아', '예멘', '멕시코', '인도', '베트남', '탄자니아', '우간다', '파푸아뉴기니', '중국',
];
const ETC = '기타';
const countryOf = (bean: string) => {
  const b = normalize(bean);
  return COUNTRIES.find((c) => b.includes(normalize(c))) ?? ETC;
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

  // 레시피가 하나라도 있는 원두 — ICE/HOT 슬롯으로 묶고 최신 업데이트순
  const beanGroups = useMemo(() => {
    const m = new Map<string, BeanGroup>();
    for (const r of recipes) {
      const g = m.get(r.beanKey) ?? { beanKey: r.beanKey, bean: r.bean, ice: null, hot: null, latestUpdate: '' };
      g[btOf(r)] = r;
      if (r.updatedAt.localeCompare(g.latestUpdate) > 0) {
        g.latestUpdate = r.updatedAt;
        g.bean = r.bean;
      }
      m.set(r.beanKey, g);
    }
    return Array.from(m.values()).sort((a, b) => b.latestUpdate.localeCompare(a.latestUpdate));
  }, [recipes]);

  const tastingByBean = useMemo(
    () => new Map(beanMetas.map((b) => [b.beanKey, b.tasting])),
    [beanMetas]
  );
  // 지점별 재고량 — stockByStore 우선, 구버전 소진 기록은 0%/100%로 해석
  const metaByBean = useMemo(() => new Map(beanMetas.map((b) => [b.beanKey, b])), [beanMetas]);
  const stockOfBean = (beanKey: string, storeId: StoreId) => stockOf(metaByBean.get(beanKey), storeId);

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

  // 국가별 섹션 (recipes 모드) — 모든 레시피 원두(재고 유무 무관), 국가 가나다순 · '기타' 맨 뒤,
  // 국가 안에서는 beanGroups의 최신 업데이트순 유지
  const countrySections = useMemo(() => {
    const byCountry = new Map<string, BeanGroup[]>();
    for (const g of beanGroups) {
      const c = countryOf(g.bean);
      byCountry.set(c, [...(byCountry.get(c) ?? []), g]);
    }
    const list = Array.from(byCountry.entries()).map(([country, groups]) => ({ country, groups }));
    list.sort((a, b) =>
      a.country === ETC ? 1 : b.country === ETC ? -1 : a.country.localeCompare(b.country, 'ko')
    );
    return list;
  }, [beanGroups]);

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

  // 편집 열기 — 기존 레시피가 있으면 불러오고, 없으면 매장 기준 프리셋으로 시작
  const openEditor = (beanKey: string, bean: string, brewType: BrewType) => {
    // 다른 편집을 열면 이전 ICE→HOT 연결은 무효 — 남아 있으면 나중에 엉뚱한 HOT 편집이 이어진다
    setChainHotFor(null);
    const existing = recipes.find((r) => r.beanKey === beanKey && btOf(r) === brewType);
    const base = existing ? draftFromRecipe(existing) : presetDraft(beanKey, bean, brewType);
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
    setDraft({ ...base, tasting: tastingByBean.get(beanKey) ?? '' });
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
      setDraft({ ...presetDraft(draft.beanKey, draft.bean, 'hot'), tasting: draft.tasting });
      setSaving(false);
      toast('ICE 레시피 저장 완료 — 이어서 HOT 레시피를 설정하세요.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setDraft(null);
    setSaving(false);
    toast('레시피를 저장했어요.');
  };

  const deleteRecipe = async (beanKey: string, brewType: BrewType) => {
    const res = await fetch('/api/garden-recipes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, brewType }),
    }).catch(() => null);
    if (!res?.ok) {
      toast('레시피 삭제에 실패했어요. 다시 시도해 주세요.', 'error');
      return;
    }
    refresh();
  };

  const setD = (key: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [key]: v } : d));

  // 매장 기준 레시피로 초기화 (현재 타입 기준)
  const resetToHouse = () =>
    setDraft((d) => (d ? { ...presetDraft(d.beanKey, d.bean, d.brewType), tasting: d.tasting } : d));

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
      <div key={g.beanKey} className="rounded-md border border-border" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* 원두명 헤더 — muted 배경 밴드 + 테이스팅 노트 색 그라데이션(카운터컬처 플레이버 휠 차용) */}
        <div
          className="bg-muted"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '10px 16px',
            borderBottom: '1px solid hsl(var(--border))',
            backgroundImage: flavorGradient(tastingByBean.get(g.beanKey) ?? '') ?? undefined,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span className="text-[15px] text-foreground" style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.bean}
              </span>
              {/* 등록 시점부터 경과일 — 등록 당일 D+0, D+25부터 주황·D+31부터 빨강 */}
              {regAt && (() => {
                const n = daysSince(regAt);
                const warn = dPlusColor(n);
                return (
                  <span className="tabular text-[11px] text-muted-foreground" style={{ flexShrink: 0, ...(warn ? { color: warn, fontWeight: 500 } : {}) }} title={`등록 ${fmtDate(regAt)}`}>
                    D+{n}
                  </span>
                );
              })()}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
              {/* 지점별 재고량 칩 — 누르면 100~0% 선택. 20% 이하 빨간색 */}
              {STORES.map((s) => {
                const pct = stockOfBean(g.beanKey, s.id);
                const low = pct <= 20;
                if (stockPicker?.beanKey === g.beanKey && stockPicker.store === s.id) {
                  return (
                    <span key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span className="text-[11px] text-muted-foreground">{s.short}</span>
                      {STOCK_LEVELS.map((lv) => (
                        <button
                          key={lv}
                          onClick={() => setStock(g.beanKey, g.bean, s.id, lv)}
                          className={`rounded-sm border text-[11px] tabular ${
                            lv === pct ? 'border-foreground text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                          style={{ ...ghostBtn, padding: '1px 5px', ...(lv <= 20 ? { color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.4)' } : {}) }}
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
                    className={`rounded-sm border text-[11px] tabular ${low ? '' : 'border-border text-foreground hover:bg-accent'}`}
                    style={{ ...ghostBtn, padding: '1px 8px', ...(low ? { borderColor: 'rgba(220, 38, 38, 0.4)', color: '#dc2626' } : {}) }}
                    title={`${s.label} 재고량 변경`}
                  >
                    {s.short} {pct}%
                  </button>
                );
              })}
            </span>
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
                    style={{ height: 30, fontSize: 12.5 }}
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
                  className={`text-[11px] ${tastingByBean.get(g.beanKey) ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/60 hover:text-foreground'}`}
                  style={{ ...ghostBtn, textAlign: 'left' }}
                  title="테이스팅 노트 편집"
                >
                  {tastingByBean.get(g.beanKey) || '+ 테이스팅 노트'}
                </button>
              )}
            </div>
            {latest?.chosenPrice != null && latest.chosenPrice > 0 && (
              // 책정 판매가 / 재료비율(잔당 재료비 ÷ 판매가)
              <span className="tabular text-[13px] text-muted-foreground" style={{ flexShrink: 0 }}>
                {won(latest.chosenPrice)} / {Math.round((latest.costPerCup / latest.chosenPrice) * 100)}%
              </span>
            )}
          </div>
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
                      <span className="tabular text-[13px] text-foreground">{ratioOf(r.doseG, r.waterG)}</span>
                    )}
                  </span>
                  {r ? (
                    <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <button
                        onClick={() => setTimerFor({ bean: g.bean, brewType: bt, recipe: r })}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        style={ghostBtn}
                        title="추출 타이머 열기"
                      >
                        ▶ 타이머
                      </button>
                      <button
                        onClick={() => openEditor(g.beanKey, g.bean, bt)}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        style={ghostBtn}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => deleteRecipe(g.beanKey, bt)}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        style={ghostBtn}
                      >
                        삭제
                      </button>
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

                {r && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <SpecRow label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
                      <SpecRow label="총 물량" value={r.waterG != null ? `${r.waterG}g` : null} />
                      <SpecRow label="물 온도" value={r.tempC != null ? `${r.tempC}°C` : null} />
                      {r.grindMesh != null ? (
                        <>
                          <SpecRow label="분쇄도 · 양재천 EK43" value={meshFmt(r.grindMesh)} />
                          <PangyoMeshRow recipe={r} autoText={pangyoMeshText(r.grindMesh)} onSaved={refresh} />
                        </>
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

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="tabular text-[11px] text-muted-foreground">
                        {fmtDate(r.updatedAt)}
                        {r.updatedBy && ` · ${r.updatedBy.split('@')[0]}`}
                      </span>
                      {(r.history?.length ?? 0) > 0 && (
                        <button
                          onClick={() => toggleHistory(`${g.beanKey}:${bt}`)}
                          className="tabular text-[11px] text-muted-foreground hover:text-foreground"
                          style={{ ...ghostBtn, flexShrink: 0 }}
                        >
                          이력 {r.history!.length} {openHistory.has(`${g.beanKey}:${bt}`) ? '▴' : '▾'}
                        </button>
                      )}
                    </div>

                    {/* 이전 버전 목록 — 복원은 편집 폼에 불러온 뒤 저장해야 반영 */}
                    {openHistory.has(`${g.beanKey}:${bt}`) && (r.history?.length ?? 0) > 0 && (
                      <div className="rounded-md border border-border" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {r.history!.map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, minWidth: 0 }}>
                            <span className="tabular text-muted-foreground" style={{ flexShrink: 0 }}>{fmtDate(s.updatedAt)}</span>
                            <span className="tabular text-foreground" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[
                                s.doseG != null ? `${s.doseG}g` : null,
                                s.waterG != null ? `${s.waterG}g` : null,
                                s.tempC != null ? `${s.tempC}°C` : null,
                                s.grindMesh != null ? `mesh ${meshFmt(s.grindMesh)}` : null,
                                s.totalTime || null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            <span style={{ flex: 1 }} />
                            <button
                              onClick={() => restoreSnapshot(g.beanKey, g.bean, bt, s)}
                              className="text-[11px] text-muted-foreground hover:text-foreground"
                              style={{ ...ghostBtn, flexShrink: 0 }}
                              title="이 버전을 편집 폼에 불러오기 (저장해야 복원됨)"
                            >
                              복원
                            </button>
                          </div>
                        ))}
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
    <div className="ta-card bg-background min-w-0">
      <p className="ta-label">레시피 미설정 원두 — 새 발주</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {unsetBeans.map((rec) => (
          <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="text-[13px] text-foreground" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rec.bean}
            </span>
            <span className="tabular text-[11px] text-muted-foreground" style={{ flexShrink: 0 }}>
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    // unset(대시보드) 모드는 아래 캘리브레이션과 같은 풀폭, recipes 모드는 기존 720 유지
    <div style={{ width: '100%', maxWidth: section === 'unset' ? undefined : 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      {/* 레시피 편집 폼 — 설정/수정 클릭 시 상단에 노출 */}
      {draft && (
        <div className="ta-card bg-background min-w-0">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p className="ta-label" style={{ marginBottom: 0 }}>
              {draft.bean} — {btLabel(draft.brewType)} 레시피
            </p>
            <button
              onClick={resetToHouse}
              className="text-[11px] text-muted-foreground hover:text-foreground"
              style={{ ...ghostBtn, flexShrink: 0 }}
              title={`${btLabel(draft.brewType)} 매장 기준 레시피로 되돌리기`}
            >
              매장 기준으로 초기화
            </button>
          </div>

          {/* ICE / HOT 전환 — 같은 원두의 다른 타입 레시피로 이동 */}
          <div className="inline-flex gap-1 rounded-md border border-border p-1" style={{ margin: '12px 0' }}>
            {BREW_TYPES.map((bt) => {
              const on = draft.brewType === bt;
              return (
                <button
                  key={bt}
                  onClick={() => !on && openEditor(draft.beanKey, draft.bean, bt)}
                  className={`rounded-sm px-3 py-1 text-[13px] transition-colors ${
                    on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {btLabel(bt)}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              <span className="text-[11px] text-muted-foreground">분쇄도 (Mesh · EK43 양재천)</span>
              <div className="rounded-md border border-input" style={{ display: 'flex', alignItems: 'center', height: 36 }}>
                <button onClick={() => adjMesh(-0.1)} className="text-muted-foreground hover:text-foreground" style={meshBtn} title="0.1 곱게">
                  ‹
                </button>
                <span className="tabular text-[13px] text-foreground" style={{ flex: 1, textAlign: 'center' }}>
                  {draft.grindMesh || '—'}
                </span>
                <button onClick={() => adjMesh(0.1)} className="text-muted-foreground hover:text-foreground" style={meshBtn} title="0.1 굵게">
                  ›
                </button>
              </div>
              {draft.grindMesh && pangyoMeshText(Number(draft.grindMesh)) === '재측정 필요' && (
                <p className="text-[12px] text-muted-foreground" style={{ margin: '4px 0 0' }}>
                  판교점 EK43 환산 — 재얼라인 이후 재측정 필요 (6/8/10 프로토콜 측정을 올려주세요)
                </p>
              )}
              {draft.grindMesh && pangyoMeshText(Number(draft.grindMesh)) != null && pangyoMeshText(Number(draft.grindMesh)) !== '재측정 필요' && (
                <span className="tabular text-[11px] text-muted-foreground">
                  판교점 EK43 환산 ≈ {pangyoMeshText(Number(draft.grindMesh))}
                </span>
              )}
            </div>
          </div>

          {/* 푸어링 단계 — 물 투입량 30~60g, 5g 단위 드랍다운 */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="text-[11px] text-muted-foreground">푸어링 (단계별 물 투입량)</span>
            {draft.pours.map((p, i) => {
              const cum = draft.pours.slice(0, i + 1).reduce((a, s) => a + s.water, 0);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="text-[13px] text-foreground" style={{ width: 76, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  <span className="tabular text-[11px] text-muted-foreground" style={{ flexShrink: 0 }}>
                    누적 {cum}g
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={() => removePour(i)}
                    className="text-muted-foreground hover:text-foreground"
                    style={{ ...ghostBtn, fontSize: 14, flexShrink: 0 }}
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
                <span className="tabular text-[11px] text-muted-foreground">
                  총 물량 {draftWater}g{ratioOf(Number(draft.doseG) || null, draftWater) ? ` · 비율 ${ratioOf(Number(draft.doseG) || null, draftWater)}` : ''}
                </span>
              )}
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            <span className="text-[11px] text-muted-foreground">테이스팅 노트 (ICE/HOT 공통)</span>
            <input
              type="text"
              value={draft.tasting}
              onChange={(e) => setD('tasting', e.target.value)}
              placeholder="예: 자두 · 홍차 · 긴 단맛"
              className="ta-input w-full"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            <span className="text-[11px] text-muted-foreground">메모</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setD('notes', e.target.value)}
              placeholder={draft.notesHint || '메모를 남기면 카드에 표시돼요'}
              className="ta-input w-full"
              style={{ height: 'auto', minHeight: 96, paddingTop: 8, paddingBottom: 8, resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
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
        <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}
          {/* 새 발주 원두 — 레시피 미설정이면 상단에서 바로 설정 유도 */}
          {!loading && unsetCard}
          {!loading && beanGroups.length === 0 && unsetBeans.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
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
                    className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid hsl(var(--border))', paddingBottom: 6, marginBottom: 12 }}>
                <h3 className="text-[14px] text-foreground" style={{ margin: 0, fontWeight: 500 }}>{country}</h3>
                <span className="text-[11px] text-muted-foreground">{groups.length}종</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {groups.map(renderBeanCard)}
              </div>
            </div>
          ))}

          {!loading && beanGroups.length > 0 && (
            <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>
              판교 분쇄도는 지점 캘리브레이션 실측 기반 환산값입니다. <strong>*</strong>는 잠정 범위(기울기 실측 전),
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
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
          레시피 미설정 원두가 없어요. 레시피 카드는{' '}
          <Link href="/garden/recipes" className="underline hover:text-foreground">필터 레시피</Link>
          에서 관리합니다.
        </p>
      )}
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

// ICE = 파란 배지 / HOT = 빨간 배지, 글자는 둘 다 흰색 (라이트/다크 공통 리터럴)
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
              style={{ width: 64, height: 26, fontSize: 12 }}
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
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
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
        <div className="rounded-md border border-border" style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {history.map((h, i) => (
            <div key={i} className="tabular text-[11px] text-muted-foreground" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
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
      <span className="text-[11px] text-muted-foreground">{label}</span>
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
