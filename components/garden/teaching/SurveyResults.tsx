'use client';

import { useCallback, useEffect, useState } from 'react';
import { TEACHING_CATEGORIES } from '@/lib/teaching/topics';
import { STORES, type StoreId } from '@/lib/types';
import { STORE_SURVEYS } from '@/lib/teaching/survey';
import { api } from './types';

// 스탭 설문(탈리) 결과 — 교육 탭 맨 아래, 운영 권한 화면에만.
// 데이터는 finance.teaching_survey_responses — 탈리 웹훅이 응답을 넣고 명부에도 자동 반영한다(2026-09-10).
// 매니저 보드와 같은 모양(카테고리 → 주제 · N명 · 이름, ①②③ 은 그 사람의 순위)으로 읽히게 한다.

type Response = {
  id: number;
  store: StoreId;
  name: string;
  submittedAt: string;
  topics: string[];
  custom: string[];
  priorities: (string | null)[];
  note: string;
  appliedUserId: string | null;
};

const RANK = ['①', '②', '③'];
const fmtKst = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export default function SurveyResults({ onApplied }: { onApplied?: () => void }) {
  const [responses, setResponses] = useState<Response[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api<{ responses: Response[] }>('/api/garden-teaching/survey');
      setResponses(r.responses);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await api('/api/garden-teaching/survey', { method: 'POST', body: JSON.stringify({ responseId: id }) });
      await load();
      onApplied?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  if (responses === null) return error ? <p className="ta-error text-body">{error}</p> : null;
  const stores = STORES.filter((s) => responses.some((r) => r.store === s.id));
  if (stores.length === 0) return null;

  return (
    <div className="space-y-12">
      {error && <p className="ta-error text-body">{error}</p>}
      {stores.map((s) => {
        const list = responses.filter((r) => r.store === s.id);
        const link = STORE_SURVEYS[s.id];
        const latest = list[0]?.submittedAt;
        const rankOf = (r: Response, key: string) => {
          const i = r.priorities.indexOf(key);
          return i >= 0 ? RANK[i] : null;
        };
        const customs = list.flatMap((r) => r.custom.map((text) => ({ name: r.name, text, rank: rankOf(r, 'custom') })));
        const notes = list.filter((r) => r.note.trim());
        const unapplied = list.filter((r) => !r.appliedUserId);

        return (
          <section key={s.id} className="space-y-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="ta-label">{s.label} 설문 결과</span>
                <span className="text-caption text-muted-foreground tabular">
                  응답 {list.length}명{latest ? ` · 최근 ${fmtKst(latest)}` : ''} · ①②③ 은 본인이 고른 순위 · 새 응답은 탈리 웹훅으로 자동 반영
                </span>
              </div>
              {link && (
                <a href={link.url} target="_blank" rel="noreferrer" className="text-caption text-foreground underline underline-offset-2">
                  탈리 ↗
                </a>
              )}
            </div>

            {/* 응답자 줄 — 명부 반영 여부 */}
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-caption">
              {list.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="text-foreground">{r.name}</span>
                  <span className="tabular text-muted-foreground">{fmtKst(r.submittedAt)}</span>
                  {r.appliedUserId ? (
                    <span className="text-emerald-600">명부 반영됨</span>
                  ) : (
                    <button className="underline underline-offset-2" disabled={busyId === r.id} onClick={() => apply(r.id)}>
                      {busyId === r.id ? '반영 중…' : '명부에 반영'}
                    </button>
                  )}
                </li>
              ))}
              {unapplied.length === 0 && list.length > 0 && <li className="text-muted-foreground">전원 명부 반영 완료</li>}
            </ul>

            <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {TEACHING_CATEGORIES.map((cat) => {
                const rows = cat.topics
                  .map((t) => ({ t, who: list.filter((r) => r.topics.includes(t.key)) }))
                  .filter((r) => r.who.length > 0);
                if (rows.length === 0) return null;
                return (
                  <div key={cat.key} className="space-y-3">
                    <span className="ta-label">{cat.label}</span>
                    <ul className="space-y-4">
                      {rows.map(({ t, who }) => (
                        <li key={t.key} className="space-y-1">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="text-body">{t.label}</span>
                            <span className="text-caption text-muted-foreground tabular">{who.length}명</span>
                          </div>
                          <p className="text-body text-muted-foreground">
                            {who.map((r, i) => {
                              const rank = rankOf(r, t.key);
                              return (
                                <span key={r.id}>
                                  {i > 0 && ' · '}
                                  {rank && <span className="mr-0.5 text-foreground">{rank}</span>}
                                  {r.name}
                                </span>
                              );
                            })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {customs.length > 0 && (
                <div className="space-y-3">
                  <span className="ta-label">직접 추가한 주제</span>
                  <ul className="space-y-3">
                    {customs.map((c, i) => (
                      <li key={i} className="text-body">
                        <span className="text-muted-foreground">
                          {c.rank && <span className="mr-0.5 text-foreground">{c.rank}</span>}
                          {c.name}
                        </span>{' '}
                        · {c.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {notes.length > 0 && (
              <div className="space-y-3">
                <span className="ta-label">자유 서술</span>
                <ul className="space-y-3">
                  {notes.map((r) => (
                    <li key={r.id} className="text-body">
                      <span className="text-muted-foreground">{r.name}</span> · {r.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
