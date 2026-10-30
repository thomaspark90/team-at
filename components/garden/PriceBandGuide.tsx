'use client';

import { GUIDE_COSTS, GUIDE_MULTS, bandForCost, guidePrice, kgPriceForCost } from '@/lib/garden/price-bands';

// 판매가 설정 화면 하단 참고표 — 잔당 재료비 × 배수 → 판매가, 재료비 구간별 권장 배수 강조

const C = {
  border: 'hsl(var(--border))',
  card: 'hsl(var(--card))',
  muted: 'hsl(var(--muted))',
  mutedFg: 'hsl(var(--muted-foreground))',
};
// 권장 구간 강조 — 판매가 선택 칸과 같은 연두 계열을 옅게
const BAND_FILL = 'rgba(132, 204, 22, 0.16)';

const n = (v: number) => Math.round(v).toLocaleString('ko-KR');

export default function PriceBandGuide() {
  return (
    <div className="min-w-0">
      <p className="ta-label">참고표 · 재료비별 권장 배수</p>
      <p className="text-caption text-muted-foreground" style={{ margin: '0 0 12px' }}>
        세로 = 잔당 재료비(원) · 가로 = 배수 · 칸 = 판매가(원, 100원 올림) / 원가율 · 잔당 이익(원). 강조 칸 = 권장 구간.
        <br />
        ≈ kg = 그 재료비가 나오는 1kg 매입가(VAT 별도, 수율 90%·20g 기준). 4,000원 이상은 2.00~3.00× 동일.
      </p>
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
              const b = bandForCost(cost);
              return (
                <tr key={cost}>
                  <th className="text-body" style={{ ...cell, ...sticky, textAlign: 'left', fontWeight: 400 }}>
                    {n(cost)}
                    <span className="text-caption text-muted-foreground" style={{ display: 'block' }}>
                      ≈ kg {(kgPriceForCost(cost) / 10000).toFixed(1)}만 · {b.minMult.toFixed(2)}~{b.maxMult.toFixed(2)}×
                    </span>
                  </th>
                  {GUIDE_MULTS.map((m) => {
                    const price = guidePrice(cost, m);
                    const inBand = m >= b.minMult && m <= b.maxMult;
                    return (
                      <td key={m} className="text-body" style={{ ...cell, backgroundColor: inBand ? BAND_FILL : C.card }}>
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
