import { NextResponse } from 'next/server';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { denyReceive } from '@/lib/garden/receive-server';

// 원두 수령 기재: { id, roastDate?, beanEn? } — 둘 중 하나 이상.
// - roastDate: 발주 시점엔 로스팅 날짜를 모르므로(봉투에 찍혀 옴) 택배 수령 후 기재한다.
// - beanEn: 발주 때 영문명은 임시 — 봉투 표기를 보고(촬영·타이핑) 확정한다(2026-11-19 대표 결정).
// 원두카드 메일은 여기서 보내지 않는다 — 수령한 사람이 [원두카드 요청하기]를 눌러야 나간다
// (/api/purchases/card-request). 요청 뒤에 영문명을 고치면 요청 표시를 지워 다시 요청하게 한다.
// 권한은 lib/garden/receive-server.ts (설정 › '원두 수령 담당').

// 내가 수령을 기재할 수 있는지 — 화면이 [수령] 버튼을 켜고 끄는 데 쓴다
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  return NextResponse.json({ allowed: !(await denyReceive(supabase, user)) });
}

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

  const record = await purchaseRecords.readOne(id);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });

  if (roastDate) record.roastDate = roastDate;
  if (beanEn) {
    // 이미 요청한 뒤 표기가 바뀌면 담당자가 옛 표기로 만들게 된다 — 요청 표시를 지워 다시 요청하게 한다
    if (record.cardRequested && beanEn !== (record.beanEn ?? '').trim()) delete record.cardRequested;
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
  return NextResponse.json(record);
}
