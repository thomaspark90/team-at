import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { LOCK_MINUTES, MAX_FAILED, PIN_RE, normalizeName, pinToPassword } from '@/lib/account/simple-login';

export const runtime = 'nodejs';

// 간편 로그인 — { name, pin } → 프로필(display_name)로 계정을 찾아 Supabase 비밀번호 로그인.
// 세션 없이 호출되므로 PUBLIC_API(미들웨어 제외). 실패 사유는 하나로 뭉뚱그린다(이름 존재 여부 노출 방지).
// 계정별 잠금: 연속 5회 실패 → 10분. (lib/account/simple-login.ts)

const FAIL = () => NextResponse.json({ error: '이름 또는 비밀번호가 맞지 않습니다.' }, { status: 401 });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = normalizeName(body?.name);
  const pin = String(body?.pin ?? '');
  if (!name || !PIN_RE.test(pin)) return FAIL();

  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const { data: profile } = await svc
    .from('profiles')
    .select('user_id, display_name, simple_login, pin_reset_required, failed_attempts, locked_until')
    .eq('display_name', name)
    .eq('simple_login', true)
    .maybeSingle();
  if (!profile) return FAIL();

  if (profile.locked_until && new Date(profile.locked_until).getTime() > Date.now()) {
    const left = Math.ceil((new Date(profile.locked_until).getTime() - Date.now()) / 60_000);
    return NextResponse.json({ error: `잠시 잠겨 있습니다. ${left}분 뒤 다시 시도하세요.` }, { status: 423 });
  }

  const { data: authUser } = await svc.auth.admin.getUserById(profile.user_id);
  const email = authUser?.user?.email;
  if (!email) return FAIL();

  let password: string;
  try {
    password = pinToPassword(email, pin);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '서버 설정 누락' }, { status: 500 });
  }

  // 세션 쿠키를 심는 서버 클라이언트로 로그인 — 구글 로그인과 같은 세션이 된다
  const session = await createClient();
  const { error } = await session.auth.signInWithPassword({ email, password });

  if (error) {
    const failed = (profile.failed_attempts ?? 0) + 1;
    const lock = failed >= MAX_FAILED;
    await svc
      .from('profiles')
      .update({
        failed_attempts: lock ? 0 : failed,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq('user_id', profile.user_id);
    if (lock) {
      return NextResponse.json(
        { error: `${MAX_FAILED}회 연속 실패로 ${LOCK_MINUTES}분간 잠겼습니다. 비밀번호를 잊었으면 대표에게 초기화를 요청하세요.` },
        { status: 423 },
      );
    }
    return FAIL();
  }

  await svc.from('profiles').update({ failed_attempts: 0, locked_until: null }).eq('user_id', profile.user_id);
  return NextResponse.json({
    ok: true,
    pinResetRequired: !!profile.pin_reset_required,
    next: profile.pin_reset_required ? '/account/pin' : '/garden/teaching',
  });
}
