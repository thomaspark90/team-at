'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface KindVals {
  식자재: number | null;
  포장소모품: number | null;
}
interface Props {
  ym: string;
  initial: KindVals;
  prevMonth: KindVals;
}

const KINDS: ('식자재' | '포장소모품')[] = ['식자재', '포장소모품'];
const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

export default function InventoryInput({ ym, initial, prevMonth }: Props) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({
    식자재: initial.식자재 != null ? String(initial.식자재) : '',
    포장소모품: initial.포장소모품 != null ? String(initial.포장소모품) : '',
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(kind: string, override?: number) {
    const amount = override ?? Math.round(Number(vals[kind].replace(/[,\s]/g, '')));
    if (!Number.isFinite(amount) || amount < 0) { setError('금액을 올바르게 입력하세요.'); return; }
    setSaving(kind); setError(null); setSaved(null);
    try {
      const res = await fetch('/api/finance/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym, kind, amount }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장 실패');
      setSaved(kind);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  // 지난달 기말값을 채우고 바로 저장(원클릭)
  async function copyPrev(kind: '식자재' | '포장소모품') {
    const prev = prevMonth[kind];
    if (prev == null) return;
    setVals((v) => ({ ...v, [kind]: String(prev) }));
    await save(kind, prev);
  }

  return (
    <div className="ta-card">
      <h2 className="text-[15px] font-semibold text-foreground">기말재고 입력 <span className="font-normal text-muted-foreground">(선택)</span></h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        <b className="text-foreground">매달 안 넣어도 돼요.</b> 비워두면 재료비가 <b>매입액 그대로</b> 잡혀요. 재고가 크게 바뀐 달(오픈·대량 선구매)이나 분기 1회만 어림값을 넣어도 충분해요.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {KINDS.map((kind) => {
          const prev = prevMonth[kind];
          const showPrev = prev != null && String(prev) !== vals[kind];
          return (
            <div key={kind}>
              <div className="mb-1.5 flex items-center gap-2 text-[13px] text-foreground">
                {kind}
                {saved === kind && saving == null && <span className="text-[11px] text-positive">✓ 저장됨</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">₩</span>
                  <input
                    inputMode="numeric"
                    value={vals[kind]}
                    onChange={(e) => { setVals((v) => ({ ...v, [kind]: e.target.value })); setSaved(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && save(kind)}
                    placeholder="미입력"
                    className="ta-input w-full pl-7 text-right tabular"
                  />
                </div>
                <button
                  onClick={() => save(kind)}
                  disabled={saving === kind}
                  className="ta-btn shrink-0 whitespace-nowrap px-5"
                >
                  {saving === kind ? '저장 중' : '저장'}
                </button>
              </div>
              {showPrev && (
                <button
                  onClick={() => copyPrev(kind)}
                  disabled={saving === kind}
                  className="mt-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  ↩ 지난달과 비슷해요 <span className="tabular">({won(prev)})</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <div className="mt-3 text-[13px] text-destructive">⚠️ {error}</div>}
    </div>
  );
}
