'use client';

import { useState } from 'react';
import type { ReorderItem, Spec, SpecUnit } from '@/lib/reorder/types';

// 품목 수정 — 이름·규격·검색어·필수 포함어·제외어·묶인 결제 상품명.

type UnitChoice = 'g' | 'kg' | 'ml' | 'L' | 'ea';
const UNIT_LABEL: Record<UnitChoice, string> = { g: 'g', kg: 'kg', ml: 'ml', L: 'L', ea: '개' };

const toChoice = (spec: Spec | null): { qty: string; unit: UnitChoice; pack: string } => {
  if (!spec) return { qty: '', unit: 'g', pack: '1' };
  if (spec.unit === 'ea') return { qty: String(spec.pack * spec.qty), unit: 'ea', pack: '1' };
  const big = spec.qty >= 1000;
  return { qty: String(big ? spec.qty / 1000 : spec.qty), unit: spec.unit === 'g' ? (big ? 'kg' : 'g') : big ? 'L' : 'ml', pack: String(spec.pack) };
};

/** 입력값 → 저장 규격. 양이 비어 있으면 null(규격 미확인), 잘못된 값이면 undefined. */
const toSpec = (qty: string, unit: UnitChoice, pack: string): Spec | null | undefined => {
  if (!qty.trim()) return null;
  const q = Number(qty);
  const p = Number(pack || '1');
  if (!(q > 0) || !Number.isInteger(p) || p < 1) return undefined;
  if (unit === 'ea') return Number.isInteger(q) ? { qty: 1, unit: 'ea', pack: q } : undefined;
  const base: SpecUnit = unit === 'g' || unit === 'kg' ? 'g' : 'ml';
  return { qty: unit === 'kg' || unit === 'L' ? q * 1000 : q, unit: base, pack: p };
};

export default function ItemEditor({
  item,
  onSave,
  onCancel,
  onDelete,
  onUnlink,
}: {
  item: ReorderItem;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onCancel: () => void;
  onDelete: () => void;
  onUnlink: (name: string) => void;
}) {
  const init = toChoice(item.spec);
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(init.qty);
  const [unit, setUnit] = useState<UnitChoice>(init.unit);
  const [pack, setPack] = useState(init.pack);
  const [searchQuery, setSearchQuery] = useState(item.searchQuery);
  const [mustInclude, setMustInclude] = useState(item.mustInclude.join(', '));
  const [excludeWords, setExcludeWords] = useState(item.excludeWords.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const spec = toSpec(qty, unit, pack);
    if (spec === undefined) return setError('규격의 숫자를 확인해 주세요.');
    setError(null);
    setSaving(true);
    await onSave({ name, spec, searchQuery, mustInclude, excludeWords });
    setSaving(false);
  };

  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="text-caption text-muted-foreground sm:col-span-2">
        품목 이름
        <input className="ta-input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <div className="sm:col-span-2">
        <p className="text-caption text-muted-foreground">규격 — 낱개 하나의 양 × 묶음 수 (비워 두면 규격 미확인)</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input className="ta-input w-24" aria-label="낱개 양" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="454" />
          <select className="ta-input w-auto" aria-label="단위" value={unit} onChange={(e) => setUnit(e.target.value as UnitChoice)}>
            {(Object.keys(UNIT_LABEL) as UnitChoice[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
          {unit !== 'ea' && (
            <>
              <span className="text-body text-muted-foreground">×</span>
              <input className="ta-input w-20" aria-label="묶음 수" inputMode="numeric" value={pack} onChange={(e) => setPack(e.target.value)} />
              <span className="text-body text-muted-foreground">개</span>
            </>
          )}
        </div>
      </div>
      <label className="text-caption text-muted-foreground sm:col-span-2">
        검색어 — 최저가를 찾을 때 쓰는 말
        <input className="ta-input mt-1 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} maxLength={120} />
      </label>
      <label className="text-caption text-muted-foreground">
        필수 포함어 (쉼표로 구분)
        <input className="ta-input mt-1 w-full" value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} placeholder="앵커, 454" />
      </label>
      <label className="text-caption text-muted-foreground">
        제외어 (쉼표로 구분)
        <input className="ta-input mt-1 w-full" value={excludeWords} onChange={(e) => setExcludeWords(e.target.value)} placeholder="가염" />
      </label>
      <div className="sm:col-span-2">
        <p className="text-caption text-muted-foreground">묶인 결제 상품명 — 지난 구매가를 이 이름들로 찾습니다</p>
        <ul className="mt-1 space-y-1">
          {item.matchNames.map((n) => (
            <li key={n} className="flex items-start justify-between gap-3 text-body">
              <span className="min-w-0 break-words">{n}</span>
              <button type="button" className="shrink-0 text-caption text-muted-foreground underline" onClick={() => onUnlink(n)}>
                빼기
              </button>
            </li>
          ))}
          {item.matchNames.length === 0 && <li className="text-body text-muted-foreground">없음</li>}
        </ul>
      </div>
      {error && <p className="ta-error text-body sm:col-span-2">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        <div className="flex gap-1">
          <button type="submit" className="ta-btn" disabled={saving}>
            저장
          </button>
          <button type="button" className="ta-btn" onClick={onCancel}>
            취소
          </button>
        </div>
        <button type="button" className="text-body text-muted-foreground underline" onClick={onDelete}>
          품목 삭제
        </button>
      </div>
    </form>
  );
}
