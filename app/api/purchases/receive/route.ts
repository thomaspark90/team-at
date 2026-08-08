import { NextResponse } from 'next/server';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { requireGardenTab } from '@/lib/access/guard';

// 원두 수령 기재: { id, roastDate } — 발주 시점엔 로스팅 날짜를 모르므로(봉투에 찍혀 옴),
// 택배 수령 후 발주 화면의 [수령] 버튼으로 기재한다. 발주와 같은 pricing 탭 권한.
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
  const roastDate = String(body?.roastDate ?? '');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(roastDate)) {
    return NextResponse.json({ error: '로스팅 날짜가 올바르지 않습니다.' }, { status: 400 });
  }

  const record = await purchaseRecords.readOne(id);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });

  record.roastDate = roastDate;
  await purchaseRecords.writeOne(record);
  await logActivity(supabase, user, '가든서비스 원두 수령', `${record.bean} · 로스팅 ${roastDate}`);
  return NextResponse.json(record);
}
