'use client';

import { useCallback, useEffect, useState } from 'react';

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
  reply_text: string | null;
  status: string;
  posted_at: string | null;
  post_error: string | null;
};

const STORE_LABEL: Record<string, string> = { yangjae: '양재천점', pangyo: '판교점' };
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
  { key: 'all', label: '전체' },
];

export default function ReviewInbox() {
  const [tab, setTab] = useState('open');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/garden-reviews?tab=${t}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오지 못했습니다.');
      setReviews(json.reviews);
      setDrafts(
        Object.fromEntries(
          (json.reviews as Review[]).map((r) => [r.id, r.reply_text ?? r.draft ?? '']),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const act = async (id: number, action: 'approve' | 'skip' | 'redraft') => {
    setBusy(id);
    setError('');
    try {
      const res = await fetch('/api/garden-reviews', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action, text: drafts[id] ?? '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '처리에 실패했습니다.');
      const updated: Review = json.review;
      setReviews((prev) =>
        tab === 'open' && ['skipped', 'posted'].includes(updated.status)
          ? prev.filter((r) => r.id !== id)
          : prev.map((r) => (r.id === id ? updated : r)),
      );
      if (action === 'redraft') setDrafts((d) => ({ ...d, [id]: updated.draft ?? '' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex gap-4" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-[13px] transition-colors ${
              tab === t.key ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px]" style={{ color: '#c0392b', marginBottom: 12 }}>{error}</p>}
      {loading && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}
      {!loading && reviews.length === 0 && (
        <p className="text-[13px] text-muted-foreground">표시할 리뷰가 없습니다.</p>
      )}

      <div className="flex flex-col gap-3">
        {reviews.map((r) => {
          const editable = !['posted', 'skipped', 'replied_elsewhere'].includes(r.status);
          return (
            <article key={r.id} className="rounded-lg border border-border bg-card/40" style={{ padding: 16 }}>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground" style={{ marginBottom: 8 }}>
                <span className="font-medium text-foreground">{STORE_LABEL[r.store_key] ?? r.store_key}</span>
                <span>{r.reviewed_at.slice(0, 10)}</span>
                {r.rating != null && <span>★ {r.rating}</span>}
                {r.author && <span>{r.author}</span>}
                {!!r.photo_count && <span>사진 {r.photo_count}장</span>}
                <span className="ml-auto">{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>

              <p className="text-[13px] whitespace-pre-wrap" style={{ margin: '0 0 8px' }}>
                {r.content?.trim() || <span className="text-muted-foreground">(본문 없이 사진만 등록된 리뷰)</span>}
              </p>

              {!!r.keywords?.length && (
                <p className="text-[12px] text-muted-foreground" style={{ margin: '0 0 12px' }}>
                  {r.keywords.join(' · ')}
                </p>
              )}

              {editable ? (
                <>
                  <textarea
                    value={drafts[r.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    rows={3}
                    placeholder="답글 초안"
                    className="w-full rounded-md border border-border bg-background text-[13px]"
                    style={{ padding: 10, resize: 'vertical' }}
                  />
                  <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 8 }}>
                    <button
                      onClick={() => act(r.id, 'approve')}
                      disabled={busy === r.id || !(drafts[r.id] ?? '').trim()}
                      className="rounded-md bg-foreground text-background text-[13px] disabled:opacity-40"
                      style={{ padding: '6px 14px' }}
                    >
                      {r.status === 'approved' ? '수정 후 재승인' : '승인'}
                    </button>
                    <button
                      onClick={() => act(r.id, 'redraft')}
                      disabled={busy === r.id}
                      className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      초안 다시 생성
                    </button>
                    <button
                      onClick={() => act(r.id, 'skip')}
                      disabled={busy === r.id}
                      className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      답글 안 달기
                    </button>
                    {busy === r.id && <span className="text-[12px] text-muted-foreground">처리 중…</span>}
                  </div>
                </>
              ) : (
                r.reply_text && (
                  <p className="text-[13px] rounded-md bg-muted/40 whitespace-pre-wrap" style={{ padding: 10, margin: 0 }}>
                    {r.reply_text}
                  </p>
                )
              )}

              {r.post_error && (
                <p className="text-[12px]" style={{ color: '#c0392b', marginTop: 8 }}>
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
