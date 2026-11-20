'use client';

import { useState } from 'react';
import { NAMETAG_KINDS, type NametagCategory, type NametagItem, type NametagKind } from '@/lib/garden/nametags';

// 메뉴 추가·수정 폼 — 종류에 따라 필요한 칸만 보인다(큰 안내는 한글만, 안내는 한글+영문).

const NEW_CATEGORY = '_new';

export type ItemFormValue = { category?: string; categoryLabel?: string; kind: NametagKind; ko: string; en: string; desc: string };

export default function NametagItemForm({
  categories,
  initial,
  defaultCategory,
  onSubmit,
  onCancel,
}: {
  categories: NametagCategory[];
  initial?: NametagItem;
  defaultCategory?: string;
  onSubmit: (v: ItemFormValue) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(initial?.category ?? defaultCategory ?? categories[0]?.id ?? NEW_CATEGORY);
  const [categoryLabel, setCategoryLabel] = useState('');
  const [kind, setKind] = useState<NametagKind>(initial?.kind ?? 'menu');
  const [ko, setKo] = useState(initial?.ko ?? '');
  const [en, setEn] = useState(initial?.en ?? '');
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const [saving, setSaving] = useState(false);

  const isNew = category === NEW_CATEGORY;
  const ready = ko.trim() && (!isNew || categoryLabel.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    await onSubmit({ ...(isNew ? { categoryLabel } : { category }), kind, ko, en, desc });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="ta-panel space-y-3">
      <div className="flex flex-wrap gap-3">
        <select className="ta-input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="카테고리">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value={NEW_CATEGORY}>+ 새 카테고리</option>
        </select>
        {isNew && (
          <input className="ta-input" placeholder="새 카테고리 이름" value={categoryLabel} maxLength={30} onChange={(e) => setCategoryLabel(e.target.value)} />
        )}
        <select className="ta-input" value={kind} onChange={(e) => setKind(e.target.value as NametagKind)} aria-label="택 종류">
          {NAMETAG_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {kind === 'big' ? (
        <textarea
          className="ta-input h-20 w-full py-2"
          placeholder={'안내 문구 (두 줄까지)\n예: 보울 메뉴는 카운터에서'}
          value={ko}
          rows={2}
          onChange={(e) => setKo(e.target.value)}
        />
      ) : (
        <input className="ta-input w-full" placeholder="한글 이름" value={ko} maxLength={60} onChange={(e) => setKo(e.target.value)} />
      )}
      {kind !== 'big' && <input className="ta-input w-full" placeholder="영문 이름" value={en} maxLength={80} onChange={(e) => setEn(e.target.value)} />}
      {kind === 'menu' && (
        <textarea
          className="ta-input h-20 w-full py-2"
          placeholder="설명 (세 줄까지 · 줄을 바꾸면 인쇄물에서도 줄이 바뀝니다)"
          value={desc}
          rows={3}
          onChange={(e) => setDesc(e.target.value)}
        />
      )}
      <div className="flex gap-3">
        <button type="submit" className="ta-btn-primary" disabled={!ready || saving}>
          {saving ? '저장 중' : initial ? '저장' : '추가'}
        </button>
        <button type="button" className="ta-btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
