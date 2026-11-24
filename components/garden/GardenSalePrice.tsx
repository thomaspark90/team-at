'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DripRecipe, PurchaseRecord } from '@/lib/types';
import { normalize } from '@/lib/pricing';
import { fmtDate } from '@/lib/garden/format';
import PriceBandGuide from './PriceBandGuide';
import StorePriceLines from './StorePriceLines';
import { useKakaoOrder } from './KakaoOrder';
import { currentCost, dosesForBean } from '@/lib/garden/brew-cost';
import RecordPricer from './RecordPricer';
import { defaultActiveCells, type ActiveCells } from '@/lib/garden/price-bands';

// 판매가 설정 전용 화면 — 발주(GardenService)에서 저장된 기록의 판매가를 책정·공유한다.
// 발주와 권한이 분리돼 있어(saleprice 탭) 책정 담당자만 이 화면을 쓴다.

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
// 숨긴 원두는 이 기간 안에 다시 보이기를 안 하면 '숨긴 원두' 목록에서도 빠진다 (기록은 유지)
const DISMISS_KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const dismissDaysLeft = (rec: PurchaseRecord) =>
  rec.priceDismissed ? Math.ceil((Date.parse(rec.priceDismissed.at) + DISMISS_KEEP_DAYS * DAY_MS - Date.now()) / DAY_MS) : 0;


export default function GardenSalePrice() {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 기록별 판매가 선택 상태(500원 단위 후보) — 확정(PATCH) 전까지는 로컬에만 둔다
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null); // 책정 완료 기록의 '변경' 펼침
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); // 같은 원두 중복 기록 삭제 — 한 번 더 확인
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showDismissed, setShowDismissed] = useState(false); // X로 숨긴 미책정 원두 펼침
  // 하단 참고표의 권장 칸 상태 — 참고표가 불러오거나 클릭으로 바꾸면 onChange 로 갱신된다
  const [bandCells, setBandCells] = useState<ActiveCells>(defaultActiveCells);
  // 발주 카톡 — 발주 권한 없는 스탭(판교)이 저장한 원두를 판매가 정하면서 바로 보낼 수 있게 (2026-11-03)
  const kakao = useKakaoOrder();

  const refresh = async () => {
    const res = await fetch('/api/purchases', { cache: 'no-store' });
    if (res.ok) setPurchases(await res.json());
    setLoaded(true);
  };
  useEffect(() => {
    refresh();
  }, []);

  // ICE·HOT 원가율용 레시피 도징량 — 레시피가 없으면 산식 기준값(ICE 20g · HOT 18g). 실패해도 기준값으로 표시
  const [recipes, setRecipes] = useState<DripRecipe[]>([]);
  useEffect(() => {
    fetch('/api/garden-recipes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setRecipes(Array.isArray(j) ? j : []))
      .catch(() => {});
  }, []);
  const dosesOf = (rec: PurchaseRecord) => dosesForBean(recipes, normalize(rec.bean));
  // 판단 기준 재료비 — ICE·HOT 도징 중간값 기준 (2026-11-03 대표 결정, 기록 당시 costPerCup(공통 20g) 대신)
  const baseCostOf = (rec: PurchaseRecord) => currentCost(recipes, rec);

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

  // 같은 원두에 기록이 여러 건일 때 하나 지우기 — 발주 기록 자체를 지운다(발주 화면에서도 사라지고 되돌릴 수 없음)
  const deleteRecord = async (rec: PurchaseRecord) => {
    if (busyId) return;
    setBusyId(rec.id);
    setError('');
    try {
      const res = await fetch('/api/purchases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? '삭제에 실패했어요.');
      setPurchases((prev) => prev.filter((r) => r.id !== rec.id));
      setConfirmDeleteId(null);
      if (openId === rec.id) setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했어요.');
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
  // X로 숨긴 미책정 기록 — 하단 '숨긴 원두'에서 다시 보이기 (숨긴 지 14일 지나면 목록에서도 뺀다)
  const dismissed = useMemo(
    () =>
      purchases
        .filter((r) => r.chosenPrice == null && r.priceDismissed && dismissDaysLeft(r) > 0)
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
                doses={dosesOf(rec)}
                pick={picks[rec.id] ?? null}
                bandCells={bandCells}
                onPick={(m) => setPicks((p) => ({ ...p, [rec.id]: m }))}
                onDecide={(m) => decide(rec, m)}
                onDismiss={() => setDismissed(rec, true)}
                busy={busyId === rec.id}
                orderButton={kakao.button(rec)}
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
                      <span className="text-caption tabular"> · {fmtDate(rec.createdAt)} · 재료비 {won(baseCostOf(rec))}</span>
                    </span>
                    <span className="text-caption text-muted-foreground tabular" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      {dismissDaysLeft(rec)}일 남음
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
                        </span>
                        {/* 책정 판매가 — 양재천·판교 따로(판교 = 양재천 −1,000원), 재료비는 지점 레시피 도징 기준 */}
                        <span className="gs-price">
                          <StorePriceLines rec={rec} recipes={recipes} />
                        </span>
                        {kakao.button(rec)}
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
                        {/* 같은 원두에 기록이 2건 이상일 때만 — 하나 남은 기록은 여기서 지우지 않는다 */}
                        {group.length > 1 && confirmDeleteId !== rec.id && (
                          <button
                            onClick={() => setConfirmDeleteId(rec.id)}
                            className="text-muted-foreground hover:text-foreground"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                            title="이 발주 기록 삭제"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      {confirmDeleteId === rec.id && (
                        <p className="text-caption" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, margin: '4px 0 0' }}>
                          <span className="text-muted-foreground">
                            판매가 {won(rec.chosenPrice!)} 기록을 삭제할까요? 발주 화면에서도 사라지고 되돌릴 수 없어요.
                          </span>
                          <button
                            onClick={() => deleteRecord(rec)}
                            disabled={busyId === rec.id}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'hsl(0 72% 45%)', fontFamily: 'inherit', fontSize: 'inherit' }}
                          >
                            {busyId === rec.id ? '삭제 중…' : '삭제'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-muted-foreground hover:text-foreground"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
                          >
                            취소
                          </button>
                        </p>
                      )}
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
                            doses={dosesOf(rec)}
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

      {/* 참고표 — 재료비 구간별 권장 재료비율 (고가 원두는 재료비율을 높여 판매가를 누른다) */}
      <div className="min-w-0 pt-[54px]">
        <PriceBandGuide onChange={setBandCells} />
      </div>
      {kakao.modal}
      </div>
    </div>
  );
}
