import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { REVIEW_POST_GRACE_MS } from '@/lib/garden/review-constants';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 로컬 게시기(post.mjs) 전용 — 승인된 답글을 내려주고, 게시 결과를 받아 상태를 갱신한다.
// 토큰 인증(x-review-token), service role.

const client = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey, { db: { schema: 'finance' } });
};

const authed = (req: Request) => {
  const token = process.env.REVIEW_INGEST_TOKEN;
  return !!token && req.headers.get('x-review-token') === token;
};

// 승인 후 이 시간이 지나야 게시 대상에 포함된다 — 그 사이 매니저가 수정·재승인할 수 있는 유예 창.
// 재승인하면 approved_at이 갱신되어 유예도 다시 1시간부터 센다.
const GRACE_MS = REVIEW_POST_GRACE_MS;

/** 게시 대기(승인 완료 + 유예 경과) 목록 */
export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const supabase = client();
  if (!supabase) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const { data, error } = await supabase
    .from('place_reviews')
    .select('id, review_id, store_key, place_id, reply_text')
    .eq('status', 'approved')
    .lte('approved_at', new Date(Date.now() - GRACE_MS).toISOString())
    .order('approved_at', { ascending: true })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pending: data ?? [] });
}

/** 게시 결과 보고: { id, ok: boolean, error?: string } */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const supabase = client();
  if (!supabase) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const patch = body?.ok
    ? { status: 'posted', posted_at: new Date().toISOString(), post_error: null }
    : { post_error: String(body?.error ?? '알 수 없는 오류').slice(0, 300) };

  // 게시 완료 보고는 여전히 승인 상태인 행에만 적용 — 그 사이 취소·재선택된 행을
  // 무조건 posted로 덮어 '게시됐는데 확정 답글 없음' 상태가 생기는 것을 막는다.
  const q = supabase.from('place_reviews').update(patch).eq('id', id);
  const { error } = body?.ok ? await q.eq('status', 'approved') : await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
