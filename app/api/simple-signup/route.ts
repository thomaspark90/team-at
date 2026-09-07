import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/service';
import { MAX_PENDING, PIN_RE, SIGNUP_NAME_RE, newInternalEmail, normalizeName, pinToPassword } from '@/lib/account/simple-login';

export const runtime = 'nodejs';

// 간편 계정 가입 신청 — { name(한글 3글자), pin(6자리) }. 세션 없이 호출(PUBLIC_API).
// 계정은 만들되 status='pending' 이라 로그인은 막힌다. 대표가 /settings 에서 역할·지점을 지정해 승인하면 열린다.
// 도배 방어: 이름 정확히 3글자 + 고유, 승인 대기 상한(MAX_PENDING).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = normalizeName(body?.name);
  const pin = String(body?.pin ?? '');
  if (!SIGNUP_NAME_RE.test(name)) return NextResponse.json({ error: '이름은 성을 포함한 한글 3글자로 적어주세요.' }, { status: 400 });
  if (!PIN_RE.test(pin)) return NextResponse.json({ error: '비밀번호는 숫자 6자리입니다.' }, { status: 400 });
  if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') {
    return NextResponse.json({ error: '너무 단순한 비밀번호입니다. 다른 숫자로 정해주세요.' }, { status: 400 });
  }

  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: '서버 설정 누락' }, { status: 500 });

  const { data: dup } = await svc.from('profiles').select('user_id, status').eq('display_name', name).maybeSingle();
  if (dup) {
    return NextResponse.json(
      {
        error:
          dup.status === 'pending'
            ? '같은 이름으로 이미 신청돼 있어요. 대표 승인을 기다려 주세요.'
            : '같은 이름의 계정이 이미 있어요. 본인 계정이면 로그인하고, 아니면 대표에게 알려주세요.',
      },
      { status: 409 },
    );
  }
  const { count } = await svc.from('profiles').select('user_id', { count: 'exact', head: true }).eq('status', 'pending');
  if ((count ?? 0) >= MAX_PENDING) return NextResponse.json({ error: '신청이 밀려 있어요. 대표에게 직접 말씀해 주세요.' }, { status: 429 });

  const email = newInternalEmail();
  let password: string;
  try {
    password = pinToPassword(email, pin);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '서버 설정 누락' }, { status: 500 });
  }
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, simple_login: true, self_signup: true },
  });
  if (createErr || !created.user) return NextResponse.json({ error: createErr?.message ?? '계정 생성 실패' }, { status: 500 });
  const userId = created.user.id;

  const { error: profErr } = await svc.from('profiles').insert({
    user_id: userId,
    display_name: name,
    role: 'staff',
    stores: [],
    simple_login: true,
    pin_reset_required: false, // 본인이 정한 비밀번호
    status: 'pending',
    created_by: 'self-signup',
  });
  if (profErr) {
    await svc.auth.admin.deleteUser(userId);
    const friendly = /unique|duplicate/i.test(profErr.message) ? '같은 이름으로 이미 신청돼 있어요.' : profErr.message;
    return NextResponse.json({ error: friendly }, { status: 409 });
  }
  // 기본 권한은 발급과 동일(가든 섹션 + 교육 탭) — 승인 전엔 어차피 로그인이 안 된다
  await svc
    .from('garden_tab_access')
    .upsert({ user_id: userId, email, sections: ['garden'], tabs: ['teaching'], updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  return NextResponse.json({ ok: true, name });
}
