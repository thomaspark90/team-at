'use client';

import { useRef, useState } from 'react';
import { OFFSET_OPTIONS, OFFSET_PRICES, invertedRows, offsetRowForPrice } from '@/lib/garden/store-price';
import { getStoreOffsets, loadStoreOffsets, setStoreOffsets, useStoreOffsets, useStoreOffsetsLoaded } from '@/lib/garden/store-offsets-client';

// 판교 가격 산식표 — 양재천 기준가(세로) × 판교 차액(가로) → 판교 판매가 (2026-11-24 대표 지시).
// 행마다 초록 칸 하나가 지금 적용 중인 차액. 다른 칸을 누르면 그 행의 차액이 바뀌고 서버에 저장된다
// (/api/garden-store-price) — 모든 원두의 판교 판매가가 바로 따라 바뀐다.
// 모양·조작은 가격대 참고표(PriceBandGuide)와 맞췄다. 금액은 VAT 포함 소비자가(원).

const C = {
  border: 'hsl(var(--border))',
  muted: 'hsl(var(--muted))',
  mutedFg: 'hsl(var(--muted-foreground))',
};
const ON_FILL = 'rgba(132, 204, 22, 0.16)';
const OFF_FILL = 'hsl(var(--muted) / 0.5)';

const n = (v: number) => Math.round(v).toLocaleString('ko-KR');
const offsetLabel = (d: number) => (d === 0 ? '동일' : `−${n(Math.abs(d))}`);

export default function StorePriceTable({
  readOnly,
  highlightPrice,
}: {
  readOnly?: boolean;
  highlightPrice?: number | null; // 지금 보고 있는 원두의 양재천 책정가 — 그 행을 강조
}) {
  const offsets = useStoreOffsets();
  const loaded = useStoreOffsetsLoaded();
  const [error, setError] = useState('');
  const hlRow = highlightPrice != null && highlightPrice > 0 ? offsetRowForPrice(highlightPrice) : null;
  const inverted = invertedRows(offsets);

  // 낙관적 반영 후 저장 요청은 한 줄로 세워 보낸다 — 연속 클릭이 서버에서 서로를 덮지 않게.
  // 마지막 요청의 응답만 화면에 반영하고, 실패하면 서버 상태로 다시 맞춘다.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const pick = (price: number, offset: number) => {
    const cur = getStoreOffsets();
    if (!loaded || readOnly || cur[String(price)] === offset) return;
    setStoreOffsets({ ...cur, [String(price)]: offset });
    setError('');
    pending.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        const res = await fetch('/api/garden-store-price', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price, offset }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? '저장에 실패했어요.');
        if (pending.current === 1) setStoreOffsets(j.offsets);
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했어요.');
        await loadStoreOffsets(true);
      } finally {
        pending.current -= 1;
      }
    });
  };

  return (
    <div className="min-w-0">
      <p className="ta-label">판교 가격 산식표 · 양재천 책정가별 판교 차액</p>
      <p className="text-caption text-muted-foreground" style={{ margin: '0 0 12px' }}>
        세로 = 양재천 책정가(원, VAT 포함) · 가로 = 판교 차액(원) · 칸 = 판교 판매가(원). 초록 = 지금 적용 중 —{' '}
        {readOnly ? '차액은 판매가 담당자가 바꿔요.' : '다른 칸을 누르면 그 가격대의 판교 차액이 바뀌어요(모든 원두에 바로 적용 · 모두에게 저장).'}
        <br />
        {n(OFFSET_PRICES[OFFSET_PRICES.length - 1])}원을 넘는 원두는 맨 아래 행을, {n(OFFSET_PRICES[0])}원 미만은 맨 위 행을 따라요.
      </p>
      {error && (
        <p className="ta-error text-caption" style={{ margin: '0 0 8px' }}>
          {error}
        </p>
      )}
      {inverted.length > 0 && (
        <p className="text-caption" style={{ margin: '0 0 8px', color: 'hsl(0 72% 45%)' }}>
          ⚠ 가격 역전 — 양재천 {inverted.map((p) => `${n(p)}원`).join(' · ')} 원두가 판교에서는 바로 아래 가격대 원두보다 싸져요.
        </p>
      )}
      <div className="rounded-md border border-border" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0, maxWidth: 'max-content' }}>
        <table className="tabular" style={{ borderCollapse: 'collapse', minWidth: 'max-content' }}>
          <thead>
            <tr>
              <th className="text-caption" style={{ ...head, ...sticky, textAlign: 'left' }}>양재천(원)</th>
              {OFFSET_OPTIONS.map((d) => (
                <th key={d} className="text-caption" style={head}>{offsetLabel(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OFFSET_PRICES.map((price) => {
              const cur = offsets[String(price)] ?? 0;
              const hl = hlRow === price;
              const dim = hlRow != null && !hl;
              return (
                <tr key={price} style={{ opacity: dim ? 0.55 : 1 }}>
                  <th className="text-body" style={{ ...cell, ...sticky, textAlign: 'left', fontWeight: hl ? 500 : 400 }}>
                    {hl && '▸ '}
                    {n(price)}
                    {inverted.includes(price) && <span style={{ color: 'hsl(0 72% 45%)' }}> ⚠</span>}
                  </th>
                  {OFFSET_OPTIONS.map((d) => {
                    const active = cur === d;
                    return (
                      <td
                        key={d}
                        className="text-body"
                        role={readOnly ? undefined : 'button'}
                        tabIndex={readOnly ? undefined : 0}
                        aria-pressed={readOnly ? undefined : active}
                        title={readOnly ? undefined : `양재천 ${n(price)}원 → 판교 ${n(price + d)}원 (${offsetLabel(d)})${active ? ' — 적용 중' : ' — 클릭해 적용'}`}
                        onClick={() => pick(price, d)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            pick(price, d);
                          }
                        }}
                        style={{
                          ...cell,
                          cursor: loaded && !readOnly && !active ? 'pointer' : 'default',
                          backgroundColor: active ? ON_FILL : OFF_FILL,
                          color: active ? undefined : C.mutedFg,
                          fontWeight: active ? 500 : 400,
                        }}
                      >
                        {n(price + d)}
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
  padding: '7px 14px',
  textAlign: 'center',
  fontWeight: 400,
  color: C.mutedFg,
  backgroundColor: C.muted,
  whiteSpace: 'nowrap',
};
const cell: React.CSSProperties = {
  padding: '7px 14px',
  textAlign: 'center',
  borderTop: `1px solid ${C.border}`,
  borderLeft: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
};
// 양재천 가격 열은 가로 스크롤 시 좌측 고정
const sticky: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1, backgroundColor: C.muted, borderLeft: 'none' };
