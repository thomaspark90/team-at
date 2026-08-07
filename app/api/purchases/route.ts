import { NextResponse } from 'next/server';
import type { PurchaseRecord } from '@/lib/types';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { normalize, computePricing, priceAtMult, DEFAULT_SETTINGS } from '@/lib/pricing';
import { requireGardenTab } from '@/lib/access/guard';

// 같은 발주를 하루에 여러 번 저장(범위 확인 → 배수 책정)해도 기록이 한 건으로 정리되도록,
// 같은 원두·같은 매입가·같은 날(KST)은 append 대신 대체한다.
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, ['pricing', 'recipes', 'dashboard', 'beancard']);
    if (denied) return denied;
  }

  return NextResponse.json(await purchaseRecords.readAll());
}

// 발주 기록 추가: { bean, purchasePrice, settings, costPerCup, rangeLow, rangeHigh }
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

  const body = await req.json();

  // 서버 재계산 — 클라이언트가 보낸 costPerCup/range는 신뢰하지 않는다.
  // 산식이 어긋난 요청이 저장되면 발주 기록·대시보드 원가율까지 연쇄 오염된다.
  const purchasePrice = Number(body.purchasePrice);
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return NextResponse.json({ error: '매입가가 올바르지 않습니다.' }, { status: 400 });
  }
  const settings = { ...DEFAULT_SETTINGS, ...(body.settings ?? {}) };
  if (!(settings.capacityG > 0 && settings.yieldRate > 0 && settings.doseG > 0)) {
    return NextResponse.json({ error: '판매가 산식 기준(용량·잔존율·투입량)이 올바르지 않습니다.' }, { status: 400 });
  }
  const pricing = computePricing(purchasePrice, settings);
  // 책정 배수가 오면 판매가도 서버 산식으로 확정, 배수 없이 가격만 오면 양수 검증만
  const chosenMult = body.chosenMult != null && Number.isFinite(Number(body.chosenMult)) ? Number(body.chosenMult) : null;
  const chosenPrice =
    chosenMult != null
      ? priceAtMult(purchasePrice, chosenMult, settings)
      : Number(body.chosenPrice) > 0
        ? Number(body.chosenPrice)
        : null;

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
    purchasePrice,
    settings,
    costPerCup: pricing.costPerCup,
    rangeLow: pricing.rangeLow,
    rangeHigh: pricing.rangeHigh,
    chosenMult,
    chosenPrice,
    createdBy: user.email ?? '',
  };
  // 같은 날 같은 원두·가격이라도 구매 용량이 다르면 별건 발주(500g/1kg) — 대체하지 않는다
  const dup = (r: PurchaseRecord) =>
    normalize(r.bean) === normalize(record.bean) &&
    r.purchasePrice === record.purchasePrice &&
    (r.settings?.capacityG ?? null) === (record.settings?.capacityG ?? null) &&
    kstDay(r.createdAt) === kstDay(record.createdAt);
  const replaced = (await purchaseRecords.readAll()).filter(dup);
  // 책정가 없이 재저장해도 이미 책정된 판매가는 잃지 않는다 — 단, 재저장으로 원가가
  // 바뀌었으면(예: VAT 포함 여부 정정) 옛 책정가는 새 원가와 모순이라 상속하지 않는다
  if (record.chosenPrice == null) {
    const priced = replaced.filter((r) => r.chosenPrice != null).at(-1);
    if (priced && Math.abs((priced.costPerCup ?? 0) - record.costPerCup) < 0.5) {
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
  {
    const denied = await requireGardenTab(supabase, user, ['pricing', 'recipes', 'dashboard']);
    if (denied) return denied;
  }

  const { id } = await req.json();
  const removed = await purchaseRecords.deleteOne(id);
  await logActivity(supabase, user, '가든서비스 발주 삭제', removed ? removed.bean : null);
  return NextResponse.json({ ok: true });
}
