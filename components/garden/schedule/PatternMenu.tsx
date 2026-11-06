'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtSegment } from '@/lib/schedule/time';
import type { PatternDay, ShiftPreset, Staff } from '@/lib/schedule/types';
import type { StoreId } from '@/lib/types';

// 고정 근무 패턴 — 사람마다 요일별 기본 근무(지점별). '빈 칸 채우기'로 이번 주 계획의 빈 칸에 넣는다. 주 템플릿(지점 단위)과 달리 사람 단위라 인원이 바뀌어도 유지된다.
const DOW = ['화', '수', '목', '금', '토', '일', '월'];
const api = '/api/garden-schedule/patterns';
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function PatternMenu({ store, weekStart, staff, presets, onApplied }: { store: StoreId; weekStart: string; staff: Staff[]; presets: ShiftPreset[]; onApplied: (notice: string) => void }) {
  const [open, setOpen] = useState(false);
  const [patterns, setPatterns] = useState<Record<number, PatternDay[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${api}?store=${store}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? '불러오지 못했습니다.');
    setPatterns(j.patterns ?? {});
  }, [store]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const people = staff.filter((s) => s.active && s.stores.includes(store)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const count = Object.values(patterns).reduce((n, d) => n + d.length, 0);
  const keyOf = (d: PatternDay) => `${d.start}-${d.end}`;
  // 선택지: 파트 + 그 칸에 저장된 비표준 시간
  const options = (cur?: PatternDay) => {
    const list = presets.map((p) => ({ key: `${p.start}-${p.end}`, label: p.label, start: p.start, end: p.end }));
    if (cur && !list.some((o) => o.key === keyOf(cur))) list.push({ key: keyOf(cur), label: fmtSegment(cur), start: cur.start, end: cur.end });
    return list;
  };

  const setDay = async (s: Staff, dow: number, key: string) => {
    const curDays = (patterns[s.id] ?? []).filter((d) => d.dow !== dow);
    const opt = options().find((o) => o.key === key);
    const days = opt ? [...curDays, { dow, start: opt.start, end: opt.end }] : curDays;
    setBusy(true);
    setError(null);
    const r = await fetch(api, json('PUT', { store, staffId: s.id, days }));
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? '저장하지 못했습니다.');
    setPatterns({ ...patterns, [s.id]: days });
  };

  const fill = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch(`${api}/apply`, json('POST', { store, weekStart }));
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? '채우지 못했습니다.');
    setOpen(false);
    onApplied(j.filled ? `고정 패턴으로 ${j.filled}칸을 채웠습니다.${j.skipped ? ` 이미 계획이 있는 ${j.skipped}칸은 두었습니다.` : ''}` : '채울 빈 칸이 없습니다(이미 계획이 있거나 패턴이 없음).');
  };

  return (
    <>
      <button type="button" className="ta-btn" onClick={() => setOpen(true)}>고정 패턴</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" className="ta-card flex max-h-[85vh] w-full max-w-[760px] flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-title">고정 근무 패턴</h2>
                <p className="m-0 mt-1 text-caption text-muted-foreground">사람마다 요일별 기본 근무. 바꾸면 바로 저장됩니다. 채우기는 이번 주 계획의 빈 칸에만 넣고, 있는 칸은 건드리지 않습니다.</p>
              </div>
              <button type="button" className="ta-btn-primary" disabled={busy || count === 0} onClick={fill}>이번 주 빈 칸 채우기</button>
            </div>
            <div className="mt-4 min-h-0 overflow-auto">
              <table className="w-full min-w-[700px] border-collapse">
                <thead>
                  <tr className="text-left text-caption text-muted-foreground">
                    <th className="px-2 py-1 font-normal">이름</th>
                    {DOW.map((d) => <th key={d} className="px-1 py-1 font-normal">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {people.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-2 py-1 text-body">{s.name}</td>
                      {DOW.map((_, dow) => {
                        const cur = (patterns[s.id] ?? []).find((d) => d.dow === dow);
                        return (
                          <td key={dow} className="px-1 py-1">
                            <select aria-label={`${s.name} ${DOW[dow]}`} className="ta-input w-full text-caption" value={cur ? keyOf(cur) : ''} disabled={busy} onChange={(e) => setDay(s, dow, e.target.value)}>
                              <option value="">–</option>
                              {options(cur).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className="m-0 mt-3 text-body text-destructive">{error}</p>}
            <div className="mt-5 flex justify-end">
              <button type="button" className="ta-btn" onClick={() => setOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
