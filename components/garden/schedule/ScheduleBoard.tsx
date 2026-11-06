'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SegmentControl from '@/components/nav/SegmentControl';
import { addDays, fmtMd, kstToday } from '@/lib/teaching/kst';
import { effectiveActual, fmtSegment, weekStartOf } from '@/lib/schedule/time';
import { STORES, type StoreId } from '@/lib/types';
import type { Segment, ShiftKind, ShiftPreset, Staff, WeekData } from '@/lib/schedule/types';
import WeekGrid from './WeekGrid';
import ShiftEditor, { type CellTarget } from './ShiftEditor';
import PresetEditor from './PresetEditor';
import HourlyStrip from './HourlyStrip';
import LeavePanel from './LeavePanel';
import ShareLinkPanel from './ShareLinkPanel';
import CrewPlanner from '@/components/garden/checklist/CrewPlanner';

// 스케줄 화면의 상태·저장 흐름만 담당한다. 표·편집기·보조 패널은 각 컴포넌트.
const post = (path: string, method: string, body: unknown) =>
  fetch(`/api/garden-schedule${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function ScheduleBoard() {
  const [store, setStore] = useState<StoreId>('yangjae');
  const [weekStart, setWeekStart] = useState(() => weekStartOf(kstToday()));
  const [view, setView] = useState<ShiftKind>('plan');
  const [week, setWeek] = useState<WeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<CellTarget | null>(null);
  const [noteDate, setNoteDate] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [addedIds, setAddedIds] = useState<number[]>([]);
  const [copyConflict, setCopyConflict] = useState<number | null>(null);
  const [copyDay, setCopyDay] = useState<string | null>(null); // 표 머리에서 복사해 둔 날
  const [editingPresets, setEditingPresets] = useState(false); // 근무 파트 편집 창

  const load = useCallback(async () => {
    const r = await fetch(`/api/garden-schedule?store=${store}&week=${weekStart}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({ error: '불러오지 못했습니다.' }));
    if (!r.ok || j.error) return setError(j.error ?? '불러오지 못했습니다.');
    setError(null);
    setWeek(j);
  }, [store, weekStart]);

  useEffect(() => {
    setAddedIds([]);
    setCopyConflict(null);
    setCopyDay(null);
    setNotice(null);
    load();
  }, [load]);

  // Esc 로 복사 취소
  useEffect(() => {
    if (!copyDay) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCopyDay(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyDay]);

  const planShifts = useMemo(() => (week?.shifts ?? []).filter((s) => s.kind === 'plan'), [week]);
  const actualShifts = useMemo(() => {
    if (!week) return [];
    return effectiveActual(week.shifts, (s) => week.publishedStores.includes(s.store));
  }, [week]);
  const shown = view === 'plan' ? planShifts : actualShifts;
  const editor = !!week?.editor;
  const hasSheet = week?.shifts.some((s) => s.source === 'sheet' && s.store === store);
  const onlyActual = view === 'plan' && !planShifts.some((s) => s.store === store) && week?.shifts.some((s) => s.kind === 'actual' && s.store === store);

  const rows: Staff[] = useMemo(() => {
    if (!week) return [];
    const onDuty = new Set([...planShifts, ...actualShifts].filter((s) => s.store === store).map((s) => s.staffId));
    return week.staff.filter((p) => onDuty.has(p.id) || addedIds.includes(p.id) || (editor && p.active && p.stores.includes(store)));
  }, [week, planShifts, actualShifts, store, addedIds, editor]);
  const addable = week ? week.staff.filter((p) => p.active && !rows.some((r) => r.id === p.id)) : [];

  const openCell = (p: Staff, date: string) => {
    const mine = week!.shifts.filter((s) => s.staffId === p.id && s.date === date && s.store === store);
    const plan = mine.filter((s) => s.kind === 'plan');
    const actual = mine.filter((s) => s.kind === 'actual');
    const seg = (l: typeof mine): Segment[] => l.filter((s) => s.start != null && s.end != null).map((s) => ({ start: s.start!, end: s.end! }));
    const current = view === 'plan' ? plan : actual.length ? actual : plan;
    setEditing({
      staffId: p.id,
      name: p.name,
      date,
      kind: view,
      segments: seg(current),
      isOff: actual.some((s) => s.isOff),
      hasActualRow: actual.length > 0,
      planLabel: seg(plan).map(fmtSegment).join(', '),
    });
  };

  const saveCell = async (segments: Segment[], off: boolean) => {
    const t = editing!;
    const r = await post('/cell', 'PUT', { store, date: t.date, staffId: t.staffId, kind: t.kind, segments, off });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return (j.error as string) ?? '저장하지 못했습니다.';
    await load();
    return null;
  };

  const publish = async (on: boolean) => {
    const r = await post('/publish', 'POST', { store, weekStart, publish: on });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? '배포하지 못했습니다.');
    setNotice(on ? '배포했습니다. 직원 화면과 링크에 바로 보입니다.' : '배포를 취소했습니다. 직원에게 보이지 않습니다.');
    load();
  };

  const copyPrev = async (overwrite = false) => {
    const r = await post('/copy', 'POST', { store, weekStart, overwrite });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) return setCopyConflict(j.existing ?? 0);
    setCopyConflict(null);
    if (!r.ok) return setError(j.error ?? '복사하지 못했습니다.');
    setError(null);
    setView('plan');
    setNotice(`지난주 ${j.from === 'actual' ? '실제 근무' : '계획'} ${j.copied}건을 복사했습니다.`);
    load();
  };

  // 하루 복사 → 다른 날 붙여넣기. 붙여넣는 날에 기록이 있으면 한 번 묻고 덮어쓴다. 복사 상태는 유지해 여러 날에 이어 붙일 수 있다.
  const pasteDay = async (to: string, overwrite = false) => {
    if (!copyDay) return;
    const r = await post('/copy-day', 'POST', { store, from: copyDay, to, kind: view, overwrite });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) {
      if (window.confirm(`${fmtMd(to)}에 이미 ${j.existing}건이 있습니다. ${fmtMd(copyDay)} 근무로 덮어쓸까요?`)) return pasteDay(to, true);
      return;
    }
    if (!r.ok) return setError(j.error ?? '붙여넣지 못했습니다.');
    setError(null);
    setNotice(`${fmtMd(copyDay)} 근무 ${j.people}명을 ${fmtMd(to)}에 붙여넣었습니다. 다른 날에도 붙여넣을 수 있고, 끝나면 취소를 누르세요.`);
    load();
  };

  // 근무 파트 저장 — 지점별 목록 교체 후 주 데이터를 다시 읽어 칸 편집기의 버튼을 갱신한다
  const savePresets = async (presets: ShiftPreset[]) => {
    const r = await post('/presets', 'PUT', { store, presets });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return (j.error as string) ?? '저장하지 못했습니다.';
    await load();
    return null;
  };

  const saveNote = async () => {
    const r = await post('/notes', 'PUT', { store, date: noteDate, note: noteText });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return setError(j.error ?? '저장하지 못했습니다.');
    }
    setNoteDate(null);
    load();
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <SegmentControl ariaLabel="지점" items={STORES.map((s) => ({ id: s.id, label: s.short }))} value={store} onSelect={(id) => setStore(id as StoreId)} />
        <div className="flex items-center gap-3 text-body">
          <button type="button" aria-label="지난주" className="ta-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <span className="tabular">{fmtMd(weekStart)} ~ {fmtMd(addDays(weekStart, 6))}</span>
          <button type="button" aria-label="다음주" className="ta-btn" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
          <button type="button" className="text-muted-foreground" onClick={() => setWeekStart(weekStartOf(kstToday()))}>이번 주</button>
        </div>
        {editor && (
          <>
            <SegmentControl ariaLabel="계획/실제" items={[{ id: 'plan', label: '계획' }, { id: 'actual', label: '실제' }]} value={view} onSelect={(id) => setView(id as ShiftKind)} />
            <div className="ml-auto flex items-center gap-3">
              <button type="button" className="ta-btn" onClick={() => copyPrev()}>지난주 복사</button>
              {week?.published ? (
                <button type="button" className="ta-btn" onClick={() => publish(false)}>배포 취소</button>
              ) : (
                <button type="button" className="ta-btn-primary" onClick={() => publish(true)}>배포</button>
              )}
            </div>
          </>
        )}
      </div>

      <section className="ta-panel space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          {week && view === 'plan' && (
            <span className={week.published ? 'text-emerald-600' : 'text-amber-600'}>{week.published ? '배포됨' : editor ? '작성 중 · 직원에게 안 보임' : '아직 배포되지 않음'}</span>
          )}
          {hasSheet && <span>시트 이관 기록 포함</span>}
          {view === 'actual' && <span>달라진 칸만 고치면 됩니다. 기록이 없는 칸은 계획대로 근무한 것으로 봅니다.</span>}
          {notice && <span className="text-foreground">{notice}</span>}
          {copyConflict != null && (
            <button type="button" className="text-destructive" onClick={() => copyPrev(true)}>이번 주 계획 {copyConflict}건을 지우고 덮어쓰기 ›</button>
          )}
          {onlyActual && <button type="button" className="text-foreground" onClick={() => setView('actual')}>이 주는 실제 기록만 있습니다. 실제 보기 ›</button>}
        </div>
        {error && <p className="m-0 text-body text-destructive">{error}</p>}
        {week && (
          <HourlyStrip days={week.days} shifts={shown.filter((s) => s.store === store)} staff={week.staff} store={store} onStaffChanged={editor ? load : undefined} />
        )}
        {week ? (
          <WeekGrid
            week={week}
            rows={rows}
            shifts={shown}
            planShifts={planShifts}
            showPlanDiff={view === 'actual'}
            onCell={editor ? openCell : undefined}
            onNote={(d) => {
              setNoteDate(d);
              setNoteText(week.notes[d] ?? '');
            }}
            copyDay={editor ? copyDay : null}
            onCopyDay={editor ? setCopyDay : undefined}
            onPasteDay={editor ? (d) => pasteDay(d) : undefined}
          />
        ) : (
          !error && <p className="m-0 text-body text-muted-foreground">불러오는 중…</p>
        )}
        {editor && addable.length > 0 && (
          <select
            aria-label="근무자 추가"
            className="ta-input w-[180px]"
            value=""
            onChange={(e) => e.target.value && setAddedIds([...addedIds, Number(e.target.value)])}
          >
            <option value="">+ 다른 근무자 추가</option>
            {addable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </section>

      {editor && week && (
        <div className="space-y-6">
          <CrewPlanner store={store} days={week.days} />
          <details className="ta-panel">
            <summary className="cursor-pointer text-body">직원 공유 링크 ›</summary>
            <div className="mt-4"><ShareLinkPanel /></div>
          </details>
          <details className="ta-panel">
            <summary className="cursor-pointer text-body">연차·휴무 ›</summary>
            <div className="mt-4 overflow-x-auto"><LeavePanel staff={week.staff} /></div>
          </details>
          <Link href="/garden/schedule/staff" className="ta-panel block text-body">직원 명부 · 재직 관리 ›</Link>
        </div>
      )}

      {editing && week && (
        <ShiftEditor target={editing} presets={week.presets} onSave={saveCell} onClose={() => setEditing(null)} onEditPresets={() => setEditingPresets(true)} />
      )}
      {editingPresets && week && (
        <PresetEditor presets={week.presets} storeLabel={STORES.find((s) => s.id === store)?.short ?? store} onSave={savePresets} onClose={() => setEditingPresets(false)} />
      )}

      {noteDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" onClick={() => setNoteDate(null)}>
          <div role="dialog" aria-modal="true" className="ta-card w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="m-0 text-title">{fmtMd(noteDate)} 메모</h2>
            <textarea aria-label="메모" className="ta-input mt-4 h-[140px] w-full py-2" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ta-btn" onClick={() => setNoteDate(null)}>닫기</button>
              <button type="button" className="ta-btn-primary" onClick={saveNote}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
