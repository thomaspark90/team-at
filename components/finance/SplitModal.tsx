'use client';

import { useMemo, useState } from 'react';
import { BRANDS, STORES, brandLabel, storeLabel, type Brand, type Store } from '@/lib/finance/types';
import { wonNum as won } from '@/lib/finance/format';

// 건별 분할 모달 — 한 지점 매입으로 잡힌 공동구매를 브랜드·지점별 금액으로 쪼갠다.
// 비율 버튼(50:50 등)으로 빠르게 채우고, 마지막 줄은 잔액 자동 보정. 합계=원금액이어야 저장.

export interface SplitTarget {
  id: number;
  memo: string;
  amount: number; // 분할 대상 금액(출금 또는 입금)
  brand: string;
  store: string | null;
}

export interface SplitRuleSuggestion {
  allocations: { brand: Brand; store: Store | null; ratio: number }[];
}

interface Line {
  brand: Brand;
  store: Store | null;
  amount: number;
}

const UNITS: { brand: Brand; store: Store | null; label: string }[] = [
  { brand: 'garden', store: 'pangyo', label: '가든 · 판교' },
  { brand: 'garden', store: 'yangjae', label: '가든 · 양재천' },
  { brand: 'staffmeal', store: null, label: '스탭밀' },
];
const unitKey = (b: string, s: string | null) => `${b}|${s ?? ''}`;

export default function SplitModal({
  target,
  suggestion,
  onDone,
  onClose,
}: {
  target: SplitTarget;
  suggestion?: SplitRuleSuggestion | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const initial = useMemo<Line[]>(() => {
    if (suggestion?.allocations?.length) {
      // 학습된 비율로 미리 채움 — 반올림 잔차는 마지막 줄에 보정
      const lines = suggestion.allocations.map((a) => ({
        brand: a.brand,
        store: a.store,
        amount: Math.round(target.amount * a.ratio),
      }));
      const diff = target.amount - lines.reduce((s, l) => s + l.amount, 0);
      if (lines.length) lines[lines.length - 1].amount += diff;
      return lines;
    }
    // 기본: 원거래 단위 + 나머지 한 칸 (금액은 사람이 채움)
    const first = UNITS.find((u) => unitKey(u.brand, u.store) === unitKey(target.brand, target.store)) ?? UNITS[0];
    const second = UNITS.find((u) => unitKey(u.brand, u.store) !== unitKey(first.brand, first.store))!;
    return [
      { brand: first.brand, store: first.store, amount: target.amount },
      { brand: second.brand, store: second.store, amount: 0 },
    ];
  }, [target, suggestion]);

  const [lines, setLines] = useState<Line[]>(initial);
  const [learn, setLearn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sum = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? Math.round(l.amount) : 0), 0);
  const remain = target.amount - sum;
  const valid = remain === 0 && lines.length >= 2 && lines.every((l) => Math.round(l.amount) > 0);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const evenSplit = () => {
    const n = lines.length;
    const base = Math.floor(target.amount / n);
    setLines((ls) => ls.map((l, i) => ({ ...l, amount: i === n - 1 ? target.amount - base * (n - 1) : base })));
  };

  const fillRemain = (i: number) => setLine(i, { amount: Math.max(0, Math.round(lines[i].amount) + remain) });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txId: target.id,
          allocations: lines.map((l) => ({ brand: l.brand, store: l.store, amount: Math.round(l.amount) })),
          learnRule: learn,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '분할에 실패했어요.');
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[480px] rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="m-0 text-[15px] font-medium">건별 분할</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          <b className="text-foreground">{target.memo}</b> · {won(target.amount)} — 브랜드·지점별 금액으로 나눠요.
          원거래는 손익에서 빠지고(건별분할), 나눈 행들이 각자 회계로 들어가요.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={unitKey(l.brand, l.store)}
                onChange={(e) => {
                  const u = UNITS.find((x) => unitKey(x.brand, x.store) === e.target.value)!;
                  setLine(i, { brand: u.brand, store: u.store });
                }}
                className="ta-input w-[150px] text-[13px]"
              >
                {UNITS.map((u) => (
                  <option key={unitKey(u.brand, u.store)} value={unitKey(u.brand, u.store)}>
                    {u.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={Number.isFinite(l.amount) ? l.amount : ''}
                onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
                className="ta-input flex-1 text-right text-[13px] tabular"
              />
              <button
                onClick={() => fillRemain(i)}
                title="남은 금액 채우기"
                className="ta-btn h-8 px-2 text-[11px]"
              >
                잔액
              </button>
              {lines.length > 2 && (
                <button
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  className="text-[15px] text-muted-foreground hover:text-destructive"
                  title="줄 삭제"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          {lines.length < UNITS.length && (
            <button
              onClick={() => {
                const used = new Set(lines.map((l) => unitKey(l.brand, l.store)));
                const next = UNITS.find((u) => !used.has(unitKey(u.brand, u.store))) ?? UNITS[0];
                setLines((ls) => [...ls, { brand: next.brand, store: next.store, amount: 0 }]);
              }}
              className="ta-btn h-7 px-2.5 text-[13px]"
            >
              + 줄 추가
            </button>
          )}
          <button onClick={evenSplit} className="ta-btn h-7 px-2.5 text-[13px]">
            균등 분할
          </button>
          <span className={`ml-auto tabular ${remain === 0 ? 'text-positive' : 'text-destructive'}`}>
            {remain === 0 ? '✓ 합계 일치' : remain > 0 ? `남음 ${won(remain)}` : `초과 ${won(-remain)}`}
          </span>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
          이 가맹점({target.memo.slice(0, 20)})의 분할 비율을 학습해 다음부터 자동 제안
        </label>

        {error && <p className="mt-2 text-[13px] text-destructive">⚠️ {error}</p>}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-border py-2 text-[13px] text-muted-foreground hover:text-foreground">
            취소
          </button>
          <button
            onClick={save}
            disabled={!valid || saving}
            className="flex-[2] rounded-xl bg-foreground py-2 text-[13px] font-medium text-background disabled:opacity-50"
          >
            {saving
              ? '분할 중…'
              : `${lines.map((l) => `${l.store ? storeLabel(l.store) : brandLabel(l.brand)}`).join(' · ')}로 분할`}
          </button>
        </div>
      </div>
    </div>
  );
}
