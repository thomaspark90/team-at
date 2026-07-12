'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DripRecipe, PourStep, PurchaseRecord } from '@/lib/types';
import { normalize } from '@/lib/pricing';
import { DRIP_PRESETS, applyPreset, presetById } from '@/lib/drip-presets';

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

// ---- 드랍다운 선택지 ----
const DOSE_OPTS = Array.from({ length: 9 }, (_, i) => 16 + i); // 도징량 16~24g (1g)
const TEMP_OPTS = [91, 92, 93, 94]; // 물 온도 °C
const POUR_OPTS = Array.from({ length: 7 }, (_, i) => 30 + i * 5); // 푸어링당 30~60g (5g)
const TIME_OPTS = Array.from({ length: 10 }, (_, i) => {
  const s = 150 + i * 10; // 2:30 ~ 4:00 (10초)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

// 프리셋/구 기록 값이 범위 밖이면 그 값도 선택지에 포함해 표기 유지
const withCur = (opts: number[], cur: number | null) =>
  cur != null && !opts.includes(cur) ? [...opts, cur].sort((a, b) => a - b) : opts;
const withCurStr = (opts: string[], cur: string) =>
  cur && !opts.includes(cur) ? [...opts, cur].sort() : opts;

const pourName = (p: PourStep, i: number) => p.label ?? (i === 0 ? '뜸' : `${i}차`);

// 레시피 편집 폼 상태 (셀렉트 값은 문자열, '' = 미설정)
interface Draft {
  beanKey: string;
  bean: string;
  presetId: string; // '' = 직접 설정
  doseG: string;
  tempC: string;
  grind: string;
  totalTime: string;
  pours: PourStep[];
  notes: string;
}

const emptyDraft = (beanKey: string, bean: string): Draft => ({
  beanKey,
  bean,
  presetId: '',
  doseG: '',
  tempC: '',
  grind: '',
  totalTime: '',
  pours: [],
  notes: '',
});

const draftFromRecipe = (r: DripRecipe): Draft => ({
  beanKey: r.beanKey,
  bean: r.bean,
  presetId: r.presetId ?? '',
  doseG: r.doseG != null ? String(r.doseG) : '',
  tempC: r.tempC != null ? String(r.tempC) : '',
  grind: r.grind,
  totalTime: r.totalTime,
  // 푸어링 없이 총 물량만 있는 구 기록은 한 단계로 변환해 표시
  pours: r.pours ?? (r.waterG != null ? [{ water: r.waterG, label: '총 물량' }] : []),
  notes: r.notes,
});

// 프리셋 값 그대로 채운 드래프트
const presetDraft = (beanKey: string, bean: string, presetId: string): Draft => {
  const p = presetById(presetId);
  if (!p) return emptyDraft(beanKey, bean);
  const a = applyPreset(p);
  return {
    beanKey,
    bean,
    presetId,
    doseG: String(a.doseG),
    tempC: a.tempC != null ? String(a.tempC) : '',
    grind: a.grind,
    totalTime: a.totalTime,
    pours: a.pours,
    notes: a.notes,
  };
};

export default function GardenDashboard() {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [recipes, setRecipes] = useState<DripRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const [pRes, rRes] = await Promise.all([
      fetch('/api/purchases', { cache: 'no-store' }),
      fetch('/api/garden-recipes', { cache: 'no-store' }),
    ]);
    if (pRes.ok) setPurchases(await pRes.json());
    if (rRes.ok) setRecipes(await rRes.json());
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

  // 레시피가 설정된 원두 — 업데이트 최신순으로 대시보드에 노출
  const recipeCards = useMemo(
    () => recipes.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [recipes]
  );

  // 발주 기록엔 있지만 아직 레시피가 없는 원두
  const unsetBeans = useMemo(() => {
    const has = new Set(recipes.map((r) => r.beanKey));
    return Array.from(latestByBean.entries())
      .filter(([k]) => !has.has(k))
      .map(([, rec]) => rec)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [latestByBean, recipes]);

  const openEditor = (beanKey: string, bean: string) => {
    const existing = recipes.find((r) => r.beanKey === beanKey);
    setDraft(existing ? draftFromRecipe(existing) : emptyDraft(beanKey, bean));
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
        bean: draft.bean,
        doseG: num(draft.doseG),
        waterG: waterG > 0 ? waterG : null,
        pours: draft.pours,
        tempC: num(draft.tempC),
        grind: draft.grind.trim(),
        totalTime: draft.totalTime,
        notes: draft.notes.trim(),
        presetId: draft.presetId || null,
      }),
    });
    await refresh();
    setDraft(null);
    setSaving(false);
  };

  const deleteRecipe = async (beanKey: string) => {
    await fetch('/api/garden-recipes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beanKey }),
    });
    refresh();
  };

  // 비율 표기 (1 : n.n) — 도징·물량 둘 다 있을 때만
  const ratioOf = (doseG: number | null, waterG: number | null) =>
    doseG && waterG ? `1 : ${(waterG / doseG).toFixed(1).replace(/\.0$/, '')}` : null;

  const setD = (key: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [key]: v } : d));

  // 프리셋 선택 — 값 전체를 프리셋으로 교체 (이후 드랍다운으로 자유 조정)
  const selectPreset = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      return id ? presetDraft(d.beanKey, d.bean, id) : { ...d, presetId: '' };
    });

  // 미설정 원두 행의 드랍다운 — 프리셋 즉시 적용해 편집 폼 오픈
  const pickForBean = (beanKey: string, bean: string, id: string) => {
    setDraft(id === 'custom' ? emptyDraft(beanKey, bean) : presetDraft(beanKey, bean, id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      {/* 레시피 편집 폼 — 설정/수정 클릭 시 상단에 노출 */}
      {draft && (
        <div className="ta-card bg-background min-w-0">
          <p className="ta-label">{draft.bean} — 드립 레시피</p>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <span className="text-[11px] text-muted-foreground">레시피 프리셋</span>
            <select value={draft.presetId} onChange={(e) => selectPreset(e.target.value)} className="ta-input w-full" style={{ cursor: 'pointer' }}>
              <option value="">직접 설정</option>
              {DRIP_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.source}
                </option>
              ))}
            </select>
          </label>

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
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="text-[11px] text-muted-foreground">분쇄도 (Mesh)</span>
              <input
                type="text"
                value={draft.grind}
                onChange={(e) => setD('grind', e.target.value)}
                placeholder="예: EK43(양재천) 6.0~7.0"
                className="ta-input w-full"
              />
            </label>
          </div>

          {/* 푸어링 단계 — 물 투입량 30~60g, 5g 단위 드랍다운 */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="text-[11px] text-muted-foreground">푸어링 (단계별 물 투입량)</span>
            {draft.pours.map((p, i) => {
              const cum = draft.pours.slice(0, i + 1).reduce((a, s) => a + s.water, 0);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="text-[12px] text-foreground" style={{ width: 76, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
                    title="단계 삭제"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={addPour} className="ta-btn" style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 12 }}>
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
            <span className="text-[11px] text-muted-foreground">메모</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setD('notes', e.target.value)}
              placeholder="예: 물온도 — 배전도 있는 원두 92°C / 에티오피아·케냐·게이샤 93°C"
              className="ta-input w-full"
              style={{ height: 'auto', minHeight: 72, paddingTop: 8, paddingBottom: 8, resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={saveDraft} disabled={saving} className="ta-btn-primary" style={{ flex: 1 }}>
              {saving ? '저장 중…' : '레시피 저장'}
            </button>
            <button onClick={() => setDraft(null)} className="ta-btn">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 레시피 카드 — 레시피가 설정(업데이트)된 원두만, 최신 업데이트순 */}
      <div className="ta-card bg-background min-w-0">
        <p className="ta-label">원두 레시피</p>
        {recipeCards.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {loading ? '불러오는 중…' : '아직 레시피가 설정된 원두가 없어요. 아래 원두에서 레시피를 설정해 보세요.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {recipeCards.map((r) => {
              const latest = latestByBean.get(r.beanKey);
              const ratio = ratioOf(r.doseG, r.waterG);
              const preset = presetById(r.presetId);
              return (
                <div key={r.beanKey} className="rounded-md border border-border bg-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span className="text-[14px] text-foreground" style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.bean}
                    </span>
                    {ratio && <span className="tabular text-[13px] text-foreground" style={{ flexShrink: 0 }}>{ratio}</span>}
                  </div>
                  {preset && (
                    <p className="text-[11px] text-muted-foreground" style={{ margin: '-6px 0 0' }}>
                      {preset.name} · {preset.source}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <SpecRow label="도징량" value={r.doseG != null ? `${r.doseG}g` : null} />
                    <SpecRow label="총 물량" value={r.waterG != null ? `${r.waterG}g` : null} />
                    <SpecRow label="물 온도" value={r.tempC != null ? `${r.tempC}°C` : null} />
                    <SpecRow label="분쇄도" value={r.grind || null} />
                    <SpecRow label="추출 시간(최대)" value={r.totalTime || null} />
                    {latest?.chosenPrice != null && <SpecRow label="판매가" value={won(latest.chosenPrice)} />}
                  </div>

                  {/* 푸어링 단계 — 단계별 투입량 / 누적 */}
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

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <span className="tabular text-[11px] text-muted-foreground">
                      {fmtDate(r.updatedAt)}
                      {r.updatedBy && ` · ${r.updatedBy.split('@')[0]}`}
                    </span>
                    <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <button
                        onClick={() => openEditor(r.beanKey, r.bean)}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => deleteRecipe(r.beanKey)}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        삭제
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
                <select
                  value=""
                  onChange={(e) => pickForBean(normalize(rec.bean), rec.bean, e.target.value)}
                  className="ta-btn"
                  style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 12, flexShrink: 0, cursor: 'pointer' }}
                >
                  <option value="" disabled>
                    레시피 설정 ▾
                  </option>
                  {DRIP_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="custom">직접 설정</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
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
