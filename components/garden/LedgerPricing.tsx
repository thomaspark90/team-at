'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DripRecipe, PurchaseRecord } from '@/lib/types';
import { normalize } from '@/lib/pricing';
import { currentCost, currentDoseG, dosesForBean } from '@/lib/garden/brew-cost';
import { defaultActiveCells, type ActiveCells } from '@/lib/garden/price-bands';
import { fmtDate } from '@/lib/garden/format';
import { fetchMyAccess } from '@/lib/access/tab-access-client';
import { toast } from '@/components/Toast';
import StorePriceLines from './StorePriceLines';
import PricePicks from './PricePicks';
import PriceBandGuide from './PriceBandGuide';

// 원두 장부(필터커피) 줄 펼침의 '판매가' 블록 — 2026-11-24 판매가 설정 화면을 장부로 옮겨 왔다.
// 원두의 최신 발주 기록 기준으로 양재천·판교 판매가와 재료비율을 보여주고(누구나),
// 판매가(saleprice) 권한 계정은 그 자리에서 책정·변경·해제·공유한다. 실제 권한 검증은 서버(PATCH /api/purchases).
// 금액은 VAT 포함 소비자가, 재료비는 ICE·HOT 평균 도징 기준 잔당 금액, 판교 = 양재천 −1,000원.

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export function useLedgerPricing({
  enabled,
  purchases,
  recipes,
  onChanged,
}: {
  enabled: boolean; // 장부 화면에서만 켠다
  purchases: PurchaseRecord[];
  recipes: DripRecipe[];
  onChanged: (rec: PurchaseRecord) => void;
}): { block: (beanKey: string, opts?: { readOnly?: boolean }) => ReactNode } {
  const [canEdit, setCanEdit] = useState(false);
  // 권장(초록) 칸 — 참고표와 같은 저장값. 참고표를 펼쳐 칸을 바꾸면 onChange 로 따라온다
  const [bandCells, setBandCells] = useState<ActiveCells>(defaultActiveCells);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null); // 책정된 기록의 [변경] 펼침
  const [guideFor, setGuideFor] = useState<string | null>(null); // 가격대 참고표를 펼친 원두
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    fetchMyAccess().then((a) => {
      const ok = a.mine == null || a.mine.includes('saleprice');
      setCanEdit(ok);
      if (!ok) return;
      fetch('/api/garden-price-bands', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.cells && setBandCells(j.cells))
        .catch(() => {});
    });
  }, [enabled]);

  // 원두별 최신 발주 기록 — 장부 줄의 판매가와 같은 기록
  const latestByBean = useMemo(() => {
    const m = new Map<string, PurchaseRecord>();
    for (const r of purchases) {
      const k = normalize(r.bean);
      const cur = m.get(k);
      if (!cur || r.createdAt.localeCompare(cur.createdAt) > 0) m.set(k, r);
    }
    return m;
  }, [purchases]);

  // 판매가 확정/해제 — 서버가 단위(500원)·권한을 검증하고 실제 배수를 함께 기록한다
  const decide = async (rec: PurchaseRecord, price: number | null) => {
    if (busyId) return;
    setBusyId(rec.id);
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(price == null ? { id: rec.id, chosenMult: null } : { id: rec.id, chosenPrice: price }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '판매가 저장에 실패했어요.');
      onChanged(j);
      setPicks((p) => {
        const { [rec.id]: _, ...rest } = p;
        return rest;
      });
      setOpenId(null);
      toast(price == null ? '판매가 책정을 해제했어요.' : `판매가 ${won(price)}으로 저장했어요.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '판매가 저장에 실패했어요.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // 판매가 공유 링크 → 모바일은 공유시트, 그 외 클립보드 복사 (카톡방 공지용)
  const share = async (rec: PurchaseRecord) => {
    if (sharingId) return;
    setSharingId(rec.id);
    try {
      const res = await fetch('/api/garden-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: rec.id }),
      });
      if (!res.ok) {
        toast('공유 링크 생성에 실패했어요. 잠시 후 다시 시도해주세요.', 'error');
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

  const block = (beanKey: string, opts?: { readOnly?: boolean }): ReactNode => {
    const rec = latestByBean.get(beanKey);
    if (!rec) return null;
    const editable = canEdit && !opts?.readOnly;
    const priced = rec.chosenPrice != null && rec.chosenPrice > 0;
    const pricerOpen = editable && (!priced || openId === rec.id);
    const guideOpen = editable && guideFor === beanKey;
    return (
      <div className={`min-w-0 ${opts?.readOnly ? 'text-caption' : 'text-body'}`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px 18px', flexWrap: 'wrap' }}>
          {priced ? (
            <StorePriceLines rec={rec} recipes={recipes} />
          ) : (
            <span className="tabular text-muted-foreground">
              아직 책정 전 · 잔당 재료비 {won(currentCost(recipes, rec))} ({currentDoseG(recipes, beanKey)}g 기준)
              {!editable && !opts?.readOnly && ' · 판매가 담당자가 책정해요'}
            </span>
          )}
          {editable && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 18 }}>
              {priced && (
                <button onClick={() => share(rec)} className="fc-txt" title="판매가 공유 링크 (카톡방 공지용)">
                  {copiedId === rec.id ? '링크 복사됨 ✓' : sharingId === rec.id ? '…' : '공유'}
                </button>
              )}
              {priced && (
                <button onClick={() => setOpenId(openId === rec.id ? null : rec.id)} className={`fc-txt ${openId === rec.id ? 'on' : ''}`}>
                  {openId === rec.id ? '접기' : '변경'}
                </button>
              )}
              <button onClick={() => setGuideFor(guideOpen ? null : beanKey)} className={`fc-txt ${guideOpen ? 'on' : ''}`}>
                가격대 참고표 {guideOpen ? '▴' : '▾'}
              </button>
            </span>
          )}
        </div>
        {rec.priceReview && (
          <p className="text-caption" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>
            ⚠ 레시피 담당자가 재검토를 요청했어요 · {fmtDate(rec.priceReview.at)}
            {rec.priceReview.note ? ` · ${rec.priceReview.note}` : ''}
          </p>
        )}
        {pricerOpen && (
          <div style={{ minWidth: 0 }}>
            <PricePicks
              rec={rec}
              doses={dosesForBean(recipes, beanKey)}
              pick={picks[rec.id] ?? rec.chosenPrice ?? null}
              bandCells={bandCells}
              onPick={(p) => setPicks((cur) => ({ ...cur, [rec.id]: p }))}
              onDecide={(p) => decide(rec, p)}
              onClear={priced ? () => decide(rec, null) : undefined}
              busy={busyId === rec.id}
            />
          </div>
        )}
        {guideOpen && (
          <div style={{ minWidth: 0 }}>
            <PriceBandGuide onChange={setBandCells} />
          </div>
        )}
      </div>
    );
  };

  return { block };
}
