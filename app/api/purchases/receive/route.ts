import { NextResponse } from 'next/server';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { requireGardenTab } from '@/lib/access/guard';
import { normalize } from '@/lib/pricing';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { notifyGardenEvent } from '@/lib/notify';
import { APP_URL } from '@/lib/app-url';

// 원두 수령 기재: { id, roastDate?, beanEn? } — 둘 중 하나 이상.
// - roastDate: 발주 시점엔 로스팅 날짜를 모르므로(봉투에 찍혀 옴) 택배 수령 후 기재한다.
// - beanEn: 발주 때 영문명은 임시 — 봉투 표기를 보고(촬영·타이핑) 확정한다(2026-11-19 대표 결정).
//   처음 확정되면 원두카드 담당자에게 알린다: 신규 원두는 정식 제작 요청, 재발주는 표기가 바뀐 경우만.
// 발주와 같은 pricing 탭 권한.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'pricing');
    if (denied) return denied;
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? '');
  const roastDate = body?.roastDate ? String(body.roastDate) : '';
  const beanEn = typeof body?.beanEn === 'string' ? body.beanEn.trim().replace(/\s+/g, ' ') : '';
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  if (!roastDate && !beanEn) {
    return NextResponse.json({ error: '로스팅 날짜나 영문 원두명을 입력해 주세요.' }, { status: 400 });
  }
  if (roastDate && !/^\d{4}-\d{2}-\d{2}$/.test(roastDate)) {
    return NextResponse.json({ error: '로스팅 날짜가 올바르지 않습니다.' }, { status: 400 });
  }
  if (beanEn.length > 120) {
    return NextResponse.json({ error: '영문 원두명이 너무 깁니다.' }, { status: 400 });
  }

  const all = await purchaseRecords.readAll();
  const record = all.find((r) => r.id === id);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });

  const prevEn = record.beanEn?.trim() ?? '';
  const firstConfirm = !!beanEn && !record.beanEnConfirmed;
  const renamed = !!beanEn && beanEn !== prevEn;
  if (roastDate) record.roastDate = roastDate;
  if (beanEn) {
    record.beanEn = beanEn;
    record.beanEnConfirmed = { by: user.email ?? '', at: new Date().toISOString() };
  }
  await purchaseRecords.writeOne(record);
  await logActivity(
    supabase,
    user,
    '가든서비스 원두 수령',
    [record.bean, roastDate && `로스팅 ${roastDate}`, beanEn && `영문명 확정 ${beanEn}`].filter(Boolean).join(' · ')
  );

  // 원두카드 담당자 알림 — 신규 원두는 처음 확정될 때 정식 요청(발주 때는 예고만 나갔다).
  // 재발주는 발주 때 이미 요청이 나갔으므로 표기가 바뀐 경우에만 정정 알림. 실패해도 저장은 유지.
  const key = normalize(record.bean);
  const reorder = all.some((r) => r.id !== record.id && normalize(r.bean) === key && r.createdAt < record.createdAt);
  const kind = !reorder && firstConfirm ? 'request' : renamed ? 'rename' : null;
  if (kind) {
    try {
      const by = (user.email ?? '').split('@')[0];
      const cardUrl = `${APP_URL}/garden/beancard?recordId=${record.id}`;
      await notifyGardenEvent(supabase, {
        emails: await topicEmails(supabase, 'beanCard'),
        subject: kind === 'request' ? `[원두카드 요청 · 영문명 확정] ${record.bean}` : `[원두카드 영문명 정정] ${record.bean}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${record.bean}</strong> 원두가 도착해 봉투 표기로 영문명을 확정했어요.${
            kind === 'request' ? ' 원두카드 제작을 부탁드려요.' : ' 이미 만든 카드가 있다면 표기를 확인해 주세요.'
          }</p>
          <p>영문(확정): <strong>${beanEn}</strong>${kind === 'rename' && prevEn ? ` <span style="color:#888">(이전 표기: ${prevEn})</span>` : ''}</p>
          ${record.roastery ? `<p>로스팅사: ${record.roastery}</p>` : ''}
          ${record.tastingNotes ? `<p>테이스팅 노트: ${record.tastingNotes}</p>` : ''}
          <p>확정: ${by}</p>
          <p><a href="${cardUrl}">원두카드 열기 →</a></p>
        </div>`,
        push: {
          title: kind === 'request' ? `원두카드 제작 요청 · ${record.bean}` : `원두카드 영문명 정정 · ${record.bean}`,
          body: `영문명 확정: ${beanEn}`,
          url: `/garden/beancard?recordId=${record.id}`,
        },
      });
    } catch (e) {
      console.error('receive beancard notify 실패:', e);
    }
  }
  return NextResponse.json(record);
}
