import { NextResponse } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { PIN_RE, pinToPassword } from '@/lib/account/simple-login';

export const runtime = 'nodejs';

// 간편 계정 비밀번호(6자리) 변경 — 로그인 상태에서 { currentPin, newPin }.
// GET 은 내 간편 계정 상태(변경 필요 여부) — /account/pin 화면이 안내 문구를 고르는 데 쓴다.
// 현재 비밀번호는 별도 익명 클라이언트로 로그인해 검증한다(세션 쿠키에 영향 없음).

export async function GET() {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });
  const { data } = await svc
    .from('profiles')
    .select('display_name, simple_login, pin_reset_required')
    .eq('user_id', user.id)
    .maybeSingle();
  return NextResponse.json({
    simpleLogin: !!data?.simple_login,
    displayName: data?.display_name ?? null,
    pinResetRequired: !!data?.pin_reset_required,
  });
}

export async function POST(req: Request) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const { data: profile } = await svc
    .from('profiles')
    .select('user_id, simple_login')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.simple_login) {
    return NextResponse.json({ error: '간편 계정만 비밀번호를 바꿀 수 있습니다.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPin = String(body?.currentPin ?? '');
  const newPin = String(body?.newPin ?? '');
  if (!PIN_RE.test(currentPin) || !PIN_RE.test(newPin)) {
    return NextResponse.json({ error: '비밀번호는 숫자 6자리입니다.' }, { status: 400 });
  }
  if (currentPin === newPin) return NextResponse.json({ error: '새 비밀번호가 현재와 같습니다.' }, { status: 400 });
  if (/^(\d)\1{5}$/.test(newPin) || newPin === '123456' || newPin === '654321') {
    return NextResponse.json({ error: '너무 단순한 비밀번호입니다. 다른 숫자로 정해주세요.' }, { status: 400 });
  }

  // 현재 비밀번호 검증 — 쿠키를 건드리지 않는 일회용 클라이언트
  const anon = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyErr } = await anon.auth.signInWithPassword({
    email: user.email,
    password: pinToPassword(user.email, currentPin),
  });
  if (verifyErr) return NextResponse.json({ error: '현재 비밀번호가 맞지 않습니다.' }, { status: 401 });

  const newPassword = pinToPassword(user.email, newPin);
  const { error } = await svc.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 비밀번호가 바뀌면 Supabase 가 기존 세션을 무효화한다(프로덕션 검증 2026-09-07) —
  // 새 비밀번호로 다시 로그인해 쿠키를 갈아 끼워야 화면이 로그아웃으로 튕기지 않는다.
  const { error: reErr } = await session.auth.signInWithPassword({ email: user.email, password: newPassword });
  if (reErr) return NextResponse.json({ ok: true, relogin: true });
  await svc
    .from('profiles')
    .update({ pin_reset_required: false, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
