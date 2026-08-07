import { NextResponse } from 'next/server';
import type { PurchaseRecord } from '@/lib/types';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { normalize } from '@/lib/pricing';

// 같은 발주를 하루에 여러 번 저장(범위 확인 → 배수 책정)해도 기록이 한 건으로 정리되도록,
// 같은 원두·같은 매입가·같은 날(KST)은 append 대신 대체한다.
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  return NextResponse.json(await purchaseRecords.readAll());
}

// 발주 기록 추가: { bean, purchasePrice, settings, costPerCup, rangeLow, rangeHigh }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json();
  const record: PurchaseRecord = {
    // 같은 밀리초에 두 건이 저장되면 id 가 겹쳐 한쪽이 덮어써지므로 UUID 사용
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    bean: body.bean,
    beanEn: body.beanEn ? String(body.beanEn).trim() : undefined,
    roastery: body.roastery ? String(body.roastery).trim() : undefined,
    roastDate: body.roastDate ? String(body.roastDate) : undefined,
    staffName: body.staffName ? String(body.staffName).trim() : undefined,
    tastingNotes: body.tastingNotes ? String(body.tastingNotes).trim() : undefined,
    purchasePrice: body.purchasePrice,
    settings: body.settings,
    costPerCup: body.costPerCup,
    rangeLow: body.rangeLow,
    rangeHigh: body.rangeHigh,
    chosenMult: body.chosenMult ?? null,
    chosenPrice: body.chosenPrice ?? null,
    createdBy: user.email ?? '',
  };
  const dup = (r: PurchaseRecord) =>
    normalize(r.bean) === normalize(record.bean) &&
    r.purchasePrice === record.purchasePrice &&
    kstDay(r.createdAt) === kstDay(record.createdAt);
  const replaced = (await purchaseRecords.readAll()).filter(dup);
  // 책정가 없이 재저장해도 이미 책정된 판매가는 잃지 않는다
  if (record.chosenPrice == null) {
    const priced = replaced.filter((r) => r.chosenPrice != null).at(-1);
    if (priced) {
      record.chosenPrice = priced.chosenPrice;
      record.chosenMult = priced.chosenMult;
    }
  }
  await purchaseRecords.writeOne(record);
  for (const r of replaced) await purchaseRecords.deleteOne(r.id);
  await logActivity(
    supabase,
    user,
    '가든서비스 발주 기록',
    `${record.bean} · 매입 ${Number(record.purchasePrice).toLocaleString()}원` +
      (record.chosenPrice != null ? ` · 판매가 ${Number(record.chosenPrice).toLocaleString()}원` : '')
  );
  return NextResponse.json(record);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await req.json();
  const removed = await purchaseRecords.deleteOne(id);
  await logActivity(supabase, user, '가든서비스 발주 삭제', removed ? removed.bean : null);
  return NextResponse.json({ ok: true });
}
