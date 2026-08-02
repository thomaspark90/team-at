import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 제철 단어 API — GET(공개: 게시 단어 / scope=admin: 전체), POST(공개 제출), PATCH(팀: 상태 변경)
const SEASON = '여름';
// 한글·영문·숫자·공백만, 1~10자 — "단어만" 원칙의 최소 방어선
const WORD_RE = /^[가-힣a-zA-Z0-9 ]{1,10}$/;

export async function GET(req: Request) {
  const supabase = await createClient();
  const url = new URL(req.url);

  if (url.searchParams.get('scope') === 'admin') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const { data, error } = await supabase
      .from('garden_words')
      .select('id, text, season, status, created_at, decided_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ words: data ?? [] });
  }

  const { data, error } = await supabase
    .from('garden_words')
    .select('id, text')
    .eq('status', 'approved')
    .eq('season', SEASON)
    .order('decided_at', { ascending: true })
    .limit(80);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ words: data ?? [] });
}

export async function POST(req: Request) {
  let text = '';
  try {
    text = String((await req.json())?.text ?? '');
  } catch {
    // body 없는 요청 — 아래 검증에서 걸러짐
  }
  text = text.trim().replace(/\s+/g, ' ');
  if (!WORD_RE.test(text)) {
    return NextResponse.json({ error: '단어만, 열 자 안까지 받아요.' }, { status: 400 });
  }

  const supabase = await createClient();
  // 이미 게시된 단어와 같으면 새로 쌓지 않고 접수한 것으로 응답(중복 방지).
  // RLS 상 비로그인 조회는 approved 만 보이므로 pending 중복은 검수 화면에서 거른다.
  const { data: dup } = await supabase
    .from('garden_words')
    .select('id')
    .eq('text', text)
    .eq('season', SEASON)
    .limit(1);
  if (dup && dup.length > 0) return NextResponse.json({ ok: true, dedup: true });

  const { error } = await supabase
    .from('garden_words')
    .insert({ text, season: SEASON, status: 'pending' });
  if (error) {
    return NextResponse.json({ error: '지금은 단어를 받을 수 없어요.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let body: { id?: unknown; status?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // 아래 검증에서 걸러짐
  }
  const id = Number(body.id);
  const status = String(body.status ?? '');
  if (!Number.isFinite(id) || !['approved', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json(
      { error: 'id와 status(approved/rejected/pending)가 필요합니다.' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('garden_words')
    .update({ status, decided_at: status === 'pending' ? null : new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
