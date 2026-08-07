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
    const { data } = await g.supabase.schema('finance').from('place_reviews')
      .update({ draft: draft.text, draft_variants: draft.variants, draft_model: draft.model, draft_at: new Date().toISOString(), status: 'drafted' })
      .eq('id', id).select('*').single();
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
    const { data } = await g.supabase.schema('finance').from('place_reviews')
      .update({
        reply_text: text.slice(0, 500),
        status: 'approved',
        approved_by: g.user.email ?? '',
        approved_at: new Date().toISOString(),
        post_error: null,
      })
      .eq('id', id).select('*').single();
    await logActivity(g.supabase, g.user, '리뷰 답글 승인', `${review.store_key} · ${text.slice(0, 40)}`);
    return NextResponse.json({ review: data });
  }

  return NextResponse.json({ error: '알 수 없는 action 입니다.' }, { status: 400 });
}
