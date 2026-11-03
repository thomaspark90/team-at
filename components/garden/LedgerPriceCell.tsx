'use client';

import { useState } from 'react';
import type { PurchaseRecord } from '@/lib/types';
import { PRICE_UNIT } from '@/lib/pricing';
import { toast } from '@/components/Toast';

// 필터 레시피 목록의 판매가 칸 — 숫자를 누르면 그 자리에서 수정(2026-11-03 대표 요청).
// 원두별 판매가 하나(ICE·HOT 공통). 저장은 판매가 설정 화면과 같은 PATCH /api/purchases { id, chosenPrice } —
// 서버가 500원 단위·saleprice 탭 권한을 검증하고, 실제 배수(판매가÷재료비)도 함께 기록한다.
// 수정 권한이 없거나 발주 기록이 없으면 숫자만 보여준다.

const num = (n: number) => Math.round(n).toLocaleString('ko-KR');

export default function LedgerPriceCell({
  purchaseId,
  price,
  canEdit,
  onSaved,
}: {
  purchaseId: string | null;
  price: number | null;
  canEdit: boolean;
  onSaved: (rec: PurchaseRecord) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const label = price != null ? num(price) : <span className="text-muted-foreground">미책정</span>;
  if (!canEdit || !purchaseId) return <>{label}</>;

  const start = (e: React.MouseEvent) => {
    e.stopPropagation(); // 줄 펼침과 분리
    setDraft(price != null ? String(price) : '');
    setEditing(true);
  };

  const save = async () => {
    if (busy) return;
    const value = Number(draft.replace(/[^\d]/g, ''));
    if (value === price) return setEditing(false);
    if (!value || value % PRICE_UNIT !== 0) {
      toast(`판매가는 ${PRICE_UNIT}원 단위로 입력해 주세요.`, 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: purchaseId, chosenPrice: value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '판매가 저장에 실패했어요.');
      onSaved(j);
      setEditing(false);
      toast(`판매가 ${num(value)}원으로 저장했어요.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : '판매가 저장에 실패했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={start}
        title="눌러서 판매가 수정 (VAT 포함, 500원 단위)"
        className="rounded-sm text-foreground hover:bg-muted"
        style={{ background: 'none', border: 'none', cursor: 'text', padding: '2px 4px', margin: '-2px -4px', font: 'inherit' }}
      >
        {label}
      </button>
    );
  }

  return (
    <input
      autoFocus
      inputMode="numeric"
      value={draft}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') setEditing(false);
      }}
      onBlur={() => !busy && setEditing(false)}
      placeholder="예: 7000"
      className="tabular rounded-sm border border-border bg-background text-body text-foreground"
      style={{ width: 84, padding: '2px 6px', textAlign: 'right' }}
    />
  );
}
