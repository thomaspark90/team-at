'use client';

import { useEffect, useRef } from 'react';
import type { PurchaseRecord } from '@/lib/types';
import { PRICE_UNIT, roundUpPrice } from '@/lib/pricing';
import { fmtDate } from '@/lib/garden/format';
import { baseDoseG, brewCost, type BrewDoses } from '@/lib/garden/brew-cost';
import { bandRange, guideRowForCost, ratioRangeLabel, type ActiveCells } from '@/lib/garden/price-bands';

// 발주 기록 1건의 판매가 책정 표 — 500원 단위 후보 × 재료비율(평균·ICE·HOT), 초록 칸 = 참고표 권장 범위.
// 판매가 설정 화면(GardenSalePrice)에 있던 것을 떼어 냈다(2026-11-24) — 원두 장부 줄 펼침의 판매가 블록(LedgerPricing)과 함께 쓴다.

// 인라인 스타일에서 참조할 midday 토큰 (HSL 변수)
const C = {
  border: 'hsl(var(--border))',
  card: 'hsl(var(--card))',
  muted: 'hsl(var(--muted))',
  accent: 'hsl(var(--accent))',
  fg: 'hsl(var(--foreground))',
  mutedFg: 'hsl(var(--muted-foreground))',
};

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

// 판매가 후보 범위 — 권장 배수 구간 양옆으로 이만큼 더 보여준다 (500원 단위 후보, 가로 스와이프)
const SPREAD_BELOW = 0.25;
const SPREAD_ABOVE = 0.75;
// 판매가 후보표 고정 범위(원, VAT 포함) — 이 범위는 항상 보인다
const SPREAD_MIN_PRICE = 6000;
const SPREAD_MAX_PRICE = 15000;
const PRICE_COL_W = 76; // 판매가 후보 칸 너비(px)
const FALLBACK_BAND = { lo: 4, hi: 5.5 }; // 참고표 행에 권장 칸이 하나도 없을 때
const EPS = 1e-9;
// 권장 배수 강조 — 하단 참고표의 초록 칸과 같은 색 (재료비 행 기준, 2026-10-30)
const HIGHLIGHT = 'rgba(132, 204, 22, 0.16)';
// 선택 칸 강조 — 연두(라임). 투명도를 높여 뒤 텍스트 가독 유지. 라이트/다크 공통 리터럴.
const SELECT_BORDER = 'rgba(132, 204, 22, 0.55)';
const SELECT_FILL = 'rgba(132, 204, 22, 0.14)';

// 발주 기록 1건의 책정 UI — 기록 요약 + 판매가 후보 표(재료비율) + 확정 버튼
export default function RecordPricer({
  rec,
  doses,
  pick,
  bandCells,
  onPick,
  onDecide,
  onClear,
  onDismiss,
  busy,
  compact,
  orderButton,
}: {
  rec: PurchaseRecord;
  doses: BrewDoses; // ICE·HOT 도징량 — 원가율 행을 따로 보여준다
  pick: number | null;
  bandCells: ActiveCells;
  onPick: (m: number) => void;
  onDecide: (m: number) => void;
  onClear?: () => void;
  onDismiss?: () => void; // 미책정 목록에서 숨기기(X)
  busy: boolean;
  compact?: boolean; // 책정 완료 목록 안 재책정 — 요약줄 생략
  orderButton?: React.ReactNode; // 발주 카톡 [발주] — 허용 계정에만 (KakaoOrder)
}) {
  // 권장 범위 = 참고표에서 이 기록 재료비가 속한 행의 초록 칸 범위(최솟값~최댓값, 내부 키는 배수)
  // 재료비 = ICE·HOT 도징 중간값 기준 (2026-11-03) — 레시피 없으면 기준값 20g·18g → 19g
  const baseDose = baseDoseG(doses.ice.doseG, doses.hot.doseG);
  const cost = brewCost(rec, baseDose);
  const bandRow = guideRowForCost(cost);
  const band = bandRange(bandCells[String(bandRow)] ?? []);
  const { lo, hi: top } = band ?? FALLBACK_BAND;
  // 판매가 후보 — 권장 구간 양옆까지 500원 단위. 기존 책정가가 범위 밖·단위 밖이면 함께 보여준다
  // 판매가 후보 — 최소 6,000~15,000원(500원 단위) 전 구간을 좌우 스크롤로 보여주고(2026-11-03 대표 지시),
  // 권장 구간 양옆 스프레드가 그 밖으로 나가면 그만큼 넓힌다. 초록 칸 = 권장(참고표) 범위.
  const prices: number[] = [];
  if (cost > 0) {
    const first = Math.min(SPREAD_MIN_PRICE, roundUpPrice(cost * Math.max(1, lo - SPREAD_BELOW)));
    const last = Math.max(SPREAD_MAX_PRICE, roundUpPrice(cost * (top + SPREAD_ABOVE)));
    for (let p = first; p <= last; p += PRICE_UNIT) prices.push(p);
  }
  if (pick != null && !prices.includes(pick)) {
    prices.push(pick);
    prices.sort((a, b) => a - b);
  }
  const multOf = (p: number) => (cost > 0 ? p / cost : 0);
  const hi = (p: number) => band != null && multOf(p) >= band.lo - EPS && multOf(p) <= band.hi + EPS;
  // 처음 열 때 초록(권장) 칸이 보이도록 가로 스크롤 — 권장 첫 칸 앞에 한 칸 여유
  const scrollerRef = useRef<HTMLDivElement>(null);
  const firstHi = prices.findIndex((p) => hi(p));
  const pickIdx = pick != null ? prices.indexOf(pick) : -1;
  useEffect(() => {
    const el = scrollerRef.current;
    const idx = pickIdx >= 0 ? pickIdx : firstHi;
    if (el && idx > 0) el.scrollLeft = Math.max(0, (idx - 1) * PRICE_COL_W);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록·권장 구간이 바뀔 때만
  }, [rec.id, firstHi]);
  const iceCost = brewCost(rec, doses.ice.doseG);
  const hotCost = brewCost(rec, doses.hot.doseG);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {!compact && (
        <div style={{ position: 'relative', paddingRight: onDismiss ? 36 : 0 }}>
          {onDismiss && (
            <button
              onClick={onDismiss}
              disabled={busy}
              aria-label={`${rec.bean} 미책정 목록에서 숨기기`}
              title="미책정 목록에서 숨기기 (기록은 남고, 14일 안에 아래 '숨긴 원두'에서 다시 보이기 가능)"
              className="text-muted-foreground hover:text-foreground"
              style={{ position: 'absolute', top: 0, right: 0, width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
            >
              <span className="text-title">×</span>
            </button>
          )}
          <p className="text-body text-foreground" style={{ margin: 0 }}>
            {rec.bean}
            {rec.roastery && <span className="text-caption text-muted-foreground"> · {rec.roastery}</span>}
          </p>
          <p className="text-caption text-muted-foreground tabular" style={{ margin: '2px 0 0' }}>
            {fmtDate(rec.createdAt)}
            {(rec.staffName || rec.createdBy) && ` · ${rec.staffName ? `${rec.staffName}님 발주` : rec.createdBy!.split('@')[0]}`}
            {` · 매입 ${won(rec.purchasePrice)}`}
            {rec.settings?.vatIncluded && 'ㆍVAT포함'}
            {` · 재료비 ${won(cost)}(${baseDose}g 기준)`}
            {rec.store && ` · ${rec.store === 'pangyo' ? '판교' : '양재천'}`}
            {orderButton && <span style={{ marginLeft: 10 }}>{orderButton}</span>}
          </p>
        </div>
      )}

      {/* 판매가 후보 표 (가로 스와이프) — 500원 단위 판매가 · 재료비율(평균 도징 기준 · ICE · HOT). 배수 줄은 2026-11-03 폐지 */}
      <div ref={scrollerRef} className="rounded-md border border-border" style={{ overflowX: 'auto', fontSize: 13, WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `52px repeat(${prices.length}, ${PRICE_COL_W}px)`,
            minWidth: 'max-content',
          }}
        >
          <Cell label>판매가</Cell>
          {prices.map((p) => (
            <Cell key={`p${p}`} pos="top" hi={hi(p)} selected={pick === p} onClick={() => onPick(p)}>
              {won(p)}
            </Cell>
          ))}

          <Cell label>재료비율</Cell>
          {prices.map((p) => (
            <Cell key={`m${p}`} pos="mid" hi={hi(p)} selected={pick === p} onClick={() => onPick(p)}>
              {Math.round((cost / p) * 100)}%
            </Cell>
          ))}

          {/* 원가율 — ICE·HOT 레시피 도징량별 잔당 재료비 ÷ 판매가(VAT 포함) (2026-11-03) */}
          <Cell label>ICE</Cell>
          {prices.map((p) => (
            <Cell key={`ri${p}`} pos="mid" hi={hi(p)} muted selected={pick === p} onClick={() => onPick(p)}>
              {Math.round((iceCost / p) * 100)}%
            </Cell>
          ))}
          <Cell label>HOT</Cell>
          {prices.map((p) => (
            <Cell key={`rh${p}`} pos="bottom" hi={hi(p)} muted selected={pick === p} onClick={() => onPick(p)}>
              {Math.round((hotCost / p) * 100)}%
            </Cell>
          ))}
        </div>
      </div>
      <p className="text-caption text-muted-foreground" style={{ margin: 0 }}>
        초록 칸 = 권장 판매가
        {band
          ? `(재료비율 ${ratioRangeLabel(band.lo, band.hi)}, 아래 참고표 재료비 ${bandRow.toLocaleString('ko-KR')}원 행 기준)`
          : `(참고표 재료비 ${bandRow.toLocaleString('ko-KR')}원 행에 권장 칸 없음)`}{' '}
        · 500원 단위 · 판매가를 클릭해 고르세요 · 재료비율 = 잔당 재료비 ÷ 판매가(VAT 포함), 기준은 ICE·HOT 평균 {baseDose}g {won(cost)} — ICE {doses.ice.doseG}g {won(iceCost)}
        {doses.ice.fromRecipe ? '' : '(기준값)'} · HOT {doses.hot.doseG}g {won(hotCost)}
        {doses.hot.fromRecipe ? '' : '(기준값)'}
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => pick != null && onDecide(pick)}
          disabled={busy || pick == null}
          className="ta-btn-primary"
          style={{ flex: 1 }}
        >
          {busy
            ? '저장 중…'
            : pick != null
              ? `판매가 ${won(pick)} 확정`
              : '판매가를 선택하세요'}
        </button>
        {onClear && (
          <button onClick={onClear} disabled={busy} className="ta-btn" style={{ flexShrink: 0 }}>
            책정 해제
          </button>
        )}
      </div>
    </div>
  );
}

function Cell({
  children,
  label,
  hi,
  muted,
  selected,
  onClick,
  pos,
}: {
  children: React.ReactNode;
  label?: boolean;
  hi?: boolean;
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
    fontSize: label || muted ? 11 : 13,
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
    // 세 칸의 바깥 테두리만 강조(투명 연두) 2px → 한 박스처럼, 모서리 라운드 + 옅은 채움
    const B = `2px solid ${SELECT_BORDER}`;
    style.backgroundColor = SELECT_FILL;
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
  // 배수 선택이 이 화면의 핵심 동작이라 키보드로도 고를 수 있게 한다 (마우스 전용 div 방지)
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className="tabular"
      style={style}
    >
      {children}
    </div>
  );
}
