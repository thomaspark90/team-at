import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { logActivity } from '@/lib/finance/activity';
import { notifyGardenEvent } from '@/lib/notify';
import { purchaseRecords } from '@/lib/blob-records';

// 원두카드 인쇄 완료 표시 — { id, done } (2026-11-03 대표 지시).
// 원두카드 담당(디자이너)이 누르면 발주 흐름의 마지막 단계가 끝나고(작업 보드 완료 판정),
// 그 원두를 발주한 사람에게 이메일+웹푸시로 알린다. done=false 는 표시 취소(알림 없음). beancard 탭 권한.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'beancard');
    if (denied) return denied;
  }

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? '');
  const done = body?.done !== false;
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const record = await purchaseRecords.readOne(id);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });

  if (done) record.cardDone = { by: user.email ?? '', at: new Date().toISOString() };
  else delete record.cardDone;
  await purchaseRecords.writeOne(record);
  await logActivity(supabase, user, done ? '가든서비스 원두카드 인쇄 완료' : '가든서비스 원두카드 완료 취소', record.bean);

  // 발주한 사람에게 알림 — 본인이 발주한 원두면 보내지 않는다. 실패해도 표시는 유지.
  const orderer = record.createdBy?.toLowerCase();
  if (done && orderer && orderer !== (user.email ?? '').toLowerCase()) {
    try {
      const by = (user.email ?? '').split('@')[0];
      await notifyGardenEvent(supabase, {
        emails: [orderer],
        subject: `[원두카드 완료] ${record.bean}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${record.bean}</strong> 원두카드 인쇄가 끝났어요.</p>
          <p>완료: ${by}</p>
          <p><a href="${APP_URL}/garden">작업 보드 열기 →</a></p>
        </div>`,
        push: {
          title: `원두카드 완료 · ${record.bean}`,
          body: `${by}님이 원두카드 인쇄를 마쳤어요`,
          url: '/garden',
        },
      });
    } catch (e) {
      console.error('card-done notify 실패:', e);
    }
  }
  return NextResponse.json(record);
}
