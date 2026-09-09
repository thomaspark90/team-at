'use client';

import { useCallback, useEffect, useState } from 'react';
import { TEACHING_CATEGORIES, topicLabel } from '@/lib/teaching/topics';
import { STORES, type StoreId } from '@/lib/types';
import { api, type StaffDetail, type TeachingMe } from './types';

// 지점 근무자 명부 — 대표·티칭 스태프가 본다.
//  · 등록: 이름·지점만(로그인 없음). 등록 즉시 교육 일정의 '교육 대상' 선택지와 지점 집계에 들어간다.
//  · 세부 정보: 설문(탈리) 결과를 대표가 대신 옮긴다 — 배우고 싶은 것 체크, ①②③ 순위, 메모. 티칭 스태프는 일정 카드에서 이 정보를 본다.
//  · 본인이 앱에 들어와 직접 고치게 하려면 설정 › 간편 계정 › '로그인 열기'.

const PRIORITY_MARK = ['①', '②', '③'];
const storeShort = (id: string) => STORES.find((s) => s.id === id)?.short ?? id;

type Draft = { name: string; stores: StoreId[]; topics: Set<string>; priorities: Record<string, number | null>; note: string };

export default function StaffRoster({ me, onChange }: { me: TeachingMe; onChange: () => void }) {
  const [store, setStore] = useState<StoreId>(me.profile?.stores[0] ?? 'pangyo');
  const [staff, setStaff] = useState<StaffDetail[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 등록 폼
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStores, setNewStores] = useState<StoreId[]>([store]);
  // 편집 중인 사람
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api<{ staff: StaffDetail[] }>(`/api/garden-teaching/staff?store=${store}`);
      setStaff(r.staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    }
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChange(); // 교육 대상 선택지(me.staff)도 갱신
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      await api('/api/garden-teaching/staff', { method: 'POST', body: JSON.stringify({ name: newName, stores: newStores }) });
      setNewName('');
      setAdding(false);
    });

  const startEdit = (p: StaffDetail) => {
    setEditId(p.userId);
    setDraft({
      name: p.name,
      stores: p.stores,
      topics: new Set(p.wishes.map((w) => w.topicKey)),
      priorities: Object.fromEntries(p.wishes.map((w) => [w.topicKey, w.priority])),
      note: p.note,
    });
  };

  const save = () => {
    if (!editId || !draft) return;
    const priorities: Record<string, number | null> = {};
    Array.from(draft.topics).forEach((k) => { priorities[k] = draft.priorities[k] ?? null; });
    void run(async () => {
      await api('/api/garden-teaching/staff', {
        method: 'PATCH',
        body: JSON.stringify({ userId: editId, name: draft.name, stores: draft.stores, topics: Array.from(draft.topics), priorities, note: draft.note }),
      });
      setEditId(null);
      setDraft(null);
    });
  };

  const remove = (p: StaffDetail) => {
    if (!window.confirm(`${p.name}님을 명부에서 지울까요? 배우고 싶은 것·교육 기록도 함께 지워집니다.`)) return;
    void run(() => api('/api/garden-teaching/staff', { method: 'DELETE', body: JSON.stringify({ userId: p.userId }) }).then(() => {}));
  };

  // 순위 토글 — 같은 순위를 다른 주제가 갖고 있으면 그쪽을 비운다(순위는 하나씩)
  const setPriority = (key: string, p: number | null) => {
    if (!draft) return;
    const next: Record<string, number | null> = { ...draft.priorities };
    if (p !== null) for (const k of Object.keys(next)) if (next[k] === p) next[k] = null;
    next[key] = p;
    setDraft({ ...draft, priorities: next });
  };
  const toggleTopic = (key: string) => {
    if (!draft) return;
    const topics = new Set(draft.topics);
    const priorities = { ...draft.priorities };
    if (topics.has(key)) {
      topics.delete(key);
      priorities[key] = null;
    } else topics.add(key);
    setDraft({ ...draft, topics, priorities });
  };

  const storeToggles = (selected: StoreId[], onToggle: (id: StoreId) => void) => (
    <div className="flex gap-1">
      {STORES.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => onToggle(s.id)}
            className={`rounded-md border px-2 py-0.5 text-caption ${on ? 'border-foreground' : 'border-border text-muted-foreground'}`}
          >
            {s.short}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-title">지점 근무자</h2>
          <div className="flex rounded-md border border-border p-1">
            {STORES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStore(s.id)}
                className={`rounded-sm px-3 py-1 text-body ${store === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <button
          className={adding ? 'ta-btn' : 'ta-btn-primary'}
          onClick={() => {
            setAdding((v) => !v);
            setNewStores([store]);
          }}
        >
          {adding ? '닫기' : '+ 근무자'}
        </button>
      </div>
      <p className="text-body text-muted-foreground">
        이름만으로 등록됩니다(로그인 없음). 등록하면 교육 일정의 교육 대상으로 고를 수 있고, 배우고 싶은 것·순위·메모를 여기서 대신 적으면
        티칭 스태프의 일정 카드에 보입니다. 본인이 직접 고치게 하려면 설정 › 간편 계정에서 로그인을 열어주세요.
      </p>

      {adding && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-4">
          <label className="block">
            <span className="ta-label">이름</span>
            <input className="ta-input" value={newName} maxLength={12} placeholder="홍길동" onChange={(e) => setNewName(e.target.value)} />
          </label>
          <div>
            <span className="ta-label">지점</span>
            {storeToggles(newStores, (id) => setNewStores((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])))}
          </div>
          <button className="ta-btn-primary" disabled={busy || !newName.trim() || newStores.length === 0} onClick={add}>
            {busy ? '등록 중…' : '등록'}
          </button>
        </div>
      )}
      {error && <p className="ta-error text-body">{error}</p>}

      {staff === null ? (
        <p className="text-body text-muted-foreground">불러오는 중…</p>
      ) : staff.length === 0 ? (
        <p className="text-body text-muted-foreground">등록된 근무자가 없어요. '+ 근무자'로 이름을 넣어주세요.</p>
      ) : (
        <ul className="divide-y divide-border">
          {staff.map((p) => {
            const editing = editId === p.userId && draft;
            const open = p.wishes.filter((w) => !w.received);
            return (
              <li key={p.userId} className="space-y-3 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-body font-medium">{p.name}</span>
                  <span className="text-caption text-muted-foreground">{p.stores.map(storeShort).join('·')}</span>
                  <span className="text-caption text-muted-foreground">
                    {p.rosterOnly ? '명부 등록' : p.simpleLogin ? '간편 계정' : '구글 계정'}
                  </span>
                  <span className="ml-auto flex gap-3 text-caption">
                    {!editing && (
                      <button className="underline underline-offset-2" disabled={busy} onClick={() => startEdit(p)}>
                        세부 정보 편집
                      </button>
                    )}
                    {p.rosterOnly && !editing && (
                      <button className="text-muted-foreground underline underline-offset-2" disabled={busy} onClick={() => remove(p)}>
                        삭제
                      </button>
                    )}
                  </span>
                </div>

                {!editing && (
                  <div className="space-y-1 text-body">
                    {open.length === 0 ? (
                      <p className="text-muted-foreground">배우고 싶은 것 미입력</p>
                    ) : (
                      <p>
                        {open.map((w, i) => (
                          <span key={w.topicKey}>
                            {i > 0 && <span className="text-muted-foreground"> · </span>}
                            {w.priority && <span className="mr-0.5">{PRIORITY_MARK[w.priority - 1]}</span>}
                            <span className={w.priority ? '' : 'text-muted-foreground'}>{topicLabel(w.topicKey)}</span>
                          </span>
                        ))}
                      </p>
                    )}
                    {p.note && <p className="text-muted-foreground">메모 · {p.note}</p>}
                  </div>
                )}

                {editing && draft && (
                  <div className="space-y-5 rounded-md bg-muted/40 p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block">
                        <span className="ta-label">이름</span>
                        <input className="ta-input" value={draft.name} maxLength={12} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </label>
                      <div>
                        <span className="ta-label">지점</span>
                        {storeToggles(draft.stores, (id) =>
                          setDraft({ ...draft, stores: draft.stores.includes(id) ? draft.stores.filter((x) => x !== id) : [...draft.stores, id] }),
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="ta-label">배우고 싶은 것 · 체크하고 ①②③으로 순위</span>
                      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                        {TEACHING_CATEGORIES.map((cat) => (
                          <div key={cat.key} className="space-y-1">
                            <span className="text-caption text-muted-foreground">{cat.label}</span>
                            <ul className="space-y-1">
                              {cat.topics
                                .filter((t) => !t.retired || draft.topics.has(t.key))
                                .map((t) => {
                                  const on = draft.topics.has(t.key);
                                  const pr = draft.priorities[t.key] ?? null;
                                  return (
                                    <li key={t.key} className="flex items-center gap-2 text-body">
                                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                                        <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--foreground))]" checked={on} onChange={() => toggleTopic(t.key)} />
                                        <span className={on ? '' : 'text-muted-foreground'}>{t.label}</span>
                                      </label>
                                      {on && (
                                        <span className="flex gap-1">
                                          {[1, 2, 3].map((n) => (
                                            <button
                                              key={n}
                                              type="button"
                                              onClick={() => setPriority(t.key, pr === n ? null : n)}
                                              className={`h-6 w-6 rounded-full border text-caption ${pr === n ? 'border-foreground bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}
                                            >
                                              {n}
                                            </button>
                                          ))}
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="ta-label">메모 (설문 자유 서술·직접 추가 주제)</span>
                      <textarea className="ta-input h-20 w-full py-2" value={draft.note} maxLength={500} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </label>
                    <div className="flex items-center gap-3">
                      <button className="ta-btn-primary" disabled={busy || !draft.name.trim() || draft.stores.length === 0} onClick={save}>
                        {busy ? '저장 중…' : '저장'}
                      </button>
                      <button
                        className="ta-btn"
                        onClick={() => {
                          setEditId(null);
                          setDraft(null);
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
