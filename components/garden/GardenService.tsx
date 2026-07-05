'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PricingSettings, PurchaseRecord } from '@/lib/types';
import { DEFAULT_SETTINGS, computePricing, normalize, priceAtMult } from '@/lib/pricing';

// 인라인 스타일에서 참조할 midday 토큰 (HSL 변수)
const C = {
  border: 'hsl(var(--border))',
  card: 'hsl(var(--card))',
  muted: 'hsl(var(--muted))',
  accent: 'hsl(var(--accent))',
  fg: 'hsl(var(--foreground))',
  mutedFg: 'hsl(var(--muted-foreground))',
  primary: 'hsl(var(--primary))',
};

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

// 스프레드로 보여줄 배수 (3.0 ~ 7.0, 0.5 단위 — 가로 스와이프)
const SPREAD = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];
const HIGHLIGHT = C.accent; // 권장 구간(배수 minMult~maxMult) 강조색 (무채색)

export default function GardenService() {
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_SETTINGS);
  const [bean, setBean] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [selectedMult, setSelectedMult] = useState<number | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const refreshPurchases = async () => {
    const res = await fetch('/api/purchases', { cache: 'no-store' });
    if (res.ok) setPurchases(await res.json());
  };
  useEffect(() => {
    refreshPurchases();
  }, []);

  const result = useMemo(
    () => (price > 0 ? computePricing(price, [], settings) : null),
    [price, settings]
  );

  const setNum = (key: keyof PricingSettings, v: number) =>
    setSettings((s) => ({ ...s, [key]: v }));

  const adjMin = (d: number) =>
    setSettings((s) => ({ ...s, minMult: clamp(s.minMult + d, 3, s.maxMult) }));
  const adjMax = (d: number) =>
    setSettings((s) => ({ ...s, maxMult: clamp(s.maxMult + d, s.minMult, 7) }));

  const savePurchase = async () => {
    if (!result || !bean.trim() || price <= 0 || saving) return;
    setSaving(true);
    await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bean: bean.trim(),
        purchasePrice: price,
        settings,
        costPerCup: result.costPerCup,
        rangeLow: result.rangeLow,
        rangeHigh: result.rangeHigh,
        chosenMult: selectedMult,
        chosenPrice: selectedMult != null ? priceAtMult(price, selectedMult, settings) : null,
      }),
    });
    await refreshPurchases();
    setSelectedMult(null);
    setSaving(false);
  };

  const deletePurchase = async (id: string) => {
    await fetch('/api/purchases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    refreshPurchases();
  };

  // 발주 기록 — 원두별 그룹(각 그룹 최신순), 그룹은 최근 기록순
  const purchaseGroups = useMemo(() => {
    const m = new Map<string, PurchaseRecord[]>();
    for (const r of purchases) {
      const k = normalize(r.bean);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    const groups = Array.from(m.values()).map((rs) =>
      rs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
    groups.sort((a, b) => b[0].createdAt.localeCompare(a[0].createdAt));
    return groups;
  }, [purchases]);

  return (
    <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        <div className="ta-card min-w-0">
          <p className="ta-label">판매가 산식 기준</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="구매 용량(g)" value={settings.capacityG} onChange={(v) => setNum('capacityG', v)} />
            <Field label="로스율 제외(%)" value={Math.round(settings.yieldRate * 100)} onChange={(v) => setNum('yieldRate', v / 100)} />
            <Field label="추출 투입량(g)" value={settings.doseG} onChange={(v) => setNum('doseG', v)} />
          </div>
        </div>

        <div className="ta-card min-w-0">
          <p className="ta-label">원두 정보 입력</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              value={bean}
              onChange={(e) => setBean(e.target.value)}
              placeholder="원두명 (예: 에티오피아 게뎁)"
              className="ta-input w-full"
            />
            <input
              type="text"
              inputMode="numeric"
              value={price ? price.toLocaleString('ko-KR') : ''}
              onChange={(e) => {
                setPrice(Number(e.target.value.replace(/[^\d]/g, '')) || 0);
                setSelectedMult(null);
              }}
              placeholder={`공급가 000,000 (${settings.capacityG}g·부가세 별도)`}
              className="ta-input w-full tabular"
            />
          </div>

          {result && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="text-[11px] text-muted-foreground">잔당 재료비 (VAT 포함)</span>
                  <span className="text-[22px] text-foreground tabular">{won(result.costPerCup)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>권장</span>
                  <Stepper value={settings.minMult} onDec={() => adjMin(-0.5)} onInc={() => adjMin(0.5)} />
                  <span>~</span>
                  <Stepper value={settings.maxMult} onDec={() => adjMax(-0.5)} onInc={() => adjMax(0.5)} />
                </div>
              </div>

              {/* 배수 스프레드 표 (가로 스와이프) */}
              <div className="rounded-md border border-border" style={{ overflowX: 'auto', fontSize: 12, WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `52px repeat(${SPREAD.length}, 76px)`,
                  minWidth: 'max-content',
                }}
              >
                <Cell label>배수</Cell>
                {SPREAD.map((m) => (
                  <Cell key={`h${m}`} head pos="top" hi={m >= settings.minMult && m <= settings.maxMult} selected={selectedMult === m} onClick={() => setSelectedMult(m)}>
                    {m.toFixed(1)}×
                  </Cell>
                ))}

                <Cell label>판매가</Cell>
                {SPREAD.map((m) => (
                  <Cell key={`p${m}`} pos="mid" hi={m >= settings.minMult && m <= settings.maxMult} bold selected={selectedMult === m} onClick={() => setSelectedMult(m)}>
                    {won(priceAtMult(price, m, settings))}
                  </Cell>
                ))}

                <Cell label>원가율</Cell>
                {SPREAD.map((m) => (
                  <Cell key={`r${m}`} pos="bottom" hi={m >= settings.minMult && m <= settings.maxMult} muted selected={selectedMult === m} onClick={() => setSelectedMult(m)}>
                    {Math.round(100 / m)}%
                  </Cell>
                ))}
              </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                강조 칸 = 권장 구간(배수 {settings.minMult}~{settings.maxMult}) · 배수를 클릭해 책정 판매가를 고르세요
              </p>

              <button
                onClick={savePurchase}
                disabled={saving}
                className="ta-btn-primary w-full mt-1"
              >
                {saving ? '저장 중…' : `${bean.trim() ? bean.trim() + ' ' : ''}원두 저장하기`}
              </button>
            </div>
          )}
        </div>

        {/* 발주 기록 — 같은 원두 재발주 시 원가·판매가 비교 */}
        {purchases.length > 0 && (
          <div className="ta-card min-w-0">
            <p className="ta-label">이전 판매 리스트</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {purchaseGroups.map((group) => (
                <div key={group[0].id}>
                  <p className="text-[13px] text-foreground mb-1.5">
                    {group[0].bean}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.map((rec, i) => {
                      const older = group[i + 1];
                      const delta = older ? rec.costPerCup - older.costPerCup : 0;
                      return (
                        <div key={rec.id} className="gs-row">
                          <span className="gs-meta">
                            <span className="tabular text-muted-foreground" style={{ width: 64, flexShrink: 0 }}>{fmtDate(rec.createdAt)}</span>
                            <span className="tabular text-muted-foreground" style={{ flexShrink: 0 }}>원가 {won(rec.purchasePrice)}</span>
                            <span className="tabular text-foreground" style={{ flexShrink: 0 }}>
                              재료비 {won(rec.costPerCup)}
                              {older && delta !== 0 && (
                                <span className="tabular text-foreground" style={{ marginLeft: 4 }}>
                                  {delta > 0 ? '▲' : '▼'}{won(Math.abs(delta))}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="gs-price">
                            {rec.chosenPrice != null ? (
                              <span className="tabular text-foreground">
                                책정 판매가 {won(rec.chosenPrice)}
                                <span className="text-muted-foreground"> ({Math.round((rec.costPerCup / rec.chosenPrice) * 100)}%)</span>
                              </span>
                            ) : (
                              <span className="tabular text-muted-foreground">판매 {won(rec.rangeLow)}~{won(rec.rangeHigh)}</span>
                            )}
                          </span>
                          <button
                            onClick={() => deletePurchase(rec.id)}
                            className="gs-del text-muted-foreground hover:text-foreground"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// 권장 구간 하한/상한 조절 화살표 토글
function Stepper({ value, onDec, onInc }: { value: number; onDec: () => void; onInc: () => void }) {
  const btn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: C.mutedFg,
    fontSize: 14,
    lineHeight: 1,
    padding: '2px 6px',
    fontFamily: 'inherit',
  };
  return (
    <span className="rounded-md border border-border" style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button onClick={onDec} style={btn}>‹</button>
      <span className="tabular text-foreground" style={{ minWidth: 28, textAlign: 'center', fontSize: 12 }}>{value.toFixed(1)}</span>
      <button onClick={onInc} style={btn}>›</button>
    </span>
  );
}

function Cell({
  children,
  label,
  head,
  hi,
  bold,
  muted,
  selected,
  onClick,
  pos,
}: {
  children: React.ReactNode;
  label?: boolean;
  head?: boolean;
  hi?: boolean;
  bold?: boolean;
  muted?: boolean;
  selected?: boolean;
  onClick?: () => void;
  pos?: 'top' | 'mid' | 'bottom';
}) {
  const style: React.CSSProperties = {
    padding: '7px 3px',
    textAlign: label ? 'left' : 'center',
    borderTop: `1px solid ${C.border}`,
    borderLeft: label ? 'none' : `1px solid ${C.border}`,
    backgroundColor: label ? C.muted : hi ? HIGHLIGHT : C.card,
    color: muted ? C.mutedFg : label ? C.mutedFg : C.fg,
    fontSize: label || muted ? 11 : 12,
    whiteSpace: 'nowrap',
    cursor: onClick ? 'pointer' : 'default',
  };
  // 라벨 칸은 가로 스크롤 시 좌측 고정
  if (label) {
    style.position = 'sticky';
    style.left = 0;
    style.zIndex = 2;
  }
  if (selected) {
    // 세 칸의 바깥 테두리만 강조(다크) 2px → 한 박스처럼, 모서리 라운드
    const B = `2px solid ${C.primary}`;
    style.borderLeft = B;
    style.borderRight = B;
    if (pos === 'top') {
      style.borderTop = B;
      style.borderTopLeftRadius = 7;
      style.borderTopRightRadius = 7;
    }
    if (pos === 'bottom') {
      style.borderBottom = B;
      style.borderBottomLeftRadius = 7;
      style.borderBottomRightRadius = 7;
    }
  }
  return (
    <div onClick={onClick} className="tabular" style={style}>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ta-input w-full tabular"
      />
    </label>
  );
}
