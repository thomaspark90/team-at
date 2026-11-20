'use client';

import { useState } from 'react';
import { toast } from '@/components/Toast';
import { ACT, ACT_SUB, API, FIELD, call, failed, jsonInit } from './shared';
import { NAMETAG_KINDS, type NametagCategory, type NametagItem, type NametagKind } from '@/lib/garden/nametags';

// 메뉴 추가·수정 폼 — 종류에 따라 필요한 칸만 보인다(큰 안내는 한글만, 안내는 한글+영문).
// [영문·설명 초안 받기]: 한글 이름으로 초안을 받아 칸에 채운다(추가 방식 C안). 채우기만 하고 저장은 사람이 고친 뒤에 한다.

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
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(false);

  const draft = async () => {
    if (drafting || !ko.trim()) return;
    if ((en.trim() || desc.trim()) && !window.confirm('지금 적혀 있는 영문 이름·설명을 초안으로 바꿀까요?')) return;
    setDrafting(true);
    const j = await call<{ en: string; desc: string; category: string | null }>(`${API}/draft`, jsonInit('POST', { ko }));
    setDrafting(false);
    if (failed(j)) return toast(j.error, 'error');
    setEn(j.en);
    if (kind === 'menu') setDesc(j.desc);
    // 카테고리 추천은 새로 추가할 때만 — 수정 중이거나 [+ 여기에 추가]로 이미 정한 카테고리는 건드리지 않는다
    if (!initial && !defaultCategory && j.category) setCategory(j.category);
    setDrafted(true);
  };

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
    <form onSubmit={submit} className="space-y-4 border-l-[2.5px] border-foreground py-1 pl-4">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="카테고리">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value={NEW_CATEGORY}>+ 새 카테고리</option>
        </select>
        {isNew && (
          <input className={FIELD} placeholder="새 카테고리 이름" value={categoryLabel} maxLength={30} onChange={(e) => setCategoryLabel(e.target.value)} />
        )}
        <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as NametagKind)} aria-label="택 종류">
          {NAMETAG_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {kind === 'big' ? (
        <textarea
          className={`${FIELD} h-20 w-full resize-none`}
          placeholder={'안내 문구 (두 줄까지)\n예: 보울 메뉴는 카운터에서'}
          value={ko}
          rows={2}
          onChange={(e) => setKo(e.target.value)}
        />
      ) : (
        <input className={`${FIELD} w-full`} placeholder="한글 이름" value={ko} maxLength={60} onChange={(e) => setKo(e.target.value)} />
      )}
      {kind !== 'big' && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <button type="button" className={ACT_SUB} disabled={!ko.trim() || drafting} onClick={draft}>
            {drafting ? '초안 쓰는 중' : drafted ? '초안 다시 받기' : '영문·설명 초안 받기'}
          </button>
          {drafted && <span className="text-caption text-muted-foreground">초안입니다. 확인하고 고친 뒤 저장하세요.</span>}
        </div>
      )}
      {kind !== 'big' && <input className={`${FIELD} w-full`} placeholder="영문 이름" value={en} maxLength={80} onChange={(e) => setEn(e.target.value)} />}
      {kind === 'menu' && (
        <textarea
          className={`${FIELD} h-20 w-full resize-none`}
          placeholder="설명 (세 줄까지 · 줄을 바꾸면 인쇄물에서도 줄이 바뀝니다)"
          value={desc}
          rows={3}
          onChange={(e) => setDesc(e.target.value)}
        />
      )}
      <div className="flex gap-6">
        <button type="submit" className={ACT} disabled={!ready || saving}>
          {saving ? '저장 중' : initial ? '저장' : '추가'}
        </button>
        <button type="button" className={ACT_SUB} onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
