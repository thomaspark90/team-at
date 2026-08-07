import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';
import { notifyGardenEvent } from '@/lib/notify';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { logActivity } from '@/lib/finance/activity';

export const runtime = 'nodejs';

// 원두카드 제작 요청: { bean, note? } → beanCard 토픽 담당자(미지정 시 원두 수신자)에게 이메일+웹푸시
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const bean = String(body.bean ?? '').trim().slice(0, 100);
  if (!bean) return NextResponse.json({ error: '원두명을 입력해주세요.' }, { status: 400 });
  const note = body.note ? String(body.note).trim().slice(0, 300) : undefined;

  const emails = await topicEmails(supabase, 'beanCard');
  const by = (user.email ?? '').split('@')[0];
  await notifyGardenEvent(supabase, {
    emails,
    subject: `[원두카드 요청] ${bean}`,
    html: `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
      <p><strong>원두카드 제작 요청</strong></p>
      <p>원두: ${bean}</p>
      ${note ? `<p>메모: ${note}</p>` : ''}
      ${by ? `<p>요청: ${by}</p>` : ''}
      <p><a href="${APP_URL}/garden/recipes">필터 레시피 열기 →</a></p>
    </div>`,
    push: {
      title: `원두카드 제작 요청 · ${bean}`,
      body: `${note ?? '원두카드 제작을 부탁드려요'}${by ? ` — ${by} 요청` : ''}`,
      url: '/garden/recipes',
    },
  });
  await logActivity(supabase, user, '가든서비스 원두카드 제작 요청', `${bean}${note ? ` · ${note}` : ''}`);
  return NextResponse.json({ ok: true, sentTo: emails });
}
