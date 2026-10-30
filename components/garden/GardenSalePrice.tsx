'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PurchaseRecord } from '@/lib/types';
import { PRICE_UNIT, normalize, roundUpPrice } from '@/lib/pricing';
import { fmtDate } from '@/lib/garden/format';
import PriceBandGuide from './PriceBandGuide';
import { bandRange, defaultActiveCells, guideRowForCost, type ActiveCells } from '@/lib/garden/price-bands';

// 판매가 설정 전용 화면 — 발주(GardenService)에서 저장된 기록의 판매가를 책정·공유한다.
// 발주와 권한이 분리돼 있어(saleprice 탭) 책정 담당자만 이 화면을 쓴다.

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
const FALLBACK_BAND = { lo: 4, hi: 5.5 }; // 참고표 행에 권장 칸이 하나도 없을 때
const EPS = 1e-9;
// 권장 배수 강조 — 하단 참고표의 초록 칸과 같은 색 (재료비 행 기준, 2026-10-30)
const HIGHLIGHT = 'rgba(132, 204, 22, 0.16)';
// 선택 칸 강조 — 연두(라임). 투명도를 높여 뒤 텍스트 가독 유지. 라이트/다크 공통 리터럴.
const SELECT_BORDER = 'rgba(132, 204, 22, 0.55)';
const SELECT_FILL = 'rgba(132, 204, 22, 0.14)';


export default function GardenSalePrice() {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 기록별 판매가 선택 상태(500원 단위 후보) — 확정(PATCH) 전까지는 로컬에만 둔다
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null); // 책정 완료 기록의 '변경' 펼침
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showDismissed, setShowDismissed] = useState(false); // X로 숨긴 미책정 원두 펼침
  // 하단 참고표의 권장 칸 상태 — 참고표가 불러오거나 클릭으로 바꾸면 onChange 로 갱신된다
  const [bandCells, setBandCells] = useState<ActiveCells>(defaultActiveCells);

  const refresh = async () => {
    const res = await fetch('/api/purchases', { cache: 'no-store' });
    if (res.ok) setPurchases(await res.json());
    setLoaded(true);
  };
  useEffect(() => {
    refresh();
  }, []);

  // 판매가 확정/해제 — 판매가는 서버가 당시 설정 스냅샷 산식으로 다시 계산해 확정한다
  const decide = async (rec: PurchaseRecord, price: number | null) => {
    if (busyId) return;
    setBusyId(rec.id);
    setError('');
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // 판매가 직접 확정 — 서버가 단위 검증 후 실제 배수(판매가÷재료비)를 함께 기록. null 이면 책정 해제
        body: JSON.stringify(price == null ? { id: rec.id, chosenMult: null } : { id: rec.id, chosenPrice: price }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '판매가 저장에 실패했어요.');
      setPurchases((prev) => prev.map((r) => (r.id === rec.id ? j : r)));
      setPicks((p) => {
        const { [rec.id]: _, ...rest } = p;
        return rest;
      });
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매가 저장에 실패했어요.');
    } finally {
      setBusyId(null);
    }
  };

  // 미책정 목록에서 숨기기(X)/다시 보이기 — 기록은 남기고 대기열에서만 뺀다
  const setDismissed = async (rec: PurchaseRecord, dismissed: boolean) => {
    if (busyId) return;
    setBusyId(rec.id);
    setError('');
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, dismissed }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '저장에 실패했어요.');
      setPurchases((prev) => prev.map((r) => (r.id === rec.id ? j : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했어요.');
    } finally {
      setBusyId(null);
    }
  };

  // 판매가 공유 링크 생성 → 모바일은 공유시트, 그 외 클립보드 복사 (카톡방 공지용)
  const sharePurchase = async (rec: PurchaseRecord) => {
    if (sharingId) return;
    setSharingId(rec.id);
    try {
      const res = await fetch('/api/garden-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: rec.id }),
      });
      if (!res.ok) {
        // 실패를 조용히 삼키면 링크가 복사된 줄 알게 된다 — 카드 상단 에러로 알린다
        setError('공유 링크 생성에 실패했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
      const { url } = await res.json();
      const title = `${rec.bean} — 판매가 ${rec.chosenPrice != null ? won(rec.chosenPrice) : ''}`;
      if (navigator.share) {
        await navigator.share({ title, url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        setCopiedId(rec.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } finally {
      setSharingId(null);
    }
  };

  // 미책정 = 판매가가 아직 없는 발주 기록 — 이 화면의 작업 대기열 (최신 발주부터)
  const unpriced = useMemo(
    () =>
      purchases
        .filter((r) => r.chosenPrice == null && !r.priceDismissed)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [purchases]
  );
  // X로 숨긴 미책정 기록 — 하단 '숨긴 원두'에서 다시 보이기
  const dismissed = useMemo(
    () =>
      purchases
        .filter((r) => r.chosenPrice == null && r.priceDismissed)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [purchases]
  );

  // 책정 완료 — 원두별 그룹(각 그룹 최신순), 그룹은 최근 기록순 (발주 화면과 같은 배치)
  const pricedGroups = useMemo(() => {
    const m = new Map<string, PurchaseRecord[]>();
    for (const r of purchases) {
      if (r.chosenPrice == null) continue;
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

  // 카드 우측 상단 공유 대상 — 판매가가 책정된 가장 최근 기록
  const latestPriced = useMemo(
    () =>
      purchases
        .filter((r) => r.chosenPrice != null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [purchases]
  );

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {error && (
        <p className="ta-error text-body" style={{ margin: '0 0 16px' }}>
          {error}
        </p>
      )}

      <div className="divide-y divide-border">
      {/* 판매가 미책정 — 발주 담당이 저장한 기록 중 책정 대기 건 */}
      <div className="min-w-0 pb-[54px]">
        <p className="ta-label">판매가 미책정</p>
        {!loaded ? (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>불러오는 중…</p>
        ) : unpriced.length === 0 ? (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            책정을 기다리는 발주 기록이 없어요. 발주가 저장되면 여기에 나타납니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {unpriced.map((rec) => (
              <RecordPricer
                key={rec.id}
                rec={rec}
                pick={picks[rec.id] ?? null}
                bandCells={bandCells}
                onPick={(m) => setPicks((p) => ({ ...p, [rec.id]: m }))}
                onDecide={(m) => decide(rec, m)}
                onDismiss={() => setDismissed(rec, true)}
                busy={busyId === rec.id}
              />
            ))}
          </div>
        )}
        {dismissed.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setShowDismissed((v) => !v)}
              className="text-caption text-muted-foreground hover:text-foreground"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              숨긴 원두 {dismissed.length}건 {showDismissed ? '접기' : '보기'}
            </button>
            {showDismissed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {dismissed.map((rec) => (
                  <div key={rec.id} className="gs-row">
                    <span className="text-body text-muted-foreground" style={{ minWidth: 0 }}>
                      {rec.bean}
                      <span className="text-caption tabular"> · {fmtDate(rec.createdAt)} · 재료비 {won(rec.costPerCup)}</span>
                    </span>
                    <button
                      onClick={() => setDismissed(rec, false)}
                      disabled={busyId === rec.id}
                      className="text-muted-foreground hover:text-foreground"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                    >
                      다시 보이기
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 책정 완료 — 판매가 확인·공유·재책정 */}
      {pricedGroups.length > 0 && (
        <div className="min-w-0 pt-[54px]">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p className="ta-label">책정 완료</p>
            {latestPriced && (
              <button
                onClick={() => sharePurchase(latestPriced)}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                title={`최근 책정 판매가 공유 — ${latestPriced.bean} (카톡방 공지용)`}
              >
                {copiedId === latestPriced.id ? '링크 복사됨 ✓' : sharingId === latestPriced.id ? '…' : '공유'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {pricedGroups.map((group) => (
              <div key={group[0].id}>
                <p className="text-body text-foreground mb-3">
                  {group[0].bean}
                  {group[0].roastery && (
                    <span className="text-caption text-muted-foreground"> · {group[0].roastery}</span>
                  )}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {group.map((rec) => (
                    <div key={rec.id}>
                      <div className="gs-row">
                        <span className="gs-meta">
                          <span className="tabular text-muted-foreground" style={{ width: 64, flexShrink: 0 }}>{fmtDate(rec.createdAt)}</span>
                          <span className="tabular text-muted-foreground" style={{ flexShrink: 0 }}>재료비 {won(rec.costPerCup)}</span>
                        </span>
                        <span className="gs-price">
                          <span className="tabular text-foreground">
                            책정 판매가 {won(rec.chosenPrice!)}
                            <span className="text-muted-foreground"> ({Math.round((rec.costPerCup / rec.chosenPrice!) * 100)}%)</span>
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            setOpenId(openId === rec.id ? null : rec.id);
                            setError('');
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                        >
                          {openId === rec.id ? '접기' : '변경'}
                        </button>
                      </div>
                      {rec.priceReview && (
                        <p className="text-caption" style={{ margin: '4px 0 0', color: 'hsl(0 72% 45%)' }}>
                          ⚠ 레시피 담당자가 재검토를 요청했어요 · {fmtDate(rec.priceReview.at)}
                          {rec.priceReview.note ? ` · ${rec.priceReview.note}` : ''}
                        </p>
                      )}
                      {openId === rec.id && (
                        <div style={{ marginTop: 8 }}>
                          <RecordPricer
                            rec={rec}
                            pick={picks[rec.id] ?? rec.chosenPrice}
                            bandCells={bandCells}
                            onPick={(m) => setPicks((p) => ({ ...p, [rec.id]: m }))}
                            onDecide={(m) => decide(rec, m)}
                            onClear={() => decide(rec, null)}
                            busy={busyId === rec.id}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 참고표 — 재료비 구간별 권장 배수 (고가 원두는 배수를 낮춘다) */}
      <div className="min-w-0 pt-[54px]">
        <PriceBandGuide onChange={setBandCells} />
      </div>
      </div>
    </div>
  );
}

// 발주 기록 1건의 책정 UI — 기록 요약 + 배수 스프레드 표 + 확정 버튼
function RecordPricer({
  rec,
  pick,
  bandCells,
  onPick,
  onDecide,
  onClear,
  onDismiss,
  busy,
  compact,
}: {
  rec: PurchaseRecord;
  pick: number | null;
  bandCells: ActiveCells;
  onPick: (m: number) => void;
  onDecide: (m: number) => void;
  onClear?: () => void;
  onDismiss?: () => void; // 미책정 목록에서 숨기기(X)
  busy: boolean;
  compact?: boolean; // 책정 완료 목록 안 재책정 — 요약줄 생략
}) {
  // 권장 배수 = 참고표에서 이 기록 재료비가 속한 행의 초록 칸 범위(최솟값~최댓값)
  const cost = rec.costPerCup;
  const bandRow = guideRowForCost(cost);
  const band = bandRange(bandCells[String(bandRow)] ?? []);
  const { lo, hi: top } = band ?? FALLBACK_BAND;
  // 판매가 후보 — 권장 구간 양옆까지 500원 단위. 기존 책정가가 범위 밖·단위 밖이면 함께 보여준다
  const prices: number[] = [];
  if (cost > 0) {
    const last = roundUpPrice(cost * (top + SPREAD_ABOVE));
    for (let p = roundUpPrice(cost * Math.max(1, lo - SPREAD_BELOW)); p <= last; p += PRICE_UNIT) prices.push(p);
  }
  if (pick != null && !prices.includes(pick)) {
    prices.push(pick);
    prices.sort((a, b) => a - b);
  }
  const multOf = (p: number) => (cost > 0 ? p / cost : 0);
  const hi = (p: number) => band != null && multOf(p) >= band.lo - EPS && multOf(p) <= band.hi + EPS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {!compact && (
        <div style={{ position: 'relative', paddingRight: onDismiss ? 36 : 0 }}>
          {onDismiss && (
            <button
              onClick={onDismiss}
              disabled={busy}
              aria-label={`${rec.bean} 미책정 목록에서 숨기기`}
              title="미책정 목록에서 숨기기 (기록은 남고, 아래 '숨긴 원두'에서 다시 보이기)"
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
            {` · 재료비 ${won(rec.costPerCup)}`}
          </p>
        </div>
      )}

      {/* 판매가 후보 표 (가로 스와이프) — 500원 단위 판매가 · 실제 배수 · 원가율 */}
      <div className="rounded-md border border-border" style={{ overflowX: 'auto', fontSize: 13, WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `52px repeat(${prices.length}, 76px)`,
            minWidth: 'max-content',
          }}
        >
          <Cell label>판매가</Cell>
          {prices.map((p) => (
            <Cell key={`p${p}`} pos="top" hi={hi(p)} selected={pick === p} onClick={() => onPick(p)}>
              {won(p)}
            </Cell>
          ))}

          <Cell label>배수</Cell>
          {prices.map((p) => (
            <Cell key={`m${p}`} pos="mid" hi={hi(p)} selected={pick === p} onClick={() => onPick(p)}>
              {multOf(p).toFixed(2)}×
            </Cell>
          ))}

          <Cell label>원가율</Cell>
          {prices.map((p) => (
            <Cell key={`r${p}`} pos="bottom" hi={hi(p)} muted selected={pick === p} onClick={() => onPick(p)}>
              {Math.round((cost / p) * 100)}%
            </Cell>
          ))}
        </div>
      </div>
      <p className="text-caption text-muted-foreground" style={{ margin: 0 }}>
        초록 칸 = 권장 판매가
        {band
          ? `(실제 배수 ${band.lo.toFixed(2)}~${band.hi.toFixed(2)}×, 아래 참고표 재료비 ${bandRow.toLocaleString('ko-KR')}원 행 기준)`
          : `(참고표 재료비 ${bandRow.toLocaleString('ko-KR')}원 행에 권장 칸 없음)`}{' '}
        · 500원 단위 · 판매가를 클릭해 고르세요
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
