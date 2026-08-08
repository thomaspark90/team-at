'use client';

import { useCallback, useEffect, useState } from 'react';
import { ISSUE_CATEGORIES } from '@/lib/garden/review-issue';
import { REVIEW_POST_GRACE_MS, REVIEWS_CHANGED_EVENT } from '@/lib/garden/review-constants';
import { STORES } from '@/lib/types';
import { fmtDate } from '@/lib/garden/format';

type DraftVariant = { tone: string; label: string; text: string };

type Review = {
  id: number;
  review_id: string;
  store_key: string;
  author: string | null;
  rating: number | null;
  content: string | null;
  keywords: string[] | null;
  visit_count: number | null;
  photo_count: number | null;
  reviewed_at: string;
  draft: string | null;
  draft_variants: DraftVariant[] | null;
  reply_text: string | null;
  status: string;
  approved_tone: string | null;
  approved_at: string | null;
  posted_at: string | null;
  post_error: string | null;
  issue: boolean | null;
  issue_note: string | null;
  issue_categories: string[] | null;
  issue_source: string | null;
};

// 매장 라벨·필터는 lib/types STORES 단일 정의에서 유도
const STORE_LABEL: Record<string, string> = Object.fromEntries(STORES.map((s) => [s.id, s.label]));
const STATUS_LABEL: Record<string, string> = {
  new: '초안 대기',
  drafted: '승인 대기',
  approved: '게시 대기',
  posted: '게시 완료',
  skipped: '건너뜀',
  replied_elsewhere: '답글 있음',
};

const TABS = [
  { key: 'open', label: '처리 대기' },
  { key: 'posted', label: '게시 완료' },
  { key: 'issues', label: '이슈·개선' },
  { key: 'all', label: '전체' },
];

// 이슈 뱃지 색 — 경고성 정보라 에러(#c0392b)보다 낮은 온도의 앰버 계열
const ISSUE_COLOR = '#b45309';

// 승인 후 게시까지의 유예 시간 — 서버(queue·cancel)와 단일 상수를 공유한다
const GRACE_MS = REVIEW_POST_GRACE_MS;

const postEta = (approvedAt: string | null) => {
  if (!approvedAt) return null;
  const eta = new Date(new Date(approvedAt).getTime() + GRACE_MS);
  return `${String(eta.getHours()).padStart(2, '0')}:${String(eta.getMinutes()).padStart(2, '0')}`;
};

// 매장 필터 — 두 매장을 한 화면에서 나눠 관리
const STORE_FILTERS = [
  { key: 'all', label: '전체 매장' },
  ...STORES.map((s) => ({ key: s.id as string, label: s.label })),
];

export default function ReviewInbox() {
  const [tab, setTab] = useState('open');
  const [store, setStore] = useState('all');
  const [reviews, setReviews] = useState<Review[]>([]);
  // 톤별 편집 텍스트: texts[id][tone] / 톤 미제공(구형) 리뷰는 single[id]
  const [texts, setTexts] = useState<Record<number, Record<string, string>>>({});
  const [single, setSingle] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<Record<number, string | undefined>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 이슈 미분류(백필 대상) 잔여 건수 — issues 탭에서만 내려온다
  const [unclassified, setUnclassified] = useState(0);
  const [classifying, setClassifying] = useState(false);
  // 이슈 탭 카테고리 필터
  const [cat, setCat] = useState('all');

  const seed = useCallback((list: Review[]) => {
    const t: Record<number, Record<string, string>> = {};
    const sg: Record<number, string> = {};
    const s: Record<number, string | undefined> = {};
    for (const r of list) {
      if (r.draft_variants?.length) {
        t[r.id] = Object.fromEntries(
          r.draft_variants.map((v) => [
            v.tone,
            r.approved_tone === v.tone && r.reply_text ? r.reply_text : v.text,
          ]),
        );
        if (r.approved_tone) s[r.id] = r.approved_tone;
      } else {
        sg[r.id] = r.reply_text ?? r.draft ?? '';
      }
    }
    setTexts(t);
    setSingle(sg);
    setSel(s);
  }, []);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/garden-reviews?tab=${t}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오지 못했습니다.');
      setReviews(json.reviews);
      setUnclassified(typeof json.unclassified === 'number' ? json.unclassified : 0);
      seed(json.reviews);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [seed]);

  useEffect(() => { load(tab); }, [tab, load]);

  const act = async (r: Review, action: 'approve' | 'skip' | 'redraft' | 'cancel') => {
    setBusy(r.id);
    setError('');
    try {
      const tone = sel[r.id];
      const text = r.draft_variants?.length
        ? (tone ? texts[r.id]?.[tone] ?? '' : '')
        : single[r.id] ?? '';
      const res = await fetch('/api/garden-reviews', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: r.id, action, text, tone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '처리에 실패했습니다.');
      const updated: Review = json.review;
      setReviews((prev) =>
        tab === 'open' && ['skipped', 'posted'].includes(updated.status)
          ? prev.filter((x) => x.id !== r.id)
          : prev.map((x) => (x.id === r.id ? updated : x)),
      );
      if (action === 'redraft' && updated.draft_variants?.length) {
        setTexts((t) => ({
          ...t,
          [r.id]: Object.fromEntries(updated.draft_variants!.map((v) => [v.tone, v.text])),
        }));
        setSel((s) => ({ ...s, [r.id]: undefined }));
      }
      if (action === 'cancel') setSel((s) => ({ ...s, [r.id]: undefined }));
      // 네비 배지 갱신 신호 — GardenNav가 듣고 건수를 다시 가져간다
      window.dispatchEvent(new Event(REVIEWS_CHANGED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  };

  // 기존 리뷰 이슈 분류 백필 — remaining=0 이 될 때까지 배치 호출을 반복한다.
  // 한 번의 호출이 0건을 처리하면(연속 실패) 무한 반복을 막기 위해 중단한다.
  const runClassify = async () => {
    setClassifying(true);
    setError('');
    try {
      for (;;) {
        const res = await fetch('/api/garden-reviews/classify', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '분류에 실패했습니다.');
        setUnclassified(json.remaining);
        if (json.remaining <= 0 || json.classified === 0) break;
      }
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : '분류에 실패했습니다.');
    } finally {
      setClassifying(false);
    }
  };

  // 이슈 판정 수동 정정 — 이슈 탭에서 아님 처리하면 목록에서 뺀다
  const setIssue = async (r: Review, issue: boolean) => {
    setBusy(r.id);
    setError('');
    try {
      const res = await fetch('/api/garden-reviews', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: r.id, action: 'set_issue', issue }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '처리에 실패했습니다.');
      const updated: Review = json.review;
      setReviews((prev) =>
        tab === 'issues' && !issue
          ? prev.filter((x) => x.id !== r.id)
          : prev.map((x) => (x.id === r.id ? updated : x)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const byStore = store === 'all' ? reviews : reviews.filter((r) => r.store_key === store);
  const shown =
    tab === 'issues' && cat !== 'all'
      ? byStore.filter((r) => r.issue_categories?.includes(cat))
      : byStore;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setCat('all'); }}
            className={`text-[13px] transition-colors ${
              tab === t.key ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span aria-hidden className="h-3 w-px bg-border" />
        {STORE_FILTERS.map((s) => {
          const count =
            s.key === 'all' ? reviews.length : reviews.filter((r) => r.store_key === s.key).length;
          return (
            <button
              key={s.key}
              onClick={() => setStore(s.key)}
              className={`text-[13px] transition-colors ${
                store === s.key ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label} {count > 0 && <span className="text-[11px] text-muted-foreground">{count}</span>}
            </button>
          );
        })}
      </div>

      {error && <p className="ta-error text-[13px]" style={{ marginBottom: 12 }}>{error}</p>}

      {/* 이슈 탭 — 아직 분류되지 않은 과거 리뷰가 있으면 백필 실행을 안내 */}
      {tab === 'issues' && !loading && unclassified > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 text-[13px]" style={{ padding: '10px 12px', marginBottom: 12 }}>
          <span className="text-muted-foreground">
            분류가 필요한 리뷰가 {unclassified}건 있습니다(미분류·카테고리 보완 포함). 실행하면 이슈 리뷰가 이 탭에 모입니다.
          </span>
          <button
            onClick={runClassify}
            disabled={classifying}
            className="rounded-md bg-foreground text-background text-[13px] disabled:opacity-40"
            style={{ padding: '4px 12px' }}
          >
            {classifying ? `분류 중… (남은 ${unclassified}건)` : '분류 실행'}
          </button>
        </div>
      )}

      {/* 이슈 탭 카테고리 필터 — 로드된 이슈 리뷰 기준 건수 표시 */}
      {tab === 'issues' && !loading && byStore.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
          {['all', ...ISSUE_CATEGORIES].map((c) => {
            const count = c === 'all' ? byStore.length : byStore.filter((r) => r.issue_categories?.includes(c)).length;
            if (c !== 'all' && count === 0) return null;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-full border text-[11px] transition-colors ${
                  cat === c ? 'border-foreground font-medium text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                style={{ padding: '3px 10px' }}
              >
                {c === 'all' ? '전체' : c} {count}
              </button>
            );
          })}
        </div>
      )}

      {loading && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}
      {!loading && shown.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          {tab === 'issues' ? '모아둔 이슈·개선 리뷰가 없습니다.' : '표시할 리뷰가 없습니다.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {shown.map((r) => {
          const pending = ['new', 'drafted'].includes(r.status);
          const approved = r.status === 'approved';
          const hasVariants = !!r.draft_variants?.length;
          return (
            <article key={r.id} className="rounded-lg bg-muted/40" style={{ padding: 16 }}>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" style={{ marginBottom: 8 }}>
                <span className="font-medium text-foreground">{STORE_LABEL[r.store_key] ?? r.store_key}</span>
                <span>{fmtDate(r.reviewed_at)}</span>
                {r.rating != null && <span>★ {r.rating}</span>}
                {r.author && <span>{r.author}</span>}
                {r.visit_count != null && r.visit_count > 1 && <span>{r.visit_count}번째 방문</span>}
                {!!r.photo_count && <span>사진 {r.photo_count}장</span>}
                <span className="ml-auto">{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>

              {/* 이슈 리뷰 표시 — 어느 탭에서든 뱃지·카테고리·지적 요약을 보여주고, 수동 정정을 허용한다 */}
              {r.issue && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ color: ISSUE_COLOR, margin: '0 0 6px' }}>
                  <span
                    className="rounded-sm font-medium"
                    style={{ border: `1px solid ${ISSUE_COLOR}55`, padding: '1px 6px' }}
                  >
                    이슈{r.issue_source === 'manual' ? ' · 수동' : ''}
                  </span>
                  {!!r.issue_categories?.length && (
                    <span className="font-medium">{r.issue_categories.join(' · ')}</span>
                  )}
                  <span>{r.issue_note}</span>
                  <button
                    onClick={() => setIssue(r, false)}
                    disabled={busy === r.id}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    이슈 아님
                  </button>
                </p>
              )}
              {r.issue === false && (
                <p className="text-[13px]" style={{ margin: '0 0 6px' }}>
                  <button
                    onClick={() => setIssue(r, true)}
                    disabled={busy === r.id}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    이슈로 표시
                  </button>
                </p>
              )}

              <p className="text-[13px] whitespace-pre-wrap" style={{ margin: '0 0 8px' }}>
                {r.content?.trim() || <span className="text-muted-foreground">(본문 없이 사진만 등록된 리뷰)</span>}
              </p>

              {!!r.keywords?.length && (
                <p className="text-[11px] text-muted-foreground" style={{ margin: '0 0 12px' }}>
                  {r.keywords.join(' · ')}
                </p>
              )}

              {/* 선택 모드 — 톤 3종을 세로 라디오 목록으로 보여주고 하나를 고른 뒤 확정 */}
              {pending && hasVariants && (
                <>
                  <div className="flex flex-col gap-2" style={{ marginBottom: 8 }}>
                    {r.draft_variants!.map((v) => {
                      const selected = sel[r.id] === v.tone;
                      const toggle = () =>
                        setSel((s) => ({ ...s, [r.id]: selected ? undefined : v.tone }));
                      return (
                        <div
                          key={v.tone}
                          className={`flex items-start gap-3 rounded-lg border bg-muted/20 transition-colors ${
                            selected ? 'border-foreground' : 'border-border'
                          }`}
                          style={{ padding: '10px 12px' }}
                        >
                          <button
                            onClick={toggle}
                            aria-pressed={selected}
                            aria-label={`${v.label} 선택`}
                            className={`flex shrink-0 items-center justify-center rounded-full border transition-colors ${
                              selected ? 'border-foreground' : 'border-border hover:border-foreground'
                            }`}
                            style={{ width: 18, height: 18, marginTop: 3 }}
                          >
                            {selected && (
                              <span className="rounded-full bg-foreground" style={{ width: 10, height: 10 }} />
                            )}
                          </button>
                          <div className="flex-1">
                            <button
                              onClick={toggle}
                              className={`text-[11px] transition-colors ${
                                selected ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {v.label}
                            </button>
                            <textarea
                              value={texts[r.id]?.[v.tone] ?? ''}
                              onChange={(e) =>
                                setTexts((t) => ({ ...t, [r.id]: { ...t[r.id], [v.tone]: e.target.value } }))
                              }
                              rows={1}
                              className="w-full bg-transparent text-[13px] focus:outline-none"
                              // field-sizing: 내용 높이만큼만 차지 (Chrome 123+) — 하단 빈 공간 제거
                              style={{ padding: 0, marginTop: 2, resize: 'none', border: 0, fieldSizing: 'content' } as React.CSSProperties}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => act(r, 'approve')}
                      disabled={busy === r.id || !sel[r.id] || !(texts[r.id]?.[sel[r.id]!] ?? '').trim()}
                      className="rounded-md bg-foreground text-background text-[13px] disabled:opacity-40"
                      style={{ padding: '6px 14px' }}
                    >
                      확정
                    </button>
                    <button
                      onClick={() => act(r, 'redraft')}
                      disabled={busy === r.id}
                      className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      초안 다시 생성
                    </button>
                    <button
                      onClick={() => act(r, 'skip')}
                      disabled={busy === r.id}
                      className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      답글 안 달기
                    </button>
                    {busy === r.id && <span className="text-[13px] text-muted-foreground">처리 중…</span>}
                    {!sel[r.id] && (
                      <span className="text-[13px] text-muted-foreground">톤을 선택하면 확정할 수 있습니다.</span>
                    )}
                  </div>
                </>
              )}

              {/* 구형(톤 없음) 리뷰 — 단일 텍스트 편집 */}
              {pending && !hasVariants && (
                <>
                  <textarea
                    value={single[r.id] ?? ''}
                    onChange={(e) => setSingle((d) => ({ ...d, [r.id]: e.target.value }))}
                    rows={3}
                    placeholder="답글 초안"
                    className="w-full rounded-md border border-border bg-background text-[13px]"
                    style={{ padding: 10, resize: 'vertical' }}
                  />
                  <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 8 }}>
                    <button
                      onClick={() => act(r, 'approve')}
                      disabled={busy === r.id || !(single[r.id] ?? '').trim()}
                      className="rounded-md bg-foreground text-background text-[13px] disabled:opacity-40"
                      style={{ padding: '6px 14px' }}
                    >
                      확정
                    </button>
                    <button
                      onClick={() => act(r, 'redraft')}
                      disabled={busy === r.id}
                      className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      초안 다시 생성
                    </button>
                    <button
                      onClick={() => act(r, 'skip')}
                      disabled={busy === r.id}
                      className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      답글 안 달기
                    </button>
                    {busy === r.id && <span className="text-[13px] text-muted-foreground">처리 중…</span>}
                  </div>
                </>
              )}

              {/* 확정 모드 — 선택안만 블랙, 나머지는 비활성. 유예 안에는 취소 가능 */}
              {approved && (
                <>
                  {hasVariants ? (
                    <div className="flex flex-col gap-2" style={{ marginBottom: 8 }}>
                      {r.draft_variants!.map((v) => {
                        const isSel = r.approved_tone === v.tone;
                        return (
                          <div
                            key={v.tone}
                            className={`flex items-start gap-3 rounded-lg ${
                              isSel
                                ? 'bg-foreground text-background'
                                : 'border border-border opacity-40'
                            }`}
                            style={{ padding: '10px 12px' }}
                          >
                            <span
                              className={`flex shrink-0 items-center justify-center rounded-full border ${
                                isSel ? 'border-background' : 'border-border'
                              }`}
                              style={{ width: 18, height: 18, marginTop: 3 }}
                            >
                              {isSel && (
                                <span className="rounded-full bg-background" style={{ width: 10, height: 10 }} />
                              )}
                            </span>
                            <div className="flex-1">
                              <p className="text-[11px] font-medium" style={{ margin: 0 }}>{v.label}</p>
                              <p className="text-[13px] whitespace-pre-wrap" style={{ margin: '2px 0 0' }}>
                                {isSel ? r.reply_text ?? v.text : v.text}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    r.reply_text && (
                      <p className="text-[13px] rounded-md bg-foreground text-background whitespace-pre-wrap" style={{ padding: 10, margin: '0 0 8px' }}>
                        {r.reply_text}
                      </p>
                    )
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => act(r, 'cancel')}
                      disabled={busy === r.id}
                      className="rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                      style={{ padding: '6px 14px' }}
                    >
                      취소
                    </button>
                    {busy === r.id && <span className="text-[13px] text-muted-foreground">처리 중…</span>}
                    <span className="text-[13px] text-muted-foreground">
                      {postEta(r.approved_at)} 이후 게시 예정 — 취소하면 다시 선택할 수 있습니다.
                    </span>
                  </div>
                </>
              )}

              {/* 종료 상태 — 게시 완료 등은 확정 답글만 표시 */}
              {!pending && !approved && r.reply_text && (
                <p className="text-[13px] rounded-md bg-muted/40 whitespace-pre-wrap" style={{ padding: 10, margin: 0 }}>
                  {r.reply_text}
                </p>
              )}

              {r.post_error && (
                <p className="ta-error text-[13px]" style={{ marginTop: 8 }}>
                  게시 실패: {r.post_error}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
