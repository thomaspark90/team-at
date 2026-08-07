import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { draftReply } from '@/lib/garden/review-draft';
import { notifyGardenEvent } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 스마트플레이스 리뷰 무인 수집기(로컬 Mac, launchd) 전용 적재 엔드포인트.
// 사용자 세션이 없으므로 비밀 토큰(x-review-token) + service role 로 동작한다.
// 신규 리뷰를 적재하고, 답글이 없는 건에 대해 AI 초안을 생성한다(게시는 하지 않는다).

type IngestReview = {
  review_id: string;
  store_key: string;
  place_id: string;
  author?: string | null;
  rating?: number | null;
  content?: string | null;
  keywords?: string[] | null;
  visit_count?: number | null;
  photo_count?: number | null;
  reviewed_at: string;
  had_reply?: boolean;
};

const DRAFT_LIMIT = 12; // 실행당 초안 생성 상한 (maxDuration 60초 안에 끝나도록)

export async function POST(req: Request) {
  const token = process.env.REVIEW_INGEST_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !serviceKey) {
    return NextResponse.json({ error: '서버에 REVIEW_INGEST_TOKEN / SUPABASE_SERVICE_ROLE_KEY 설정이 필요합니다.' }, { status: 500 });
  }
  if (req.headers.get('x-review-token') !== token) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  let reviews: IngestReview[];
  try {
    const body = await req.json();
    reviews = Array.isArray(body?.reviews) ? body.reviews : [];
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다.' }, { status: 400 });
  }

  const valid = reviews.filter((r) => r?.review_id && r.store_key && r.place_id && r.reviewed_at);
  if (valid.length === 0) return NextResponse.json({ saved: 0, duplicates: 0, drafted: 0 });

  const supabase = createServiceClient(url, serviceKey, { db: { schema: 'finance' } });

  // 이미 적재된 리뷰 제외
  const ids = Array.from(new Set(valid.map((r) => r.review_id)));
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from('place_reviews').select('review_id').in('review_id', ids.slice(i, i + 100));
    (data ?? []).forEach((e: { review_id: string }) => existing.add(e.review_id));
  }
  const seen = new Set<string>();
  const fresh = valid.filter((r) => {
    if (existing.has(r.review_id) || seen.has(r.review_id)) return false;
    seen.add(r.review_id);
    return true;
  });

  if (fresh.length === 0) {
    return NextResponse.json({ saved: 0, duplicates: valid.length, drafted: 0 });
  }

  const rows = fresh.map((r) => ({
    review_id: r.review_id,
    store_key: r.store_key,
    place_id: r.place_id,
    author: r.author ?? null,
    rating: r.rating ?? null,
    content: r.content ?? null,
    keywords: r.keywords ?? null,
    visit_count: r.visit_count ?? null,
    photo_count: r.photo_count ?? 0,
    reviewed_at: r.reviewed_at,
    had_reply: !!r.had_reply,
    // 이미 답글이 달린 리뷰는 승인 대기열에 올리지 않는다
    status: r.had_reply ? 'replied_elsewhere' : 'new',
  }));

  const { error: insErr } = await supabase.from('place_reviews').insert(rows);
  if (insErr) {
    return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
  }

  // 답글 없는 신규 리뷰에 초안 생성 — 실패해도 적재는 유지(다음 실행에서 재시도 가능)
  let drafted = 0;
  const issueFound: { store_key: string; rating: number | null; note: string | null; categories: string[] }[] = [];
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const targets = rows.filter((r) => r.status === 'new').slice(0, DRAFT_LIMIT);
    for (const r of targets) {
      const draft = await draftReply(r, geminiKey);
      if (!draft) continue;
      const { error } = await supabase
        .from('place_reviews')
        .update({
          draft: draft.text,
          draft_variants: draft.variants,
          draft_model: draft.model,
          draft_at: new Date().toISOString(),
          status: 'drafted',
          issue: draft.issue,
          issue_note: draft.issueNote,
          issue_categories: draft.issueCategories,
        })
        .eq('review_id', r.review_id);
      if (!error) {
        drafted++;
        if (draft.issue) {
          issueFound.push({ store_key: r.store_key, rating: r.rating, note: draft.issueNote, categories: draft.issueCategories });
        }
      }
    }
  }

  // 이슈 리뷰가 새로 잡히면 담당자에게 이메일+웹푸시 — 실패해도 적재 결과는 그대로 반환
  if (issueFound.length > 0) {
    try {
      const storeLabel: Record<string, string> = { yangjae: '양재천점', pangyo: '판교점' };
      const lines = issueFound.map((i) => {
        const head = `[${storeLabel[i.store_key] ?? i.store_key}] ★${i.rating ?? '-'}`;
        const cats = i.categories.length ? ` (${i.categories.join(', ')})` : '';
        return `${head} ${i.note ?? '지적 내용 확인 필요'}${cats}`;
      });
      // notify 계열은 기본(public) 스코프 클라이언트를 받는다 — finance 스코프 클라이언트와 타입이 달라 별도 생성
      const notifyClient = createServiceClient(url, serviceKey);
      const emails = await topicEmails(notifyClient, 'reviewIssue');
      await notifyGardenEvent(notifyClient, {
        emails,
        subject: `[이슈 리뷰] 새 지적 ${issueFound.length}건 — ${lines[0].slice(0, 60)}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>불만·개선 지적이 담긴 리뷰 ${issueFound.length}건이 새로 수집됐어요.</strong></p>
          ${lines.map((l) => `<p>${l}</p>`).join('')}
          <p><a href="https://team-at-apps.vercel.app/garden/reviews">이슈·개선 탭 열기 →</a></p>
        </div>`,
        push: {
          title: `이슈 리뷰 ${issueFound.length}건`,
          body: lines[0].slice(0, 100),
          url: '/garden/reviews',
        },
      });
    } catch (e) {
      console.error('이슈 리뷰 알림 실패:', e);
    }
  }

  return NextResponse.json({
    saved: rows.length,
    duplicates: valid.length - rows.length,
    drafted,
    pendingDraft: rows.filter((r) => r.status === 'new').length - drafted,
  });
}
