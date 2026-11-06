'use client';

import { useMemo, useState } from 'react';
import { groupBySection, unfinishedItems } from '@/lib/checklist/logic';
import { SHIFT_LABEL, type ChecklistCard, type ChecklistCheck, type ChecklistItem } from '@/lib/checklist/types';
import { STORES } from '@/lib/types';
import CameraCapture from './CameraCapture';
import CrewEditor from './CrewEditor';

// 체크리스트 한 장 — 항목 체크·못 한 사유·사진·제출·책임 넘기기·다시 열기. 읽기 전용(지난날·제출 후)도 같은 화면.

const kstTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });

const FREQ_TAG = (i: ChecklistItem) => (i.frequency === 'daily' ? null : i.frequency === 'weekly' ? '주간' : '월간');

export default function ChecklistCardView({
  card,
  canAct,
  editor,
  assignment = true,
  today,
  onChange,
  onReload,
}: {
  card: ChecklistCard;
  canAct: boolean; // 오늘 + 담당 또는 운영진
  editor: boolean;
  assignment?: boolean; // 담당 지정 사용 여부 — 꺼져 있으면 조·책임자 표시와 조 수정을 숨기고 누구나 제출
  today: string;
  onChange: (next: ChecklistCard) => void;
  onReload: () => void; // 조·책임자·제출 상태가 바뀌어 하루치를 다시 읽는다
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [camera, setCamera] = useState<ChecklistItem | null>(null);
  const [viewPhoto, setViewPhoto] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingCrew, setEditingCrew] = useState(false);

  const checkOf = useMemo(() => new Map(card.checks.map((c) => [c.itemId, c])), [card.checks]);
  const remaining = unfinishedItems(card.items, card.checks).length;
  const editable = canAct && !card.submittedAt;
  const storeLabel = STORES.find((s) => s.id === card.store)?.label ?? card.store;
  const base = { store: card.store, date: card.date, shiftType: card.shiftType };

  const merge = (itemId: number, check: ChecklistCheck | null) =>
    onChange({ ...card, checks: [...card.checks.filter((c) => c.itemId !== itemId), ...(check ? [check] : [])] });

  const send = async (itemId: number, action: 'done' | 'skip' | 'clear', why?: string) => {
    setBusy(itemId);
    setError(null);
    const r = await fetch('/api/garden-checklist/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, itemId, action, reason: why }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      setError(j?.error ?? '저장하지 못했습니다. 연결을 확인해 주세요.');
      return false;
    }
    merge(itemId, j.check);
    return true;
  };

  const uploadPhoto = async (item: ChecklistItem, photo: Blob): Promise<string | null> => {
    const form = new FormData();
    form.append('photo', new File([photo], 'photo.jpg', { type: 'image/jpeg' }));
    form.append('store', card.store);
    form.append('date', card.date);
    form.append('shiftType', card.shiftType);
    form.append('itemId', String(item.id));
    const r = await fetch('/api/garden-checklist/photo', { method: 'POST', body: form }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) return j?.error ?? '사진을 올리지 못했습니다. 연결을 확인해 주세요.';
    merge(item.id, j.check);
    setCamera(null);
    return null;
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const r = await fetch('/api/garden-checklist/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(base),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setSubmitting(false);
    if (!r?.ok) return setError(j?.error ?? '제출하지 못했습니다.');
    onChange({ ...card, submittedAt: j.submittedAt, submittedByName: j.submittedByName });
  };

  /** 조·책임자·다시 열기처럼 하루치를 다시 읽어야 하는 요청 */
  const act = async (path: string, body: object) => {
    setSubmitting(true);
    setError(null);
    const r = await fetch(`/api/garden-checklist/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, ...body }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setSubmitting(false);
    if (!r?.ok) return setError(j?.error ?? '저장하지 못했습니다. 연결을 확인해 주세요.');
    onReload();
  };

  const tap = (item: ChecklistItem, check?: ChecklistCheck) => {
    if (!editable || busy != null) return;
    if (check) return void send(item.id, 'clear');
    if (item.photoRequired) return setCamera(item);
    void send(item.id, 'done');
  };

  const confirmSkip = async (itemId: number) => {
    if (!reason.trim()) return setError('못 한 사유를 적어주세요.');
    if (await send(itemId, 'skip', reason)) {
      setSkipping(null);
      setReason('');
    }
  };

  const done = card.items.length - remaining;
  const lead = card.members.find((m) => m.id === card.leadId);
  const canSubmit = editor || card.isLead || !assignment;
  const handoffTargets = card.members.filter((m) => m.id !== card.leadId && m.linked);
  return (
    <section className="ta-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-title">
          {storeLabel} {SHIFT_LABEL[card.shiftType]}
        </h2>
        {card.submittedAt ? (
          <p className="text-body text-emerald-600">
            {card.submittedByName} · {kstTime(card.submittedAt)} 제출
          </p>
        ) : (
          <p className={`text-body ${card.missed ? 'text-amber-600' : 'text-muted-foreground'}`}>
            {card.missed && '미제출 · '}
            {done} / {card.items.length}
          </p>
        )}
      </div>
      {assignment && (
        <p className="mt-1 text-caption text-muted-foreground">
          {card.members.length ? card.members.map((m) => (m.id === card.leadId ? `${m.name}(책임)` : m.name)).join(', ') : '배정된 근무자 없음'}
          {card.isLead && !card.submittedAt && ' · 오늘 내가 책임자입니다'}
        </p>
      )}
      {card.takeovers.map((t) => (
        <p key={`t-${t.name}-${t.at}`} className="text-caption text-amber-600">
          대신 맡음: {t.name} · {kstTime(t.at)}
        </p>
      ))}
      {card.reopens.map((x) => (
        <p key={`r-${x.at}`} className="text-caption text-muted-foreground">
          다시 열림: {x.name} · {kstTime(x.at)}
        </p>
      ))}

      {editable && assignment && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {canSubmit && handoffTargets.length > 0 && (
            <select
              aria-label="책임 넘기기"
              className="ta-input w-[180px]"
              value=""
              disabled={submitting}
              onChange={(e) => e.target.value && act('crew', { action: 'handoff', toStaffId: Number(e.target.value) })}
            >
              <option value="">책임 넘기기</option>
              {handoffTargets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {!card.isLead && card.onCrew && (
            <button type="button" className="min-h-10 text-caption text-muted-foreground" disabled={submitting} onClick={() => act('crew', { action: 'takeover' })}>
              {lead ? `${lead.name} 대신 ` : ''}책임 맡기
            </button>
          )}
        </div>
      )}
      {editor && assignment && card.date >= today && (
        <div className="mt-3">
          <button type="button" className="min-h-10 text-caption text-muted-foreground" onClick={() => setEditingCrew((v) => !v)}>
            조 수정 {editingCrew ? '닫기' : '›'}
          </button>
          {editingCrew && (
            <div className="mt-2">
              <CrewEditor store={card.store} date={card.date} shiftType={card.shiftType} onSaved={onReload} />
            </div>
          )}
        </div>
      )}

      <div className="mt-5 space-y-6">
        {groupBySection(card.items).map((g) => (
          <div key={g.section}>
            <h3 className="ta-label !mb-1 normal-case tracking-normal">{g.section}</h3>
            <ul className="divide-y divide-border">
              {g.items.map((item) => {
                const check = checkOf.get(item.id);
                const isDone = check?.status === 'done';
                const isSkipped = check?.status === 'skipped';
                const tag = FREQ_TAG(item);
                return (
                  <li key={item.id} className="py-1">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => tap(item, check)}
                        disabled={!editable || busy === item.id}
                        aria-pressed={!!check}
                        className="flex min-h-12 min-w-0 flex-1 items-start gap-3 py-2 text-left disabled:cursor-default"
                      >
                        <span
                          aria-hidden
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption ${
                            isDone ? 'bg-emerald-600 text-background' : isSkipped ? 'bg-amber-500 text-background' : 'shadow-inset'
                          }`}
                        >
                          {isDone ? '✓' : isSkipped ? '–' : ''}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-body ${isDone ? 'text-muted-foreground' : ''}`}>
                            {item.label}
                            {tag && <span className="ml-2 text-caption text-muted-foreground">{tag}</span>}
                            {item.photoRequired && <span className="ml-2 text-caption text-amber-600">사진</span>}
                          </span>
                          {item.detail && <span className="block text-caption text-muted-foreground">{item.detail}</span>}
                          {check && (
                            <span className={`block text-caption ${isSkipped ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              {check.doneByName} · {kstTime(check.doneAt)}
                              {isSkipped && ` · 못 함: ${check.skipReason}`}
                              {check.photoExpired && ' · 사진 보관 기간 지남'}
                            </span>
                          )}
                        </span>
                      </button>
                      {check?.hasPhoto && (
                        <button type="button" className="min-h-12 shrink-0 px-2 text-caption text-muted-foreground" onClick={() => setViewPhoto(viewPhoto === check.id ? null : check.id)}>
                          사진
                        </button>
                      )}
                      {editable && !check && (
                        <button
                          type="button"
                          className="min-h-12 shrink-0 px-2 text-caption text-muted-foreground"
                          onClick={() => {
                            setSkipping(skipping === item.id ? null : item.id);
                            setReason('');
                          }}
                        >
                          못 함
                        </button>
                      )}
                    </div>
                    {check?.hasPhoto && viewPhoto === check.id && (
                      // eslint-disable-next-line @next/next/no-img-element -- 권한 검사를 거치는 private 사진 스트림
                      <img src={`/api/garden-checklist/photo?checkId=${check.id}`} alt={`${item.label} 사진`} className="mb-2 mt-1 max-h-96 w-full rounded-md object-contain" />
                    )}
                    {skipping === item.id && (
                      <div className="mb-2 mt-1 flex gap-2">
                        <input
                          className="ta-input min-w-0 flex-1"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="못 한 사유"
                          maxLength={300}
                          autoFocus
                        />
                        <button type="button" className="ta-btn" onClick={() => confirmSkip(item.id)} disabled={busy === item.id}>
                          저장
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {error && <p className="ta-error mt-4 text-body">{error}</p>}
      {editable &&
        (canSubmit ? (
          <button type="button" className="ta-btn-primary mt-5 h-12 w-full" onClick={submit} disabled={submitting || remaining > 0 || card.items.length === 0}>
            {submitting ? '제출하는 중' : remaining > 0 ? `${remaining}개 남음` : `${SHIFT_LABEL[card.shiftType]} 제출`}
          </button>
        ) : (
          <p className="mt-5 text-body text-muted-foreground">
            {remaining > 0 ? `${remaining}개 남음 · ` : ''}제출은 {lead?.name ?? '책임자'}님이 합니다
          </p>
        ))}
      {editor && card.submittedAt && card.date === today && (
        <button type="button" className="ta-btn mt-5 h-12 w-full" disabled={submitting} onClick={() => act('reopen', {})}>
          다시 열기
        </button>
      )}

      {camera && <CameraCapture title={camera.label} onClose={() => setCamera(null)} onUse={(p) => uploadPhoto(camera, p)} />}
    </section>
  );
}
