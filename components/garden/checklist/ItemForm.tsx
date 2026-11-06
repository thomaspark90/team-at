'use client';

import { useState } from 'react';
import type { ChecklistItem, Frequency } from '@/lib/checklist/types';

// 항목 추가·수정 입력 — 항목 관리 화면 전용.

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ItemForm({
  item,
  defaultSection = '',
  sections,
  onSave,
  onCancel,
}: {
  item?: ChecklistItem;
  defaultSection?: string;
  sections: string[];
  onSave: (body: { section: string; label: string; detail: string; frequency: Frequency; weekday: number | null; photoRequired?: boolean }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [section, setSection] = useState(item?.section ?? defaultSection);
  const [label, setLabel] = useState(item?.label ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? 'daily');
  const [weekday, setWeekday] = useState(item?.weekday ?? 2);
  const [photoRequired, setPhotoRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({ section, label, detail, frequency, weekday: frequency === 'daily' ? null : weekday, ...(item ? {} : { photoRequired }) });
    setSaving(false);
  };

  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input className="ta-input" aria-label="구역" list="checklist-sections" value={section} onChange={(e) => setSection(e.target.value)} placeholder="구역" maxLength={120} />
      <datalist id="checklist-sections">
        {sections.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input className="ta-input" aria-label="항목 이름" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="항목 이름" maxLength={120} autoFocus={!item} />
      <input className="ta-input sm:col-span-2" aria-label="세부 설명" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="세부 설명(선택)" maxLength={200} />
      <select className="ta-input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} aria-label="주기">
        <option value="daily">매일</option>
        <option value="weekly">매주</option>
        <option value="monthly">매월 첫 요일</option>
      </select>
      {frequency !== 'daily' ? (
        <select className="ta-input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label="요일">
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}요일
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}
      {!item && (
        <label className="flex min-h-9 items-center gap-2 text-body sm:col-span-2">
          <input type="checkbox" checked={photoRequired} onChange={(e) => setPhotoRequired(e.target.checked)} />
          사진 필수
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="ta-btn-primary" disabled={saving}>
          저장
        </button>
        <button type="button" className="ta-btn" onClick={onCancel} disabled={saving}>
          취소
        </button>
      </div>
    </form>
  );
}
