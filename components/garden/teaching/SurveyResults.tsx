'use client';

import { TEACHING_CATEGORIES } from '@/lib/teaching/topics';
import { STORES } from '@/lib/types';
import { STORE_SURVEYS } from '@/lib/teaching/survey';
import { SURVEY_RESULTS } from '@/lib/teaching/survey-results';

// 스탭 설문(탈리) 결과 — 교육 탭 맨 아래, 운영 권한 화면에만. 데이터는 lib/teaching/survey-results.ts 정적 상수.
// 매니저 보드와 같은 모양(카테고리 → 주제 · N명 · 이름, ①②③ 은 그 사람의 순위)으로 읽히게 한다.

const RANK = ['①', '②', '③'];

export default function SurveyResults() {
  const stores = STORES.filter((s) => SURVEY_RESULTS[s.id]);
  if (stores.length === 0) return null;

  return (
    <div className="space-y-12">
      {stores.map((s) => {
        const result = SURVEY_RESULTS[s.id]!;
        const link = STORE_SURVEYS[s.id];
        const rankOf = (r: { priorities: (string | null)[] }, key: string) => {
          const i = r.priorities.indexOf(key);
          return i >= 0 ? RANK[i] : null;
        };
        const customs = result.responses.flatMap((r) => r.custom.map((text) => ({ name: r.name, text, rank: rankOf(r, 'custom') })));
        const notes = result.responses.filter((r) => r.note.trim());

        return (
          <section key={s.id} className="space-y-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="ta-label">{s.label} 설문 결과</span>
                <span className="text-caption text-muted-foreground tabular">
                  {result.surveyedAt} · 응답 {result.responses.length}명 · ①②③ 은 본인이 고른 순위
                </span>
              </div>
              {link && (
                <a href={link.url} target="_blank" rel="noreferrer" className="text-caption text-foreground underline underline-offset-2">
                  탈리 ↗
                </a>
              )}
            </div>

            <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {TEACHING_CATEGORIES.map((cat) => {
                const rows = cat.topics
                  .map((t) => ({ t, who: result.responses.filter((r) => r.topics.includes(t.key)) }))
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
                                <span key={r.name}>
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
                    <li key={r.name} className="text-body">
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
