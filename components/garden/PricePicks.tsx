'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { PurchaseRecord } from '@/lib/types';
import { PRICE_UNIT } from '@/lib/pricing';
import { baseDoseG, brewCost, type BrewDoses } from '@/lib/garden/brew-cost';
import { bandRange, guideRowForCost, ratioRangeLabel, type ActiveCells } from '@/lib/garden/price-bands';

// 필터커피 줄 펼침의 판매가 책정 — 가격 후보 버튼(2026-11-24 디자인 개선).
// 예전 격자 표(RecordPricer, 6,000~15,000원 전 구간)는 가로로 길어, 권장 범위와 그 앞뒤 후보만 버튼으로 보여준다.
// 버튼마다 재료비율(잔당 재료비 ÷ 판매가, VAT 포함)을 같이 적고, 그 밖의 가격은 [직접 입력]으로 넣는다.
// 권장 범위 = 가격대 참고표에서 이 원두 재료비가 속한 행의 권장 칸(RecordPricer 와 같은 기준).
// 2026-11-27 대표 지시: 후보 줄을 좌우로 밀 수 있게 — 처음 보이는 구간은 예전 그대로(권장 범위와 앞 1개 · 뒤 2개)이고,
// 그 앞뒤로 EXTRA 개씩 더 깔아 두어 밀면 나온다(아래로는 잔당 재료비보다 싼 값은 두지 않는다). 줄 모양은 globals.css 의 .fc-pickstrip.

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const FALLBACK_BAND = { lo: 4, hi: 5.5 }; // 참고표 행에 권장 칸이 하나도 없을 때
const BELOW = 1; // 권장 범위 아래로 보여줄 후보 수
const ABOVE = 2; // 권장 범위 위로 보여줄 후보 수
const MIN_COUNT = 6;
const EXTRA = 10; // 처음 보이는 구간 앞뒤로 더 깔아 두는 후보 수(500원 × 10 = 5,000원씩)
const EDGE = 18; // 줄 왼쪽 끝의 옅어지는 폭 — 처음 위치는 이만큼 안쪽에서 시작한다
const PEEK = 44; // 줄 오른쪽 끝의 옅어지는 폭 — 다음 후보가 반쯤 비쳐 '밀면 더 있다'는 것이 보이게
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

  // 처음 보이는 구간 — 권장 범위(500원 단위)와 그 아래 1개·위 2개, 모자라면 위로 채운다
  const first = cost > 0 ? Math.max(PRICE_UNIT, Math.ceil((cost * lo) / PRICE_UNIT - EPS) * PRICE_UNIT - BELOW * PRICE_UNIT) : 0;
  const last = cost > 0 ? Math.max(Math.floor((cost * hi) / PRICE_UNIT + EPS) * PRICE_UNIT + ABOVE * PRICE_UNIT, first + (MIN_COUNT - 1) * PRICE_UNIT) : 0;
  // 깔아 두는 후보 — 그 구간 앞뒤로 EXTRA 개씩. 아래쪽은 재료비보다 싼 값(재료비율 100% 초과)까지 내려가지 않는다
  const prices: number[] = [];
  if (cost > 0) {
    const floor = Math.max(PRICE_UNIT, Math.ceil(cost / PRICE_UNIT - EPS) * PRICE_UNIT);
    const from = Math.min(first, Math.max(floor, first - EXTRA * PRICE_UNIT));
    for (let p = from; p <= last + EXTRA * PRICE_UNIT; p += PRICE_UNIT) prices.push(p);
  }
  if (pick != null && pick > 0 && !prices.includes(pick)) {
    prices.push(pick);
    prices.sort((a, b) => a - b);
  }

  // 줄의 폭을 '처음 보이는 구간'에 맞추고 그 구간이 보이게 민다. 이미 고른 값이 그 밖에 있으면 그 값이 보이게.
  // 원두(구간)가 바뀔 때만 — 고를 때마다 움직이면 밀어 둔 위치가 튄다. 폭은 직접 넣는다(상태로 두면 폭이 잡히기 전에 위치가 잘린다).
  const stripRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const chip = (p: number | null) => (p == null ? null : el.querySelector<HTMLElement>(`[data-p="${p}"]`));
    const a = chip(first);
    const b = chip(last);
    if (!a || !b) return;
    el.style.width = `${b.offsetLeft + b.offsetWidth - a.offsetLeft + EDGE + PEEK}px`;
    el.scrollLeft = a.offsetLeft - EDGE;
    const c = chip(pickRef.current);
    if (c && (c.offsetLeft < el.scrollLeft + EDGE || c.offsetLeft + c.offsetWidth > el.scrollLeft + el.clientWidth - PEEK)) {
      el.scrollLeft = c.offsetLeft - (el.clientWidth - c.offsetWidth) / 2;
    }
  }, [first, last]);

  const typed = Number(text.replace(/[^\d]/g, '')) || 0;
  const typedOk = typed > 0 && typed % PRICE_UNIT === 0;

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 좌우로 미는 후보 줄 — 양끝이 옅어지는 쪽으로 더 있다 */}
        <div ref={stripRef} className="fc-pickstrip scrollbar-hide" role="group" aria-label="판매가 후보 — 좌우로 밀면 더 나와요">
        {prices.map((p) => (
          <button
            key={p}
            data-p={p}
            onClick={() => onPick(p)}
            aria-pressed={pick === p}
            className={`fc-pick tabular text-body ${pick === p ? 'on' : inBand(p) ? 'rec' : ''}`}
            title={`재료비율 ${pct(cost, p)} · ICE ${pct(iceCost, p)} · HOT ${pct(hotCost, p)}`}
          >
            {p.toLocaleString('ko-KR')}
            <small>{pct(cost, p)}</small>
          </button>
        ))}
        </div>
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
        후보는 좌우로 밀면 더 나와요 · 그림자가 짙은 버튼 = 권장 판매가
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
