import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// 웹 푸시 구독 저장 — 알림 켠 기기의 endpoint 등록(같은 기기 재구독은 upsert)
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { endpoint, keys } = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: '구독 정보가 올바르지 않아요.' }, { status: 400 });
  }

  const { error } = await supabase
    .schema('finance')
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, email: user.email ?? '', endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 구독 해제 — 알림 끈 기기 제거
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: 'endpoint가 없어요.' }, { status: 400 });

  await supabase.schema('finance').from('push_subscriptions').delete().eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
