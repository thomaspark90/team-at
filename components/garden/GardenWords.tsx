'use client';

import { useCallback, useEffect, useState } from 'react';
import { SEED_WORDS } from '@/app/garden-service/words/seed-words';
import { CURRENT_SEASON } from '@/lib/garden/season';

// 제철 단어 검수 — 손님이 보낸 단어를 게시/반려한다. 게시된 단어는 /garden-service/words 에 뜬다.

type WordRow = {
  id: number;
  text: string;
  season: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
  submit_sid: string | null;
  submit_iphash: string | null;
};

const PUBLIC_URL = '/garden-service/words';

function fmt(ts: string) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function GardenWords() {
  const [words, setWords] = useState<WordRow[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/garden-words?scope=admin');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || '목록을 불러오지 못했습니다.');
      setWords(body.words as WordRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
      setWords([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: number, status: WordRow['status']) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/garden-words', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '변경하지 못했습니다.');
      setWords((prev) =>
        prev
          ? prev.map((w) =>
              w.id === id
                ? { ...w, status, decided_at: status === 'pending' ? null : new Date().toISOString() }
                : w
            )
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '변경하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const pending = (words ?? []).filter((w) => w.status === 'pending');
  const approved = (words ?? []).filter((w) => w.status === 'approved');
  // 공개 페이지는 현재 시즌만 노출하므로, '떠 있는 단어' 집계도 같은 기준을 쓴다
  const approvedLive = approved.filter((w) => w.season === CURRENT_SEASON);
  const rejected = (words ?? []).filter((w) => w.status === 'rejected');

  // 같은 제출자 묶기 — 세션 ID(없으면 IP 해시) 기준으로 ㄱ·ㄴ·ㄷ… 라벨을 붙인다.
  // 식별값 도입 전의 단어는 라벨이 없다.
  const submitterMap = new Map<string, string>();
  const LABELS = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';
  for (const w of words ?? []) {
    const k = w.submit_sid || w.submit_iphash;
    if (k && !submitterMap.has(k)) submitterMap.set(k, LABELS[submitterMap.size % LABELS.length]);
  }
  const subLabel = (w: WordRow) => {
    const k = w.submit_sid || w.submit_iphash;
    return k ? submitterMap.get(k) ?? null : null;
  };
  const subTitle = (w: WordRow) => {
    const s = subLabel(w);
    return `${fmt(w.created_at)} 제출${s ? ` · 제출자 ${s}` : ''}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium">제철 단어 검수</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          손님이 보낸 단어를 게시하면{' '}
          <a href={PUBLIC_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            공개 페이지
          </a>
          의 단어 무리에 합류합니다.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-border bg-card px-4 py-3 text-[13px] text-red-500">{error}</p>
      )}

      {words === null ? (
        <p className="text-[13px] text-muted-foreground">불러오는 중…</p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">
              지금 화면에 떠 있는 단어 {SEED_WORDS.length + approvedLive.length}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {SEED_WORDS.map((w) => (
                <li
                  key={'seed-' + w.t}
                  className="rounded-full border border-border px-3.5 py-1.5 text-[13px] text-muted-foreground"
                  title="기본 제철 단어"
                >
                  {w.t}
                </li>
              ))}
              {approvedLive.map((w) => (
                <li
                  key={'live-' + w.id}
                  className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px]"
                  title="게시된 손님 단어"
                >
                  {w.text}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-muted-foreground">
              흐린 것은 기본 제철 단어, 진한 것은 게시된 손님 단어입니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">
              대기 중 {pending.length > 0 && <span className="text-foreground">{pending.length}</span>}
            </h2>
            {pending.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">대기 중인 단어가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <span className="text-[17px]">{w.text}</span>
                      <span className="ml-3 text-[12px] text-muted-foreground">
                        {fmt(w.created_at)}
                        {subLabel(w) && ` · 제출자 ${subLabel(w)}`}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => setStatus(w.id, 'approved')}
                        disabled={busyId === w.id}
                        className="rounded-md bg-foreground px-3.5 py-2 text-[13px] text-background disabled:opacity-50"
                      >
                        게시
                      </button>
                      <button
                        onClick={() => setStatus(w.id, 'rejected')}
                        disabled={busyId === w.id}
                        className="rounded-md border border-border px-3.5 py-2 text-[13px] text-muted-foreground disabled:opacity-50"
                      >
                        반려
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">게시됨 {approved.length}</h2>
            {approved.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">아직 게시된 손님 단어가 없습니다.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {approved.map((w) => (
                  <li
                    key={w.id}
                    title={subTitle(w)}
                    className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-3.5 pr-2 text-[13px]"
                  >
                    {w.text}
                    <button
                      onClick={() => setStatus(w.id, 'rejected')}
                      disabled={busyId === w.id}
                      title="내리기"
                      className="rounded-full px-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {rejected.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">반려됨 {rejected.length}</h2>
              <ul className="flex flex-wrap gap-2">
                {rejected.map((w) => (
                  <li
                    key={w.id}
                    title={subTitle(w)}
                    className="flex items-center gap-2 rounded-full border border-border py-1.5 pl-3.5 pr-2 text-[13px] text-muted-foreground"
                  >
                    <span className="line-through">{w.text}</span>
                    {subLabel(w) && <span className="text-[11px]">{subLabel(w)}</span>}
                    <button
                      onClick={() => setStatus(w.id, 'pending')}
                      disabled={busyId === w.id}
                      title="대기로 복구"
                      className="rounded-full px-1.5 hover:text-foreground disabled:opacity-50"
                    >
                      ↺
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
