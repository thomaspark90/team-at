import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isAllowedUser } from '@/lib/finance/access';
import { requireGardenTab } from '@/lib/access/guard';
import { CURRENT_SEASON } from '@/lib/garden/season';

// 제철 단어 API — GET(공개: 게시 단어 / scope=admin: 전체), POST(공개 제출), PATCH(팀: 상태 변경)
const SEASON = CURRENT_SEASON;
// 한글·영문·숫자·공백만, 1~10자 — "단어만" 원칙의 최소 방어선
const WORD_RE = /^[가-힣a-zA-Z0-9 ]{1,10}$/;

// 도배 방지용 익명 세션 쿠키 — 값은 랜덤 UUID뿐, 다른 어떤 정보와도 연결되지 않는다
const SID_COOKIE = 'gw_sid';
// 속도 제한: 같은 제출자(세션 또는 IP 해시) 기준 1분 3회 · 하루 15회
const LIMIT_1M = 3;
const LIMIT_1D = 15;

// 제출 적재는 service role — 속도 제한 카운트(pending 포함)와 식별값 저장 때문.
// 공개 RLS(익명 insert 정책)는 API를 우회한 직접 접근의 방어선으로 그대로 둔다.
const serviceDb = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
};

export async function GET(req: Request) {
  const supabase = await createClient();
  const url = new URL(req.url);

  if (url.searchParams.get('scope') === 'admin') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // 이 라우트는 공개 제출·조회 때문에 미들웨어 검사에서 제외돼 있어 관리 조회는 여기서 직접 확인한다
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    if (!(await isAllowedUser(supabase, user.email)))
      return NextResponse.json({ error: '허용된 계정만 조회할 수 있습니다.' }, { status: 403 });
    {
      // 미들웨어 우회 경로이므로 섹션·words 탭 권한도 여기서 직접 강제한다
      const denied = await requireGardenTab(supabase, user, 'words');
      if (denied) return denied;
    }
    const { data, error } = await supabase
      .from('garden_words')
      .select('id, text, season, status, created_at, decided_at, submit_sid, submit_iphash')
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

  const db = serviceDb();
  if (!db) return NextResponse.json({ error: '지금은 단어를 받을 수 없어요.' }, { status: 500 });

  // 익명 세션 ID(쿠키) + IP 해시 — 같은 제출자 묶기·속도 제한용. 역추적은 불가.
  const jar = await cookies();
  const prevSid = jar.get(SID_COOKIE)?.value;
  const sid = prevSid && /^[0-9a-f-]{36}$/i.test(prevSid) ? prevSid : randomUUID();
  const ip =
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '';
  const salt = process.env.REVIEW_INGEST_TOKEN ?? 'gw-salt';
  const iphash = ip ? createHash('sha256').update(salt + ip).digest('hex').slice(0, 32) : null;

  const withSid = (res: NextResponse) => {
    res.cookies.set(SID_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return res;
  };

  // 속도 제한 — 세션 또는 IP 해시가 같은 최근 제출 수
  const sameSubmitter = [`submit_sid.eq.${sid}`, ...(iphash ? [`submit_iphash.eq.${iphash}`] : [])].join(',');
  const since1m = new Date(Date.now() - 60_000).toISOString();
  const since1d = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: c1m }, { count: c1d }] = await Promise.all([
    db.from('garden_words').select('id', { count: 'exact', head: true }).or(sameSubmitter).gte('created_at', since1m),
    db.from('garden_words').select('id', { count: 'exact', head: true }).or(sameSubmitter).gte('created_at', since1d),
  ]);
  if ((c1m ?? 0) >= LIMIT_1M || (c1d ?? 0) >= LIMIT_1D) {
    return withSid(
      NextResponse.json({ error: '단어가 잠시 쌓였어요. 조금 뒤에 다시 두고 가주세요.' }, { status: 429 })
    );
  }

  // 게시된 단어와 같을 때만 중복 처리 — 게시 단어는 공개 화면에 이미 보이므로 정보 노출이 아니다.
  // 대기·반려까지 걸러버리면 ①반려 단어가 영영 재검수 못 받고 ②행이 안 쌓여 속도 제한을 안 받는
  // 채로 숨은 단어 존재 여부를 무한히 찔러볼 수 있다. 대기 중복은 검수 화면에서 사람이 거른다.
  const { data: dup } = await db
    .from('garden_words')
    .select('id')
    .eq('text', text)
    .eq('season', SEASON)
    .eq('status', 'approved')
    .limit(1);
  if (dup && dup.length > 0) return withSid(NextResponse.json({ ok: true, dedup: true }));

  const { error } = await db
    .from('garden_words')
    .insert({ text, season: SEASON, status: 'pending', submit_sid: sid, submit_iphash: iphash });
  if (error) {
    return withSid(NextResponse.json({ error: '지금은 단어를 받을 수 없어요.' }, { status: 500 }));
  }
  return withSid(NextResponse.json({ ok: true }));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 이 라우트는 공개 제출·조회 때문에 미들웨어 검사에서 제외돼 있어 검수 동작은 여기서 직접 확인한다
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (!(await isAllowedUser(supabase, user.email)))
    return NextResponse.json({ error: '허용된 계정만 검수할 수 있습니다.' }, { status: 403 });
  {
    // 미들웨어 우회 경로이므로 섹션·words 탭 권한도 여기서 직접 강제한다
    const denied = await requireGardenTab(supabase, user, 'words');
    if (denied) return denied;
  }

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
