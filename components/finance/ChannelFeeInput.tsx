'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRefresh } from '@/components/Refresh';
import { won } from '@/lib/finance/format';

// 월별 채널수수료(정산서 실제 금액) 입력. 미입력이면 관리손익에서 공급가액×기본율로 추정.
// 가든은 지점별 정산 주체가 달라(양재천=토스, 판교=페이히어) 지점 단위로 저장한다(2026-08-23, G5 선행).
// 지점은 페이지 URL(?unit=yangjae|pangyo)에서 읽는다 — 관리손익 페이지의 매장 필과 항상 일치.
export default function ChannelFeeInput({
  ym,
  brand,
  initial,
  estimate,
}: {
  ym: string;
  brand: 'garden' | 'staffmeal'; // 브랜드별 별도 정산
  initial: number | null; // 실제 입력값(없으면 null=추정)
  estimate: number; // 추정 금액(참고 표시)
}) {
  const params = useSearchParams();
  const unitParam = params.get('unit');
  const store = brand === 'garden' && (unitParam === 'yangjae' || unitParam === 'pangyo') ? unitParam : '';
  const storeLabel = store === 'yangjae' ? '양재천점(토스 정산)' : store === 'pangyo' ? '판교점(페이히어 정산)' : null;
  const { refresh } = useRefresh();
  const [val, setVal] = useState(initial != null ? String(initial) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(amount: number | null) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/finance/channel-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym, amount, brand, store }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장 실패');
      setSaved(true);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function save() {
    const amount = Math.round(Number(val.replace(/[,\s]/g, '')));
    if (!Number.isFinite(amount) || amount < 0) {
      setError('금액을 올바르게 입력하세요.');
      return;
    }
    post(amount);
  }

  function reset() {
    setVal('');
    post(null); // 삭제 → 추정으로 복귀
  }

  return (
    <div className="rounded-md bg-muted/40 p-6">
      <h2 className="text-[15px] text-foreground">
        채널수수료{storeLabel ? ` — ${storeLabel}` : ''} <span className="font-normal text-muted-foreground">(선택)</span>
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        카드사·간편결제·배달앱 <b>정산서의 그 달 총 수수료</b>를 넣으면 순매출이 정확해져요. 안 넣으면 <b>추정 {won(estimate)}</b>으로 잡혀요.
        {storeLabel && ' 이 입력은 이 지점 몫으로만 저장돼요(가든 전체 뷰에는 두 지점 합이 잡혀요).'}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">₩</span>
          <input
            inputMode="numeric"
            value={val}
            onChange={(e) => {
              setVal(e.target.value);
              setSaved(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={`추정 ${estimate.toLocaleString('ko-KR')}`}
            className="ta-input w-full pl-7 text-right tabular"
          />
        </div>
        <button onClick={save} disabled={saving} className="ta-btn shrink-0 whitespace-nowrap px-5">
          {saving ? '저장 중' : '저장'}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[13px]">
        {saved && <span className="text-positive">✓ 저장됨</span>}
        {initial != null && (
          <button onClick={reset} disabled={saving} className="text-muted-foreground underline hover:text-foreground disabled:opacity-50">
            추정으로 되돌리기
          </button>
        )}
      </div>
      {error && <div className="mt-2 text-[13px] text-destructive">⚠️ {error}</div>}
    </div>
  );
}
