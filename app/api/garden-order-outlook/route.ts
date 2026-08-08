import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireGardenTab } from '@/lib/access/guard';
import { purchaseRecords } from '@/lib/blob-records';
import { stockOf, type BeanMetaStore, type PurchaseRecord, type StoreId } from '@/lib/types';
import { fetchForecastDays } from '@/lib/garden/weatherForecast';
import { cupsWeatherFactor } from '@/lib/garden/weatherImpact';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 발주 참고 — 원두별 잔여 추정(날씨 보정) v1.
// 데이터: 원두 재고 %(garden-beans) + 마지막 발주(purchases: 용량 capacityG·시점).
// 소비 속도 = (용량 × 소진된 %) ÷ 발주 후 경과일 — 발주 1회=1봉(capacityG) 가정의 거친 추정이라
// '참고용'으로만 표시한다. 다음 7일 날씨 배율로 잔여일을 보정한다.

interface OutlookRow {
  bean: string;
  store: StoreId;
  stockPct: number;
  lastPurchaseAt: string; // YYYY-MM-DD
  daysSince: number;
  estDaysLeft: number | null; // null = 추정 불가(소진 이력 부족)
  weatherFactor: number; // 다음 7일 평균 잔수 배율
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const denied = await requireGardenTab(supabase, user, 'weather');
  if (denied) return denied;

  // 원두 메타(재고 %) + 발주 기록
  let beans: BeanMetaStore = { beans: [] };
  try {
    const res = await get('data/garden-beans.json', { access: 'private', useCache: false });
    if (res) beans = JSON.parse(await new Response(res.stream).text()) as BeanMetaStore;
  } catch {
    // 파일 없음 — 빈 목록
  }
  const purchases = await purchaseRecords.readAll();

  // 다음 7일 날씨 배율(잔수 기준) — 휴무 요일 구분 없이 평균(참고 지표라 충분)
  let weatherFactor = 1;
  try {
    const days = await fetchForecastDays();
    const week = days.slice(0, 7);
    if (week.length) weatherFactor = week.reduce((s, d) => s + cupsWeatherFactor(d), 0) / week.length;
  } catch {
    // 예보 실패 — 보정 없이 1
  }

  const now = Date.now();
  const latestByBean = new Map<string, PurchaseRecord>();
  for (const p of purchases) {
    const cur = latestByBean.get(p.bean);
    if (!cur || (p.createdAt ?? '') > (cur.createdAt ?? '')) latestByBean.set(p.bean, p);
  }

  const rows: OutlookRow[] = [];
  for (const meta of beans.beans) {
    const p = latestByBean.get(meta.bean);
    if (!p?.createdAt) continue; // 발주 기록 없으면 추정 불가
    const daysSince = Math.max(0, Math.floor((now - Date.parse(p.createdAt)) / 86400_000));
    for (const store of ['pangyo', 'yangjae'] as StoreId[]) {
      const stockPct = stockOf(meta, store);
      if (stockPct >= 100) continue; // 소진 이력 없음 — 표시 대상 아님
      const capacity = p.settings?.capacityG ?? 0;
      const usedG = (capacity * (100 - stockPct)) / 100;
      const remainG = (capacity * stockPct) / 100;
      // 경과 3일 미만·소진 0 은 속도 추정이 불안정
      const dailyG = daysSince >= 3 && usedG > 0 ? usedG / daysSince : 0;
      const estDaysLeft = dailyG > 0 ? Math.round(remainG / (dailyG * weatherFactor)) : null;
      rows.push({
        bean: meta.bean,
        store,
        stockPct,
        lastPurchaseAt: p.createdAt.slice(0, 10),
        daysSince,
        estDaysLeft,
        weatherFactor: Math.round(weatherFactor * 100) / 100,
      });
    }
  }
  rows.sort((a, b) => (a.estDaysLeft ?? 999) - (b.estDaysLeft ?? 999));

  return NextResponse.json({ rows, weatherFactor: Math.round(weatherFactor * 100) / 100 });
}
