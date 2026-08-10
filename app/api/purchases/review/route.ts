import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { logActivity } from '@/lib/finance/activity';
import { notifyGardenEvent } from '@/lib/notify';
import { readGardenTopics, topicEmails } from '@/lib/garden-notify-topics-server';
import { purchaseRecords } from '@/lib/blob-records';
import type { StageReview } from '@/lib/types';

// 발주 흐름(발주→판매가→레시피→원두카드) 되돌리기 — 다음 단계 담당자가 이전 단계를
// 다시 검토해달라고 요청한다. 값은 지우지 않고 플래그만 남기며, 이전 단계 담당자가
// 실제로 재작업하면(PATCH /api/purchases, POST /api/garden-recipes) 자동으로 걷힌다.
// target: 'price' = 레시피 담당자가 판매가를 되돌림(recipes 탭) / 'recipe' = 원두카드
// 담당자가 레시피를 되돌림(beancard 탭)
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? '');
  const target = body?.target === 'recipe' ? 'recipe' : body?.target === 'price' ? 'price' : null;
  const note = body?.note ? String(body.note).trim().slice(0, 300) : undefined;
  if (!id || !target) return NextResponse.json({ error: 'id와 target이 필요합니다.' }, { status: 400 });

  {
    const denied = await requireGardenTab(supabase, user, target === 'price' ? 'recipes' : 'beancard');
    if (denied) return denied;
  }

  const record = await purchaseRecords.readOne(id);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });

  const review: StageReview = { by: user.email ?? '', at: new Date().toISOString(), note };
  if (target === 'price') record.priceReview = review;
  else record.recipeReview = review;
  await purchaseRecords.writeOne(record);

  const by = (user.email ?? '').split('@')[0];
  await logActivity(
    supabase,
    user,
    target === 'price' ? '가든서비스 판매가 재검토 요청' : '가든서비스 레시피 재검토 요청',
    `${record.bean}${note ? ` · ${note}` : ''}`
  );

  try {
    // 레시피 알림은 담당자 지정 시에만 보내는 옵트인 규칙(garden-recipes/route.ts와 동일) —
    // topicEmails()의 '원두 알림 수신자 전체' 폴백을 타면 그 규칙이 깨진다.
    const emails =
      target === 'price'
        ? await topicEmails(supabase, 'salePriceRequest')
        : (await readGardenTopics()).recipeEdit;
    if (emails.length === 0 && target === 'recipe') return NextResponse.json(record);
    const label = target === 'price' ? '판매가' : '레시피';
    const url = target === 'price' ? `${APP_URL}/garden/saleprice` : `${APP_URL}/garden/recipes`;
    await notifyGardenEvent(supabase, {
      emails,
      subject: `[${label} 재검토 요청] ${record.bean}`,
      html: `
      <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
        <p><strong>${record.bean}</strong>${label} 재검토가 요청됐어요.</p>
        ${note ? `<p>사유: ${note}</p>` : ''}
        <p>요청: ${by}</p>
        <p><a href="${url}">${label} 화면 열기 →</a></p>
      </div>`,
      push: {
        title: `${label} 재검토 요청 · ${record.bean}`,
        body: `${note ?? '다시 확인해 주세요'} — ${by} 요청`,
        url: target === 'price' ? '/garden/saleprice' : '/garden/recipes',
      },
    });
  } catch (e) {
    console.error('재검토 요청 notify 실패:', e);
  }

  return NextResponse.json(record);
}
