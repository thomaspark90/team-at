'use client';

import { useState } from 'react';
import type { PurchaseRecord } from '@/lib/types';
import { PRICE_UNIT } from '@/lib/pricing';
import { baseDoseG, brewCost, type BrewDoses } from '@/lib/garden/brew-cost';
import { bandRange, guideRowForCost, ratioRangeLabel, type ActiveCells } from '@/lib/garden/price-bands';

// 필터커피 줄 펼침의 판매가 책정 — 가격 후보 버튼(2026-11-24 디자인 개선).
// 예전 격자 표(RecordPricer, 6,000~15,000원 전 구간)는 가로로 길어, 권장 범위와 그 앞뒤 후보만 버튼으로 보여준다.
// 버튼마다 재료비율(잔당 재료비 ÷ 판매가, VAT 포함)을 같이 적고, 그 밖의 가격은 [직접 입력]으로 넣는다.
// 권장 범위 = 가격대 참고표에서 이 원두 재료비가 속한 행의 권장 칸(RecordPricer 와 같은 기준).

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const FALLBACK_BAND = { lo: 4, hi: 5.5 }; // 참고표 행에 권장 칸이 하나도 없을 때
const BELOW = 1; // 권장 범위 아래로 보여줄 후보 수
const ABOVE = 2; // 권장 범위 위로 보여줄 후보 수
const MIN_COUNT = 6;
const EPS = 1e-9;

export default function PricePicks({
  rec,
  doses,
  pick,
  bandCells,
  onPick,
  onDecide,
  onClear,
  busy,
}: {
  rec: PurchaseRecord;
  doses: BrewDoses;
  pick: number | null;
  bandCells: ActiveCells;
  onPick: (price: number) => void;
  onDecide: (price: number) => void;
  onClear?: () => void; // 이미 책정된 기록 — 책정 해제
  busy: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');

  const baseDose = baseDoseG(doses.ice.doseG, doses.hot.doseG);
  const cost = brewCost(rec, baseDose);
  const iceCost = brewCost(rec, doses.ice.doseG);
  const hotCost = brewCost(rec, doses.hot.doseG);
  const bandRow = guideRowForCost(cost);
  const band = bandRange(bandCells[String(bandRow)] ?? []);
  const { lo, hi } = band ?? FALLBACK_BAND;
  const inBand = (p: number) => band != null && cost > 0 && p / cost >= band.lo - EPS && p / cost <= band.hi + EPS;
  const pct = (c: number, p: number) => `${Math.round((c / p) * 100)}%`;

  // 후보 — 권장 범위(500원 단위)와 그 아래 1개·위 2개, 모자라면 위로 채운다
  const prices: number[] = [];
  if (cost > 0) {
    const first = Math.max(PRICE_UNIT, Math.ceil((cost * lo) / PRICE_UNIT - EPS) * PRICE_UNIT - BELOW * PRICE_UNIT);
    const last = Math.max(Math.floor((cost * hi) / PRICE_UNIT + EPS) * PRICE_UNIT + ABOVE * PRICE_UNIT, first + (MIN_COUNT - 1) * PRICE_UNIT);
    for (let p = first; p <= last; p += PRICE_UNIT) prices.push(p);
  }
  if (pick != null && pick > 0 && !prices.includes(pick)) {
    prices.push(pick);
    prices.sort((a, b) => a - b);
  }

  const typed = Number(text.replace(/[^\d]/g, '')) || 0;
  const typedOk = typed > 0 && typed % PRICE_UNIT === 0;

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {prices.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            aria-pressed={pick === p}
            className={`fc-pick tabular text-body ${pick === p ? 'on' : inBand(p) ? 'rec' : ''}`}
            title={`재료비율 ${pct(cost, p)} · ICE ${pct(iceCost, p)} · HOT ${pct(hotCost, p)}`}
          >
            {p.toLocaleString('ko-KR')}
            <small>{pct(cost, p)}</small>
          </button>
        ))}
        {custom ? (
          <input
            autoFocus
            inputMode="numeric"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const v = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
              if (v > 0 && v % PRICE_UNIT === 0) onPick(v);
            }}
            placeholder="예: 14500"
            className="ta-input tabular"
            style={{ width: 120, height: 46 }}
            aria-label="판매가 직접 입력(원, 500원 단위)"
          />
        ) : (
          <button onClick={() => setCustom(true)} className="fc-txt text-body" style={{ padding: '0 6px' }}>
            직접 입력
          </button>
        )}
      </div>

      {custom && text && !typedOk && (
        <p className="text-caption ta-error" style={{ margin: 0 }}>
          판매가는 {PRICE_UNIT.toLocaleString('ko-KR')}원 단위로 입력해요.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap' }}>
        <span className="tabular text-muted-foreground" style={{ flex: '1 1 260px', minWidth: 0 }}>
          {pick != null && pick > 0 ? (
            <>
              <span className="text-foreground">{won(pick)}</span> — 재료비율 {pct(cost, pick)} · ICE {pct(iceCost, pick)} · HOT {pct(hotCost, pick)}
            </>
          ) : (
            '판매가를 골라 주세요'
          )}
        </span>
        {onClear && (
          <button onClick={onClear} disabled={busy} className="fc-txt text-body">
            책정 해제
          </button>
        )}
        <button onClick={() => pick != null && onDecide(pick)} disabled={busy || pick == null || pick <= 0} className="ta-btn-primary">
          {busy ? '저장 중…' : pick != null && pick > 0 ? `${won(pick)} 확정` : '판매가 선택'}
        </button>
      </div>

      <p className="text-caption text-muted-foreground" style={{ margin: 0 }}>
        그림자가 짙은 버튼 = 권장 판매가
        {band
          ? `(재료비율 ${ratioRangeLabel(band.lo, band.hi)}, 참고표 재료비 ${bandRow.toLocaleString('ko-KR')}원 행)`
          : `(참고표 재료비 ${bandRow.toLocaleString('ko-KR')}원 행에 권장 칸 없음)`}{' '}
        · 금액은 VAT 포함 소비자가 · 재료비율 = 잔당 재료비 ÷ 판매가, 기준은 ICE·HOT 평균 {baseDose}g {won(cost)} — ICE {doses.ice.doseG}g {won(iceCost)}
        {doses.ice.fromRecipe ? '' : '(기준값)'} · HOT {doses.hot.doseG}g {won(hotCost)}
        {doses.hot.fromRecipe ? '' : '(기준값)'}
      </p>
    </div>
  );
}
