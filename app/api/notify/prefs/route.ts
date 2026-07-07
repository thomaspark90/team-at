import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// 내 알림 설정 조회 — 행이 없으면 기본값(이메일 켜짐)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data } = await supabase
    .schema('finance')
    .from('notify_prefs')
    .select('email_enabled')
    .eq('user_id', user.id)
    .maybeSingle();
  return NextResponse.json({ emailEnabled: data?.email_enabled ?? true });
}

// 내 알림 설정 저장
export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { emailEnabled } = (await req.json()) as { emailEnabled?: boolean };
  if (typeof emailEnabled !== 'boolean') {
    return NextResponse.json({ error: 'emailEnabled 값이 필요해요.' }, { status: 400 });
  }

  const { error } = await supabase
    .schema('finance')
    .from('notify_prefs')
    .upsert(
      {
        user_id: user.id,
        email: user.email ?? '',
        email_enabled: emailEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
