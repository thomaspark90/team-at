import { NextResponse } from 'next/server';
import type { PurchaseRecord } from '@/lib/types';
import { purchaseRecords } from '@/lib/blob-records';
import { createClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/finance/activity';
import { normalize, computePricing, priceAtMult, DEFAULT_SETTINGS } from '@/lib/pricing';
import { requireGardenTab } from '@/lib/access/guard';
import { topicEmails } from '@/lib/garden-notify-topics-server';
import { notifyGardenEvent } from '@/lib/notify';
import { APP_URL } from '@/lib/app-url';

// 같은 발주를 하루에 여러 번 저장(범위 확인 → 배수 책정)해도 기록이 한 건으로 정리되도록,
// 같은 원두·같은 매입가·같은 날(KST)은 append 대신 대체한다.
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, ['pricing', 'saleprice', 'recipes', 'dashboard', 'beancard']);
    if (denied) return denied;
  }

  // 나비 배지용 경량 응답 — 판매가 미책정 건수만 (매 페이지 로드에 전체 레코드를 내리지 않게)
  if (new URL(req.url).searchParams.get('scope') === 'unpriced-count') {
    const count = (await purchaseRecords.readAll()).filter((r) => r.chosenPrice == null).length;
    return NextResponse.json({ count });
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

  const record: PurchaseRecord = {
    // 같은 밀리초에 두 건이 저장되면 id 가 겹쳐 한쪽이 덮어써지므로 UUID 사용
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    bean: body.bean,
    beanEn: body.beanEn ? String(body.beanEn).trim() : undefined,
    roastery: body.roastery ? String(body.roastery).trim() : undefined,
    orderDate: body.orderDate ? String(body.orderDate) : undefined,
    // 로스팅 날짜는 발주 시점엔 모른다 — 수령 후 /api/purchases/receive 로 기재
    roastDate: body.roastDate ? String(body.roastDate) : undefined,
    staffName: body.staffName ? String(body.staffName).trim() : undefined,
    tastingNotes: body.tastingNotes ? String(body.tastingNotes).trim() : undefined,
    purchasePrice,
    settings,
    costPerCup: pricing.costPerCup,
    rangeLow: pricing.rangeLow,
    rangeHigh: pricing.rangeHigh,
    // 판매가 책정은 권한이 분리된 별도 동작(PATCH · saleprice 탭) — POST 로는 책정값을
    // 받지 않는다. 받으면 발주 권한만 가진 계정이 API 로 판매가를 정할 수 있게 된다.
    chosenMult: null,
    chosenPrice: null,
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

  // 발주 → 판매가 책정 담당자 호출(권한 분리된 2단계 플로 연결). 책정 대기 건이 새로
  // 생겼을 때만 — 같은 날 재저장(대체)이나 책정가를 상속한 건은 제외해 중복 알림을 막는다.
  // 담당자 미지정이면 topicEmails 가 원두 알림 수신자로 폴백. 실패해도 발주 저장은 막지 않는다.
  if (record.chosenPrice == null && replaced.length === 0) {
    try {
      const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
      const by = record.staffName ? `${record.staffName}님` : (user.email ?? '').split('@')[0];
      const salepriceUrl = `${APP_URL}/garden/saleprice`;
      await notifyGardenEvent(supabase, {
        emails: await topicEmails(supabase, 'salePriceRequest'),
        subject: `[판매가 책정 대기] ${record.bean}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>${record.bean}</strong>${record.roastery ? ` · ${record.roastery}` : ''} 발주가 저장됐어요. 판매가를 책정해 주세요.</p>
          <p>매입 ${won(record.purchasePrice)} · 잔당 재료비 ${won(record.costPerCup)} · 권장 판매 ${won(record.rangeLow)}~${won(record.rangeHigh)}</p>
          <p>발주: ${by}</p>
          <p><a href="${salepriceUrl}">판매가 설정 열기 →</a></p>
        </div>`,
        push: {
          title: `판매가 책정 대기 · ${record.bean}`,
          body: `재료비 ${won(record.costPerCup)} · 권장 ${won(record.rangeLow)}~${won(record.rangeHigh)} — ${by} 발주`,
          url: '/garden/saleprice',
        },
      });
    } catch (e) {
      console.error('saleprice request notify 실패:', e);
    }
  }
  return NextResponse.json(record);
}

// 판매가 책정: { id, chosenMult } — 발주(POST)와 분리된 동작이라 saleprice 탭 권한만 허용.
// chosenMult: null 을 보내면 책정 해제. 판매가는 항상 서버 산식(당시 설정 스냅샷)으로 확정한다.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  {
    const denied = await requireGardenTab(supabase, user, 'saleprice');
    if (denied) return denied;
  }

  const body = await req.json();
  const record = (await purchaseRecords.readAll()).find((r) => r.id === body.id);
  if (!record) return NextResponse.json({ error: '발주 기록을 찾을 수 없습니다.' }, { status: 404 });

  if (body.chosenMult == null) {
    record.chosenMult = null;
    record.chosenPrice = null;
  } else {
    const mult = Number(body.chosenMult);
    if (!Number.isFinite(mult) || mult < 1 || mult > 20) {
      return NextResponse.json({ error: '배수가 올바르지 않습니다.' }, { status: 400 });
    }
    record.chosenMult = mult;
    record.chosenPrice = priceAtMult(record.purchasePrice, mult, { ...DEFAULT_SETTINGS, ...record.settings });
  }
  await purchaseRecords.writeOne(record);
  await logActivity(
    supabase,
    user,
    '가든서비스 판매가 책정',
    record.chosenPrice != null
      ? `${record.bean} · 판매가 ${record.chosenPrice.toLocaleString()}원 (${record.chosenMult}×)`
      : `${record.bean} · 책정 해제`
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
    const denied = await requireGardenTab(supabase, user, ['pricing', 'saleprice', 'recipes', 'dashboard']);
    if (denied) return denied;
  }

  const { id } = await req.json();
  const removed = await purchaseRecords.deleteOne(id);
  await logActivity(supabase, user, '가든서비스 발주 삭제', removed ? removed.bean : null);
  return NextResponse.json({ ok: true });
}
