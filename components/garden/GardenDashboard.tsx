'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DripRecipe, PurchaseRecord } from '@/lib/types';
import { normalize } from '@/lib/pricing';

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

// 레시피 편집 폼 상태 (문자열 입력 → 저장 시 숫자 변환)
interface Draft {
  beanKey: string;
  bean: string;
  doseG: string;
  waterG: string;
  tempC: string;
  grind: string;
  totalTime: string;
  notes: string;
}

const emptyDraft = (beanKey: string, bean: string): Draft => ({
  beanKey,
  bean,
  doseG: '',
  waterG: '',
  tempC: '',
  grind: '',
  totalTime: '',
  notes: '',
});

const draftFromRecipe = (r: DripRecipe): Draft => ({
  beanKey: r.beanKey,
  bean: r.bean,
  doseG: r.doseG != null ? String(r.doseG) : '',
  waterG: r.waterG != null ? String(r.waterG) : '',
  tempC: r.tempC != null ? String(r.tempC) : '',
  grind: r.grind,
  totalTime: r.totalTime,
  notes: r.notes,
});

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
      const n = Number(s.replace(/[^\d.]/g, ''));
      return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
    };
    await fetch('/api/garden-recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beanKey: draft.beanKey,
        bean: draft.bean,
        doseG: num(draft.doseG),
        waterG: num(draft.waterG),
        tempC: num(draft.tempC),
        grind: draft.grind.trim(),
        totalTime: draft.totalTime.trim(),
        notes: draft.notes.trim(),
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

  // 비율 표기 (1 : n.n) — 투입량·물량 둘 다 있을 때만
  const ratioOf = (doseG: number | null, waterG: number | null) =>
    doseG && waterG ? `1 : ${(waterG / doseG).toFixed(1).replace(/\.0$/, '')}` : null;

  const setD = (key: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [key]: v } : d));

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      {/* 레시피 편집 폼 — 설정/수정 클릭 시 상단에 노출 */}
      {draft && (
        <div className="ta-card bg-background min-w-0">
          <p className="ta-label">{draft.bean} — 드립 레시피</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <TextField label="투입량(g)" value={draft.doseG} onChange={(v) => setD('doseG', v)} placeholder="19" numeric />
            <TextField label="물량(ml)" value={draft.waterG} onChange={(v) => setD('waterG', v)} placeholder="300" numeric />
            <TextField label="물 온도(°C)" value={draft.tempC} onChange={(v) => setD('tempC', v)} placeholder="92" numeric />
            <TextField label="분쇄도" value={draft.grind} onChange={(v) => setD('grind', v)} placeholder="예: EK43 9.5" />
            <TextField label="추출 시간" value={draft.totalTime} onChange={(v) => setD('totalTime', v)} placeholder="예: 2:30" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 1', minWidth: 0 }}>
              <span className="text-[11px] text-muted-foreground">비율</span>
              <span className="ta-input tabular" style={{ display: 'inline-flex', alignItems: 'center', borderStyle: 'dashed' }}>
                {ratioOf(Number(draft.doseG) || null, Number(draft.waterG) || null) ?? '—'}
              </span>
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            <span className="text-[11px] text-muted-foreground">푸어링 · 메모</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setD('notes', e.target.value)}
              placeholder="예: 뜸 40g 30초 → 3차 푸어링 (100g씩)"
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
              return (
                <div key={r.beanKey} className="rounded-md border border-border bg-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span className="text-[14px] text-foreground" style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.bean}
                    </span>
                    {ratio && <span className="tabular text-[13px] text-foreground" style={{ flexShrink: 0 }}>{ratio}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <SpecRow label="투입량" value={r.doseG != null ? `${r.doseG}g` : null} />
                    <SpecRow label="물량" value={r.waterG != null ? `${r.waterG}ml` : null} />
                    <SpecRow label="물 온도" value={r.tempC != null ? `${r.tempC}°C` : null} />
                    <SpecRow label="분쇄도" value={r.grind || null} />
                    <SpecRow label="추출 시간" value={r.totalTime || null} />
                    {latest?.chosenPrice != null && <SpecRow label="판매가" value={won(latest.chosenPrice)} />}
                  </div>

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
                <button
                  onClick={() => openEditor(normalize(rec.bean), rec.bean)}
                  className="ta-btn"
                  style={{ height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 12, flexShrink: 0 }}
                >
                  레시피 설정
                </button>
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

function TextField({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode={numeric ? 'decimal' : undefined}
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/[^\d.]/g, '') : e.target.value)}
        placeholder={placeholder}
        className={`ta-input w-full${numeric ? ' tabular' : ''}`}
      />
    </label>
  );
}
