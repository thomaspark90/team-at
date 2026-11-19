import { NextResponse } from 'next/server';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { normalize } from '@/lib/pricing';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { notifyGardenEvent } from '@/lib/notify';
import { APP_URL } from '@/lib/app-url';
import { STORES } from '@/lib/types';
import { denyReceive } from '@/lib/garden/receive-server';

// 원두카드 제작 요청: { id, skip? } — 수령한 사람이 [원두카드 요청하기]를 누를 때만 메일이 나간다
// (2026-11-19 대표 결정: 발주 때 예고·자동 요청은 없앴다 — 확정된 한글·영문 원두명으로만 요청).
// 받는 사람은 설정 › 항목별 담당자 › '원두카드 제작 요청'. skip=true 는 메일 없이 '요청 안 함'(기존 카드 사용)으로 닫는다.
// 권한은 수령과 같다(lib/garden/receive-server.ts).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await denyReceive(supabase, user);
    if (denied) return denied;
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? '');
  const skip = body?.skip === true;
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

  const all = await purchaseRecords.readAll();
  const record = all.find((r) => r.id === id);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });
  if (!record.beanEnConfirmed || !record.beanEn?.trim()) {
    return NextResponse.json({ error: '영문 원두명을 먼저 확정해 주세요.' }, { status: 400 });
  }

  const at = new Date().toISOString();
  let sentTo: string[] = [];
  if (!skip) {
    const key = normalize(record.bean);
    const reorder = all.some((r) => r.id !== record.id && normalize(r.bean) === key && r.createdAt < record.createdAt);
    const by = (user.email ?? '').split('@')[0];
    const store = STORES.find((s) => s.id === record.store)?.label;
    const cardUrl = `${APP_URL}/garden/beancard?recordId=${record.id}`;
    sentTo = await topicEmails(supabase, 'beanCard');
    if (sentTo.length === 0) {
      return NextResponse.json(
        { error: "원두카드 담당자가 지정돼 있지 않아요. 설정 › 항목별 담당자 › '원두카드 제작 요청'을 확인해 주세요." },
        { status: 400 }
      );
    }
    {
      await notifyGardenEvent(supabase, {
        emails: sentTo,
        subject: `[원두카드 요청${reorder ? ' · 재발주' : ''}] ${record.bean} / ${record.beanEn}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p>원두가 도착했어요. 원두카드 제작을 부탁드려요.${
            reorder ? ' (이전에 발주한 적 있는 원두예요 — 기존 카드와 표기가 같은지 확인해 주세요)' : ''
          }</p>
          <p>한글 원두명: <strong>${esc(record.bean)}</strong><br/>
          영문 원두명(봉투 표기로 확정): <strong>${esc(record.beanEn)}</strong></p>
          ${record.roastery ? `<p>로스팅사: ${esc(record.roastery)}</p>` : ''}
          ${record.tastingNotes ? `<p>테이스팅 노트: ${esc(record.tastingNotes)}</p>` : ''}
          ${store ? `<p>지점: ${store}</p>` : ''}
          <p>판매가는 매장에서 카드에 수기로 적어요 — 디자인에 넣지 않아도 돼요.</p>
          <p>요청: ${esc(by)}</p>
          <p><a href="${cardUrl}">원두카드 열기 →</a></p>
        </div>`,
        push: {
          title: `원두카드 제작 요청 · ${record.bean}`,
          body: `${record.beanEn} — ${by} 요청`,
          url: `/garden/beancard?recordId=${record.id}`,
        },
      });
    }
  }

  record.cardRequested = { by: user.email ?? '', at, ...(skip ? { note: '요청 안 함 — 기존 카드 사용' } : {}) };
  await purchaseRecords.writeOne(record);
  await logActivity(
    supabase,
    user,
    skip ? '가든서비스 원두카드 요청 생략' : '가든서비스 원두카드 제작 요청',
    `${record.bean} / ${record.beanEn}${sentTo.length ? ` → ${sentTo.join(', ')}` : ''}`
  );
  return NextResponse.json({ record, sentTo });
}
