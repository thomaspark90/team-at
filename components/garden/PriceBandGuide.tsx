'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GUIDE_COSTS,
  GUIDE_MULTS,
  defaultActiveCells,
  guidePrice,
  kgPriceForCost,
  type ActiveCells,
} from '@/lib/garden/price-bands';

// 판매가 설정 화면 하단 참고표 — 잔당 재료비 × 배수 → 판매가.
// 칸을 클릭하면 권장(초록) ↔ 비활성(회색)이 바뀌고 서버에 저장된다 (/api/garden-price-bands).

const C = {
  border: 'hsl(var(--border))',
  card: 'hsl(var(--card))',
  muted: 'hsl(var(--muted))',
  mutedFg: 'hsl(var(--muted-foreground))',
};
// 권장 구간 강조 — 판매가 선택 칸과 같은 연두 계열을 옅게 / 비활성은 옅은 회색
const BAND_FILL = 'rgba(132, 204, 22, 0.16)';
const OFF_FILL = 'hsl(var(--muted) / 0.5)';

const n = (v: number) => Math.round(v).toLocaleString('ko-KR');

// onChange — 화면의 다른 부분(미책정 카드 권장 강조)이 같은 칸 상태를 쓰도록 변경을 알린다
export default function PriceBandGuide({ onChange }: { onChange?: (cells: ActiveCells) => void }) {
  const [cells, setCells] = useState<ActiveCells>(defaultActiveCells);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onChange?.(cells);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  useEffect(() => {
    fetch('/api/garden-price-bands', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.cells && setCells(j.cells))
      .finally(() => setLoaded(true));
  }, []);

  const isOn = (cost: number, m: number) => (cells[String(cost)] ?? []).includes(m);

  // 낙관적 반영 후 저장 요청은 한 줄로 세워 보낸다 — 연속 클릭이 서버에서 서로를 덮지 않게.
  // 마지막 요청의 응답만 화면에 반영하고, 실패하면 서버 상태로 다시 맞춘다.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const toggle = (cost: number, m: number) => {
    if (!loaded) return;
    const active = !isOn(cost, m);
    setCells((cur) => {
      const row = new Set(cur[String(cost)] ?? []);
      if (active) row.add(m);
      else row.delete(m);
      return { ...cur, [String(cost)]: GUIDE_MULTS.filter((x) => row.has(x)) };
    });
    setError('');
    pending.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        const res = await fetch('/api/garden-price-bands', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cost, mult: m, active }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? '저장에 실패했어요.');
        if (pending.current === 1) setCells(j.cells);
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했어요.');
        const r = await fetch('/api/garden-price-bands', { cache: 'no-store' }).catch(() => null);
        const j = r?.ok ? await r.json() : null;
        if (j?.cells) setCells(j.cells);
      } finally {
        pending.current -= 1;
      }
    });
  };

  return (
    <div className="min-w-0">
      <p className="ta-label">참고표 · 재료비별 권장 배수</p>
      <p className="text-caption text-muted-foreground" style={{ margin: '0 0 12px' }}>
        세로 = 잔당 재료비(원) · 가로 = 배수 · 칸 = 판매가(원, 500원 올림) / 원가율 · 잔당 이익(원). 초록 = 권장 · 회색 = 비활성 — 칸을 클릭해 바꿀 수 있어요(모두에게 저장).
        <br />
        ≈ kg = 그 재료비가 나오는 1kg 매입가(VAT 별도, 수율 90%·20g 기준).
      </p>
      {error && (
        <p className="ta-error text-caption" style={{ margin: '0 0 8px' }}>
          {error}
        </p>
      )}
      <div className="rounded-md border border-border" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
        <table className="tabular" style={{ borderCollapse: 'collapse', minWidth: 'max-content' }}>
          <thead>
            <tr>
              <th className="text-caption" style={{ ...head, ...sticky, textAlign: 'left' }}>재료비(원)</th>
              {GUIDE_MULTS.map((m) => (
                <th key={m} className="text-caption" style={head}>{m.toFixed(2)}×</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GUIDE_COSTS.map((cost) => {
              const on = cells[String(cost)] ?? [];
              return (
                <tr key={cost}>
                  <th className="text-body" style={{ ...cell, ...sticky, textAlign: 'left', fontWeight: 400 }}>
                    {n(cost)}
                    <span className="text-caption text-muted-foreground" style={{ display: 'block' }}>
                      ≈ kg {(kgPriceForCost(cost) / 10000).toFixed(1)}만 · {on.length ? `${on[0].toFixed(2)}~${on[on.length - 1].toFixed(2)}×` : '권장 없음'}
                    </span>
                  </th>
                  {GUIDE_MULTS.map((m) => {
                    const price = guidePrice(cost, m);
                    const active = isOn(cost, m);
                    return (
                      <td
                        key={m}
                        className="text-body"
                        role="button"
                        tabIndex={0}
                        aria-pressed={active}
                        title={`${n(cost)}원 × ${m.toFixed(2)} — 클릭해 ${active ? '비활성' : '권장'}으로`}
                        onClick={() => toggle(cost, m)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle(cost, m);
                          }
                        }}
                        style={{ ...cell, cursor: loaded ? 'pointer' : 'default', backgroundColor: active ? BAND_FILL : OFF_FILL }}
                      >
                        {n(price)}
                        <span className="text-caption text-muted-foreground" style={{ display: 'block' }}>
                          {Math.round((cost / price) * 100)}% · +{n(price - cost)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const head: React.CSSProperties = {
  padding: '7px 8px',
  textAlign: 'center',
  fontWeight: 400,
  color: C.mutedFg,
  backgroundColor: C.muted,
  whiteSpace: 'nowrap',
};
const cell: React.CSSProperties = {
  padding: '7px 8px',
  textAlign: 'center',
  borderTop: `1px solid ${C.border}`,
  borderLeft: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
};
// 재료비 열은 가로 스크롤 시 좌측 고정
const sticky: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1, backgroundColor: C.muted, borderLeft: 'none' };
