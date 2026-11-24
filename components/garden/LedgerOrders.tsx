'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DripRecipe, PurchaseRecord } from '@/lib/types';
import { currentCost, currentRange } from '@/lib/garden/brew-cost';
import { normalize } from '@/lib/pricing';
import { fmtDate } from '@/lib/garden/format';
import { receiveTodo } from '@/lib/garden/receive';
import { fetchMyAccess } from '@/lib/access/tab-access-client';
import { toast } from '@/components/Toast';
import { useKakaoOrder } from './KakaoOrder';
import BeanReceiveDialog from './BeanReceiveDialog';

// 원두 장부(필터커피) 줄 펼침의 '발주 기록' — 2026-11-24 발주 화면의 '이전 발주 리스트'를 옮겨 왔다.
// 한 원두의 발주 건을 최신순으로 보여주고, 건마다 수령·카톡 발주(직접 발주 완료)·원두카드·삭제를 한다.
// 데이터(발주 기록·레시피)는 장부(GardenDashboard)가 들고 있고, 여기는 발주 건 단위 조작과 그 창(수령·발주 미리보기)만 맡는다.

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export function useLedgerOrders({
  enabled,
  purchases,
  recipes,
  onChanged,
  onDeleted,
  receiveId = null,
}: {
  enabled: boolean; // 장부 화면에서만 켠다 — 홈(미설정 원두 카드)에서는 불필요한 조회를 하지 않는다
  purchases: PurchaseRecord[];
  recipes: DripRecipe[];
  onChanged: (rec: PurchaseRecord) => void; // 수령·영문명 확정 등으로 기록이 바뀜
  onDeleted: (id: string) => void;
  receiveId?: string | null; // 홈의 수령 카드에서 넘어오면(?receive=<id>) 그 발주의 수령 창을 바로 연다
}): { history: (beanKey: string, opts?: { readOnly?: boolean }) => ReactNode; overlays: ReactNode } {
  const kakao = useKakaoOrder(enabled);
  const [receivingId, setReceivingId] = useState<string | null>(receiveId);
  const [deleting, setDeleting] = useState<string | null>(null);
  // [수령]을 누를 수 있는지 — 설정 › '원두 수령 담당'이 지정돼 있으면 그 사람들만 (서버가 판정)
  const [canReceive, setCanReceive] = useState(true);
  // 발주 기록 삭제 — 발주(pricing) 탭 권한. 실제 검증은 서버
  const [canOrder, setCanOrder] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    fetch('/api/purchases/receive', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setCanReceive(j.allowed !== false))
      .catch(() => {});
    fetchMyAccess().then((a) => setCanOrder(a.mine == null || a.mine.includes('pricing')));
  }, [enabled]);

  // 원두별 발주 건 — 최신순
  const byBean = useMemo(() => {
    const m = new Map<string, PurchaseRecord[]>();
    for (const r of purchases) {
      const k = normalize(r.bean);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    m.forEach((rs) => rs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    return m;
  }, [purchases]);

  const receiving = useMemo(() => purchases.find((r) => r.id === receivingId) ?? null, [purchases, receivingId]);

  const remove = async (rec: PurchaseRecord) => {
    if (deleting) return;
    if (!window.confirm(`'${rec.bean}' ${fmtDate(rec.orderDate ?? rec.createdAt)} 발주 기록을 삭제할까요?`)) return;
    setDeleting(rec.id);
    try {
      const res = await fetch('/api/purchases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast(j?.error ?? '삭제하지 못했어요.', 'error');
        return;
      }
      onDeleted(rec.id);
    } finally {
      setDeleting(null);
    }
  };

  // readOnly — 아카이브 카드용: 기록만 보여주고 수령·발주·삭제는 숨긴다(원두카드 링크만 남긴다)
  const history = (beanKey: string, opts?: { readOnly?: boolean }): ReactNode => {
    const ro = !!opts?.readOnly;
    const can = canReceive && !ro;
    const group = byBean.get(beanKey) ?? [];
    if (group.length === 0) return null;
    return (
      <div className={`min-w-0 ${ro ? 'text-caption' : 'text-body'}`}>
        {group.length > 1 && (
          <p className="text-caption text-muted-foreground" style={{ margin: '0 0 10px' }}>
            {group.length}건 · 재료비는 지금 레시피 도징 기준
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {group.map((rec, i) => {
            const older = group[i + 1];
            const cost = currentCost(recipes, rec);
            const delta = older ? cost - currentCost(recipes, older) : 0;
            const range = currentRange(recipes, rec);
            const todo = receiveTodo(rec);
            return (
              // 왼쪽 = 기록(날짜 · 지점·담당 · 원가 · 재료비 · 판매가), 오른쪽 = 글자 버튼(수령 · 발주 · 카드 · 삭제)
              <div
                key={rec.id}
                className={i > 0 ? 'fc-shade-t' : ''}
                style={{ display: 'flex', alignItems: 'baseline', gap: '6px 18px', flexWrap: 'wrap', padding: i > 0 ? '12px 0 0' : 0, marginTop: i > 0 ? 12 : 0 }}
              >
                <span className="tabular text-muted-foreground" style={{ display: 'flex', alignItems: 'baseline', gap: '4px 18px', flexWrap: 'wrap', minWidth: 0 }}>
                  <span className="font-medium text-foreground">{fmtDate(rec.orderDate ?? rec.createdAt)}</span>
                  {/* 스탭이름이 있으면 'OOO님' 우선, 없으면 저장 계정(구 기록) */}
                  {(rec.store || rec.staffName || rec.createdBy) && (
                    <span>
                      {[
                        rec.store ? (rec.store === 'pangyo' ? '판교' : '양재천') : null,
                        rec.staffName ? `${rec.staffName}님` : rec.createdBy ? rec.createdBy.split('@')[0] : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                  {/* VAT 포함가로 입력한 기록만 '포함' — 그 밖(구 기록 포함)은 별도 */}
                  <span>
                    원가 {won(rec.purchasePrice)} · VAT {rec.settings?.vatIncluded ? '포함' : '별도'}
                  </span>
                  <span>
                    재료비 {won(cost)}
                    {older && delta !== 0 && (
                      <span style={{ marginLeft: 4 }}>
                        {delta > 0 ? '▲' : '▼'}
                        {won(Math.abs(delta))}
                      </span>
                    )}
                  </span>
                  {rec.chosenPrice != null && rec.chosenPrice > 0 ? (
                    <span>
                      판매가 {won(rec.chosenPrice)} ({Math.round((cost / rec.chosenPrice) * 100)}%)
                    </span>
                  ) : (
                    <span>
                      권장 {won(range.low)}~{won(range.high)}
                    </span>
                  )}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
                  {/* 수령 — 로스팅 날짜·영문명 확정. 남은 게 있으면 진한 글자, 다 끝났으면 날짜(눌러서 수정) */}
                  <button
                    onClick={() => setReceivingId(rec.id)}
                    disabled={!can}
                    className={`fc-txt tabular ${todo.done || !can ? '' : 'on'}`}
                    title={
                      !can
                        ? '수령 담당자로 지정된 사람만 기재할 수 있어요 (설정 › 원두 수령 담당)'
                        : todo.done
                          ? `영문명 ${rec.beanEn} — 눌러서 수정·원두카드 다시 요청`
                          : '수령 — 봉투의 로스팅 날짜·영문명 확정 → 원두카드 요청'
                    }
                  >
                    {rec.roastDate ? `로스팅 ${fmtDate(rec.roastDate)}` : can ? '수령' : '수령 전'}
                    {rec.roastDate && todo.beanEn && (can ? ' · 영문명 확정' : ' · 영문명 미확정')}
                    {rec.roastDate && todo.cardRequest && (can ? ' · 원두카드 요청' : ' · 원두카드 요청 전')}
                  </button>
                  {!ro && <span className="fc-kakao">{kakao.button(rec)}</span>}
                  <a href={`/garden/beancard?recordId=${rec.id}`} className="fc-txt" title="원두카드 인쇄 (A4 3×3)">
                    카드
                  </a>
                  {canOrder && !ro && (
                    <button onClick={() => remove(rec)} disabled={deleting === rec.id} className="fc-txt" title="이 발주 기록 삭제">
                      삭제
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const overlays = enabled ? (
    <>
      {receiving && canReceive && (
        <BeanReceiveDialog record={receiving} onClose={() => setReceivingId(null)} onSaved={onChanged} />
      )}
      {kakao.modal}
    </>
  ) : null;

  return { history, overlays };
}
