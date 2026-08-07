'use client';

import { useCallback, useEffect, useState } from 'react';

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

// 승인 후 게시까지의 유예 시간 — 서버(queue API)의 GRACE_MS와 맞춘다
const GRACE_MS = 60 * 60 * 1000;

const postEta = (approvedAt: string | null) => {
  if (!approvedAt) return null;
  const eta = new Date(new Date(approvedAt).getTime() + GRACE_MS);
  return `${String(eta.getHours()).padStart(2, '0')}:${String(eta.getMinutes()).padStart(2, '0')}`;
};

export default function ReviewInbox() {
  const [tab, setTab] = useState('open');
  const [reviews, setReviews] = useState<Review[]>([]);
  // 톤별 편집 텍스트: texts[id][tone] / 톤 미제공(구형) 리뷰는 single[id]
  const [texts, setTexts] = useState<Record<number, Record<string, string>>>({});
  const [single, setSingle] = useState<Record<number, string>>({});
  const [sel, setSel] = useState<Record<number, string | undefined>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          const pending = ['new', 'drafted'].includes(r.status);
          const approved = r.status === 'approved';
          const hasVariants = !!r.draft_variants?.length;
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
                              className={`text-[12px] transition-colors ${
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
                              rows={2}
                              className="w-full bg-transparent text-[13px] focus:outline-none"
                              style={{ padding: 0, marginTop: 2, resize: 'vertical', border: 0 }}
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
                    {busy === r.id && <span className="text-[12px] text-muted-foreground">처리 중…</span>}
                    {!sel[r.id] && (
                      <span className="text-[12px] text-muted-foreground">톤을 선택하면 확정할 수 있습니다.</span>
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
                    {busy === r.id && <span className="text-[12px] text-muted-foreground">처리 중…</span>}
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
                              <p className="text-[12px] font-medium" style={{ margin: 0 }}>{v.label}</p>
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
                    {busy === r.id && <span className="text-[12px] text-muted-foreground">처리 중…</span>}
                    <span className="text-[12px] text-muted-foreground">
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
