'use client';

import { useCallback, useEffect, useState } from 'react';
import { TEACHING_CATEGORIES, topicLabel } from '@/lib/teaching/topics';
import { fmtMd } from '@/lib/teaching/kst';
import { STORES, type StoreId } from '@/lib/types';
import { api, type Board, type TeachingMe } from './types';
import { STORE_SURVEYS } from '@/lib/teaching/survey';

// 매니저 집계 보드 — 지점을 고르면 그 지점 스탭들의 열린 요청(실명)·자유 서술·최근 교육 기록.
// 주제 옆 '교육함'을 누르면 참석 스탭·날짜·메모를 적어 기록한다 → 그 스탭의 요청이 '받음'으로 바뀐다.
// 시안 A(2026-09-09): 섹션 제목·빈 상태 문장 대신 '요청 N | 기록 N' 탭으로 접고 건수만 보인다.

type Draft = { topicKey: string; date: string; attendees: Set<string>; memo: string };

export default function ManagerBoard({ me }: { me: TeachingMe }) {
  // 기본 지점: 내 다음 출근 지점 → 내 소속 첫 지점 → 판교
  const myNext = me.shifts.find((s) => me.role === 'admin' || s.managerId === me.userId);
  const [store, setStore] = useState<StoreId>(myNext?.store ?? me.profile?.stores[0] ?? 'pangyo');
  const [board, setBoard] = useState<Board | null>(null);
  const [tab, setTab] = useState<'wish' | 'log'>('wish');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setBoard(await api<Board>(`/api/garden-teaching/board?store=${store}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  const wantersOf = (key: string) => board?.topics.find((t) => t.topicKey === key)?.wanters ?? [];

  const openDraft = (topicKey: string) => {
    const todayShift = me.shifts.find((s) => s.date === me.today && s.store === store);
    setDraft({
      topicKey,
      date: todayShift?.date ?? me.today,
      attendees: new Set(wantersOf(topicKey).map((w) => w.userId)),
      memo: '',
    });
  };

  const submit = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/garden-teaching/sessions', {
        method: 'POST',
        body: JSON.stringify({ topicKey: draft.topicKey, date: draft.date, store, attendeeIds: Array.from(draft.attendees), memo: draft.memo }),
      });
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const removeSession = async (id: number) => {
    setError('');
    try {
      await api('/api/garden-teaching/sessions', { method: 'DELETE', body: JSON.stringify({ id }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    }
  };

  const openTotal = board?.topics.reduce((n, t) => n + t.wanters.length, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex ta-seg">
            {STORES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStore(s.id)}
                className={`ta-seg-item px-4 py-1.5 text-body ${store === s.id ? 'ta-seg-on' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex ta-seg">
            {([['wish', `요청 ${openTotal}`], ['log', `기록 ${board?.sessions.length ?? 0}`]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`ta-seg-item px-4 py-1.5 text-body tabular ${tab === key ? 'ta-seg-on' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          {/* 지점별 스탭 설문(탈리) — 앱 계정 없이 걷은 요청은 여기서 본다 */}
          {STORE_SURVEYS[store] && (
            <a
              href={STORE_SURVEYS[store]!.url}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              {STORE_SURVEYS[store]!.label} ↗
            </a>
          )}
          {board && <span className="tabular">스탭 {board.staff.length}명</span>}
        </div>
      </div>

      {error && <p className="ta-error text-body">{error}</p>}
      {!board ? (
        <p className="text-body text-muted-foreground">불러오는 중…</p>
      ) : (
        <>
          {tab === 'wish' && (
          <section className="space-y-8">
            {openTotal === 0 && <p className="text-body text-muted-foreground">없음</p>}
            <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {TEACHING_CATEGORIES.map((cat) => {
                const rows = cat.topics.map((t) => ({ t, wanters: wantersOf(t.key) })).filter((r) => r.wanters.length > 0);
                if (rows.length === 0) return null;
                return (
                  <div key={cat.key} className="space-y-3">
                    <span className="ta-label">{cat.label}</span>
                    <ul className="space-y-4">
                      {rows.map(({ t, wanters }) => (
                        <li key={t.key} className="space-y-2">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="text-body">{t.label}</span>
                            <span className="text-caption text-muted-foreground tabular">{wanters.length}명</span>
                            <button className="text-caption underline underline-offset-2" onClick={() => openDraft(t.key)}>
                              교육함
                            </button>
                          </div>
                                                    <p className="text-body text-muted-foreground">
                            {wanters.map((w, i) => (
                              <span key={w.userId}>
                                {i > 0 && ' · '}
                                {w.priority && <span className="mr-0.5 text-foreground">{['①', '②', '③'][w.priority - 1]}</span>}
                                {w.name}
                              </span>
                            ))}
                          </p>
                          {draft?.topicKey === t.key && (
                            <div className="space-y-4 rounded-md bg-muted/40 p-4">
                              <div className="flex flex-wrap items-end gap-3">
                                <label className="block">
                                  <span className="ta-label">날짜</span>
                                  <input type="date" className="ta-input" value={draft.date} max={me.today} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                                </label>
                              </div>
                              <div>
                                <span className="ta-label">참석한 스탭</span>
                                <div className="flex flex-wrap gap-2">
                                  {board.staff.map((s) => {
                                    const on = draft.attendees.has(s.userId);
                                    return (
                                      <button
                                        key={s.userId}
                                        type="button"
                                        className={`ta-btn h-8 ${on ? 'bg-primary text-primary-foreground hover:opacity-90' : ''}`}
                                        onClick={() => {
                                          const n = new Set(draft.attendees);
                                          if (on) n.delete(s.userId);
                                          else n.add(s.userId);
                                          setDraft({ ...draft, attendees: n });
                                        }}
                                      >
                                        {s.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <input className="ta-input w-full" placeholder="한 줄 메모 (선택)" value={draft.memo} maxLength={300} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
                              <div className="flex items-center gap-3">
                                <button className="ta-btn-primary" disabled={busy || draft.attendees.size === 0} onClick={submit}>
                                  {busy ? '기록 중…' : '교육함 기록'}
                                </button>
                                <button className="ta-btn" onClick={() => setDraft(null)}>취소</button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
          )}

          {tab === 'wish' && board.notes.length > 0 && (
            <section className="space-y-4">
              <span className="ta-label">이런 것도 배우고 싶어요</span>
              <ul className="space-y-3">
                {board.notes.map((n) => (
                  <li key={n.userId} className="text-body">
                    <span className="text-muted-foreground">{n.name}</span> · {n.note}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === 'log' && (
          <section className="space-y-4">
            {board.sessions.length === 0 ? (
              <p className="text-body text-muted-foreground">없음</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-caption uppercase tracking-[0.04em] text-muted-foreground">
                    <th className="px-3 py-2">날짜</th>
                    <th className="px-3 py-2">주제</th>
                    <th className="px-3 py-2">참석</th>
                    <th className="px-3 py-2">매니저</th>
                    <th className="px-3 py-2">메모</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {board.sessions.map((s) => (
                    <tr key={s.id} className="border-t border-border text-body hover:bg-accent">
                      <td className="px-3 py-2 tabular">{fmtMd(s.date)}</td>
                      <td className="px-3 py-2">{topicLabel(s.topicKey)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.attendees.map((a) => a.name).join(', ')}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.managerName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.memo}</td>
                      <td className="px-3 py-2 text-right">
                        {(me.role === 'admin' || s.managerId === me.userId) && (
                          <button className="text-caption text-muted-foreground underline underline-offset-2" onClick={() => removeSession(s.id)}>
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          )}
        </>
      )}
    </div>
  );
}
