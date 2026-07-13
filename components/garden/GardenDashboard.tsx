'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BeanMeta, BrewType, DripRecipe, DripRecipeSnapshot, PourStep, PurchaseRecord, StoreId } from '@/lib/types';
import { STORES, STOCK_LEVELS, stockOf, beanRegisteredAt, daysSince } from '@/lib/types';
import { costPerCup, normalize } from '@/lib/pricing';
import { applyPreset, presetById } from '@/lib/drip-presets';
import { flavorGradient } from '@/lib/flavor-colors';

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

// 구 기록의 분쇄도 텍스트(예: 'EK43(양재천) 6.5')에서 수치만 추출
const meshFromLegacy = (grind: string) => {
  const m = grind.match(/\d+(\.\d+)?/);
  return m ? m[0] : '';
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

// 원두 하나 = ICE/HOT 레시피 슬롯 한 쌍
interface BeanGroup {
  beanKey: string;
  bean: string;
  ice: DripRecipe | null;
  hot: DripRecipe | null;
  latestUpdate: string;
}

export default function GardenDashboard() {
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

  const refresh = async () => {
    const [pRes, rRes, bRes] = await Promise.all([
      fetch('/api/purchases', { cache: 'no-store' }),
      fetch('/api/garden-recipes', { cache: 'no-store' }),
      fetch('/api/garden-beans', { cache: 'no-store' }),
    ]);
    if (pRes.ok) setPurchases(await pRes.json());
    if (rRes.ok) setRecipes(await rRes.json());
    if (bRes.ok) setBeanMetas(await bRes.json());
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

  // 재고 있음 / 전 지점 0% 분리 — 대시보드엔 재고 있는 원두만, 전 지점 0%는 필터 레시피 탭에서만 조회
  const activeGroups = useMemo(
    () => beanGroups.filter((g) => STORES.some((s) => stockOf(metaByBean.get(g.beanKey), s.id) > 0)),
    [beanGroups, metaByBean]
  );
  const soldGroups = useMemo(
    () => beanGroups.filter((g) => STORES.every((s) => stockOf(metaByBean.get(g.beanKey), s.id) === 0)),
    [beanGroups, metaByBean]
  );

  // 발주 기록엔 있지만 레시피가 하나도 없는 원두
  const unsetBeans = useMemo(() => {
    const has = new Set(recipes.map((r) => r.beanKey));
    return Array.from(latestByBean.entries())
      .filter(([k]) => !has.has(k))
      .map(([, rec]) => rec)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [latestByBean, recipes]);

  // 편집 열기 — 기존 레시피가 있으면 불러오고, 없으면 매장 기준 프리셋으로 시작
  const openEditor = (beanKey: string, bean: string, brewType: BrewType) => {
    const existing = recipes.find((r) => r.beanKey === beanKey && btOf(r) === brewType);
    const base = existing ? draftFromRecipe(existing) : presetDraft(beanKey, bean, brewType);
    setDraft({ ...base, tasting: tastingByBean.get(beanKey) ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 이력 스냅샷을 편집 폼에 불러오기 — 저장을 눌러야 실제 복원됨
  const restoreSnapshot = (beanKey: string, bean: string, brewType: BrewType, s: DripRecipeSnapshot) => {
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
    await fetch('/api/garden-beans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey: tastingEdit.beanKey, bean: tastingEdit.bean, tasting: tastingEdit.value }),
    });
    await refresh();
    setTastingEdit(null);
    setTastingSaving(false);
  };

  // 지점 재고량 저장 — 한 지점만 병합 업데이트
  const setStock = async (beanKey: string, bean: string, storeId: StoreId, pct: number) => {
    setStockPicker(null);
    await fetch('/api/garden-beans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, bean, stockByStore: { [storeId]: pct } }),
    });
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
    await fetch('/api/garden-recipes', {
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
    });
    // 테이스팅 노트는 원두 공통 — 값이 바뀐 경우에만 별도 업서트
    if (draft.tasting.trim() !== (tastingByBean.get(draft.beanKey) ?? '')) {
      await fetch('/api/garden-beans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beanKey: draft.beanKey, bean: draft.bean, tasting: draft.tasting }),
      });
    }
    await refresh();
    setDraft(null);
    setSaving(false);
  };

  const deleteRecipe = async (beanKey: string, brewType: BrewType) => {
    await fetch('/api/garden-recipes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey, brewType }),
    });
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
              {/* 등록 시점부터 경과일 — 등록 당일 D+0 */}
              {regAt && (
                <span className="tabular text-[11px] text-muted-foreground" style={{ flexShrink: 0 }} title={`등록 ${fmtDate(regAt)}`}>
                  D+{daysSince(regAt)}
                </span>
              )}
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
            {latest?.chosenPrice != null && (
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
                      <SpecRow label="분쇄도" value={r.grindMesh != null ? `EK43(양재천) ${meshFmt(r.grindMesh)}` : r.grind || null} />
                      <SpecRow label="추출 시간(최대)" value={r.totalTime || null} />
                      <SpecRow
                        label="재료비"
                        value={
                          matCost != null
                            ? `${won(matCost)}${
                                latest?.chosenPrice != null
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
                                s.waterG != null ? `${s.waterG}ml` : null,
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

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
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
            <button onClick={() => setDraft(null)} className="ta-btn">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 원두 레시피 카드 — 재고 있는 원두만, 최신 업데이트순 */}
      <div className="min-w-0">
        <p className="ta-label">원두 레시피</p>
        {activeGroups.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {loading
              ? '불러오는 중…'
              : soldGroups.length > 0
                ? '재고가 남은 원두가 없어요. 재고 0% 원두는 필터 레시피 탭에서 볼 수 있어요.'
                : '아직 레시피가 설정된 원두가 없어요. 아래 원두에서 레시피를 설정해 보세요.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {activeGroups.map(renderBeanCard)}
          </div>
        )}
        {/* 두 지점 모두 재고 0%면 대시보드에서 제외 — 필터 레시피 탭에서 조회·재입고 */}
        {soldGroups.length > 0 && (
          <p className="text-[11px] text-muted-foreground" style={{ marginTop: 10 }}>
            재고 0% 원두 {soldGroups.length}종은{' '}
            <Link href="/garden/recipes" className="underline hover:text-foreground">
              필터 레시피
            </Link>
            에서 볼 수 있어요.
          </p>
        )}
      </div>

      {/* 레시피 미설정 원두 — 가격 세팅에서 저장한 원두 목록 */}
      {unsetBeans.length > 0 && (
        <div className="ta-card bg-background min-w-0">
          <p className="ta-label">레시피 미설정 원두</p>
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
                {BREW_TYPES.map((bt) => (
                  <button
                    key={bt}
                    onClick={() => openEditor(normalize(rec.bean), rec.bean, bt)}
                    className="ta-btn"
                    style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 13, flexShrink: 0 }}
                  >
                    {btLabel(bt)} 설정
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
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
