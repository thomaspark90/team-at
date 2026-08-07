import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { draftReply } from '@/lib/garden/review-draft';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 매니저용 리뷰 관리 API (로그인 세션 인증).
// GET: 목록  /  PATCH: 승인·건너뛰기·초안 재생성

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  return { supabase, user };
}

const OPEN_STATUSES = ['new', 'drafted', 'approved'];

export async function GET(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;

  const tab = new URL(req.url).searchParams.get('tab') ?? 'open';

  // 이슈·개선 탭 — 상태와 무관하게 issue=true 리뷰를 전부 모아 보여준다
  if (tab === 'issues') {
    const { data, error } = await g.supabase
      .schema('finance')
      .from('place_reviews')
      .select('*')
      .eq('issue', true)
      .order('reviewed_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 백필 대상 잔여 건수(미분류 + 카테고리 미보완 이슈) — 분류 실행 버튼 노출용
    const db = g.supabase.schema('finance');
    const [{ count: nullCount }, { count: catCount }] = await Promise.all([
      db.from('place_reviews').select('id', { count: 'exact', head: true }).is('issue', null),
      db.from('place_reviews').select('id', { count: 'exact', head: true })
        .eq('issue', true).is('issue_categories', null).not('content', 'is', null),
    ]);
    return NextResponse.json({ reviews: data ?? [], unclassified: (nullCount ?? 0) + (catCount ?? 0) });
  }

  const statuses =
    tab === 'posted' ? ['posted']
    : tab === 'all' ? ['new', 'drafted', 'approved', 'posted', 'skipped', 'replied_elsewhere']
    : OPEN_STATUSES;

  const { data, error } = await g.supabase
    .schema('finance')
    .from('place_reviews')
    .select('*')
    .in('status', statuses)
    .order('reviewed_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: data ?? [] });
}

// { id, action: 'approve' | 'skip' | 'redraft', text? }
export async function PATCH(req: Request) {
  const g = await requireUser();
  if ('error' in g) return g.error;

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  const action = String(body?.action ?? '');
  if (!id || !action) return NextResponse.json({ error: 'id와 action이 필요합니다.' }, { status: 400 });

  const { data: review } = await g.supabase
    .schema('finance').from('place_reviews').select('*').eq('id', id).single();
  if (!review) return NextResponse.json({ error: '리뷰를 찾을 수 없습니다.' }, { status: 404 });
  if (review.status === 'posted') return NextResponse.json({ error: '이미 게시된 답글입니다.' }, { status: 409 });

  if (action === 'redraft') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 });
    const draft = await draftReply(review, key);
    if (!draft) return NextResponse.json({ error: '초안 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
    // 매니저가 수동 정정한 이슈 판정은 재생성이 덮어쓰지 않는다
    const issuePatch = review.issue_source === 'manual'
      ? {}
      : { issue: draft.issue, issue_note: draft.issueNote, issue_categories: draft.issueCategories };
    const { data } = await g.supabase.schema('finance').from('place_reviews')
      .update({
        draft: draft.text,
        draft_variants: draft.variants,
        draft_model: draft.model,
        draft_at: new Date().toISOString(),
        status: 'drafted',
        ...issuePatch,
      })
      .eq('id', id).select('*').single();
    return NextResponse.json({ review: data });
  }

  // 이슈 판정 수동 정정 — { id, action: 'set_issue', issue: boolean }
  // manual 표시가 붙으면 재생성·재분류가 덮어쓰지 않는다.
  if (action === 'set_issue') {
    const issue = !!body?.issue;
    const { data } = await g.supabase.schema('finance').from('place_reviews')
      .update(issue
        ? { issue: true, issue_source: 'manual' }
        : { issue: false, issue_note: null, issue_categories: [], issue_source: 'manual' })
      .eq('id', id).select('*').single();
    await logActivity(g.supabase, g.user, '리뷰 이슈 수동 정정', `${review.store_key} · ${issue ? '이슈로 표시' : '이슈 아님'} · ${String(review.content ?? '').slice(0, 30)}`);
    return NextResponse.json({ review: data });
  }

  if (action === 'skip') {
    const { data } = await g.supabase.schema('finance').from('place_reviews')
      .update({ status: 'skipped' }).eq('id', id).select('*').single();
    return NextResponse.json({ review: data });
  }

  if (action === 'approve') {
    const text = String(body?.text ?? '').trim();
    if (!text) return NextResponse.json({ error: '답글 내용을 입력해주세요.' }, { status: 400 });
    const tone = ['kind', 'plain', 'grateful'].includes(String(body?.tone)) ? String(body.tone) : null;
    const { data } = await g.supabase.schema('finance').from('place_reviews')
      .update({
        reply_text: text.slice(0, 500),
        status: 'approved',
        approved_by: g.user.email ?? '',
        approved_at: new Date().toISOString(),
        approved_tone: tone,
        post_error: null,
      })
      .eq('id', id).select('*').single();
    await logActivity(g.supabase, g.user, '리뷰 답글 승인', `${review.store_key} · ${text.slice(0, 40)}`);
    return NextResponse.json({ review: data });
  }

  // 승인 취소 — 게시 유예(1시간) 안에만 가능. 다시 선택·수정할 수 있는 상태로 되돌린다.
  if (action === 'cancel') {
    if (review.status !== 'approved') {
      return NextResponse.json({ error: '승인 상태인 답글만 취소할 수 있습니다.' }, { status: 409 });
    }
    const { data } = await g.supabase.schema('finance').from('place_reviews')
      .update({ status: 'drafted', reply_text: null, approved_by: null, approved_at: null, approved_tone: null, post_error: null })
      .eq('id', id).select('*').single();
    await logActivity(g.supabase, g.user, '리뷰 답글 승인 취소', `${review.store_key} · ${String(review.reply_text ?? '').slice(0, 40)}`);
    return NextResponse.json({ review: data });
  }

  return NextResponse.json({ error: '알 수 없는 action 입니다.' }, { status: 400 });
}
