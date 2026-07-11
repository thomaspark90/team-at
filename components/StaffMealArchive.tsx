'use client';

import { useMemo, useState } from 'react';
import type { StaffMealRecord } from '@/lib/types';

const fmtSaved = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 기록 한 건에서 메뉴 항목들 추출 — 빈 칸 제외, 직접 입력은 줄 단위
const menuItems = (rec: StaffMealRecord): string[] =>
  (rec.inputMode === 'manual'
    ? rec.manualText.split('\n')
    : rec.categories.flatMap((c) => c.items)
  )
    .map((s) => s.trim())
    .filter(Boolean);

// 메뉴 항목 요약 — 빈 칸 제외
const menuLines = (rec: StaffMealRecord): [string, string][] => {
  if (rec.inputMode === 'manual') {
    return rec.manualText.trim() ? [['메뉴', rec.manualText.trim()]] : [];
  }
  return rec.categories
    .map((c): [string, string] => [c.name, c.items.filter((i) => i.trim()).join(', ')])
    .filter(([, items]) => items.length > 0);
};

// 메뉴 기록 목록 + 메뉴별 기록 횟수 — 삭제 시 남은 기록 기준으로 횟수 재계산
export default function StaffMealArchive({ initial }: { initial: StaffMealRecord[] }) {
  const [records, setRecords] = useState<StaffMealRecord[]>(initial);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteRecord = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/staffmeals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setRecords((rs) => rs.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  // 메뉴별 기록 횟수 — 현재 남아 있는 기록 전체 집계, 많이 나온 순(동률은 가나다순)
  const ranked = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of records)
      for (const item of menuItems(rec)) counts.set(item, (counts.get(item) ?? 0) + 1);
    return Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')
    );
  }, [records]);

  return (
    <>
      <div className="ta-card bg-background">
        <p className="ta-label">메뉴 기록</p>
        {records.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            아직 기록이 없습니다. IG 메뉴 업데이트에서 스토리를 다운로드하면 자동으로 쌓입니다.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {records.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-border p-3.5">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="tabular text-[15px] font-medium">{rec.date}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {rec.createdBy.split('@')[0]} · 저장 {fmtSaved(rec.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {menuLines(rec).map(([name, items]) => (
                    <p key={name} className="m-0 text-[13px]">
                      <span className="text-muted-foreground">{name}</span>{' '}
                      <span className="text-foreground">{items}</span>
                    </p>
                  ))}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => deleteRecord(rec.id)}
                    disabled={deletingId === rec.id}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {deletingId === rec.id ? '삭제 중…' : '삭제'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ranked.length > 0 && (
        <div className="ta-card bg-background">
          <p className="ta-label">메뉴별 기록 횟수</p>
          <div className="flex flex-wrap gap-1.5">
            {ranked.map(([name, count]) => (
              <span
                key={name}
                className="rounded-full border border-border px-2.5 py-1 text-[12px]"
              >
                <span className="text-foreground">{name}</span>{' '}
                <span className="tabular text-muted-foreground">{count}회</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
