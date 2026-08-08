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

// 발주 참고 — 원두별 잔여 추정(날씨 보정) v2.
// 추정 방법 두 갈래:
//   '주기' — 같은 원두의 발주 간격 중앙값 × 재고% (발주 2회 이상이면 우선. 봉지 수 가정 불필요)
//   '용량' — (마지막 발주 capacityG × 소진%) ÷ 경과일 (발주 1회뿐일 때 폴백, 1회=1봉 가정)
// 어느 쪽이든 참고치 — 다음 7일 날씨 배율로 잔여일을 보정한다.

interface OutlookRow {
  bean: string;
  store: StoreId;
  stockPct: number;
  lastPurchaseAt: string; // YYYY-MM-DD
  daysSince: number;
  estDaysLeft: number | null; // null = 추정 불가(소진 이력 부족)
  method: '주기' | '용량' | null; // 어떤 방식으로 추정했는지
  weatherFactor: number; // 다음 7일 평균 잔수 배율
}

const median = (nums: number[]): number | null => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

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
  const byBean = new Map<string, PurchaseRecord[]>();
  for (const p of purchases) {
    if (!p.createdAt) continue;
    const list = byBean.get(p.bean) ?? [];
    list.push(p);
    byBean.set(p.bean, list);
  }

  const rows: OutlookRow[] = [];
  for (const meta of beans.beans) {
    const history = (byBean.get(meta.bean) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const p = history[history.length - 1];
    if (!p) continue; // 발주 기록 없으면 추정 불가
    const daysSince = Math.max(0, Math.floor((now - Date.parse(p.createdAt)) / 86400_000));
    // 발주 주기 — 연속 발주 간격(1일 이하 중복 입력 제외)의 중앙값
    const intervals: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const d = (Date.parse(history[i].createdAt) - Date.parse(history[i - 1].createdAt)) / 86400_000;
      if (d > 1) intervals.push(d);
    }
    const cycleDays = median(intervals);
    for (const store of ['pangyo', 'yangjae'] as StoreId[]) {
      const stockPct = stockOf(meta, store);
      if (stockPct >= 100) continue; // 소진 이력 없음 — 표시 대상 아님
      let estDaysLeft: number | null = null;
      let method: OutlookRow['method'] = null;
      if (cycleDays != null) {
        // 주기 기반 — 봉지 수 가정 없이 실제 재발주 패턴 사용
        estDaysLeft = Math.round((cycleDays * (stockPct / 100)) / weatherFactor);
        method = '주기';
      } else {
        const capacity = p.settings?.capacityG ?? 0;
        const usedG = (capacity * (100 - stockPct)) / 100;
        const remainG = (capacity * stockPct) / 100;
        const dailyG = daysSince >= 3 && usedG > 0 ? usedG / daysSince : 0; // 경과 3일 미만·소진 0 은 불안정
        if (dailyG > 0) {
          estDaysLeft = Math.round(remainG / (dailyG * weatherFactor));
          method = '용량';
        }
      }
      rows.push({
        bean: meta.bean,
        store,
        stockPct,
        lastPurchaseAt: p.createdAt.slice(0, 10),
        daysSince,
        estDaysLeft,
        method,
        weatherFactor: Math.round(weatherFactor * 100) / 100,
      });
    }
  }
  rows.sort((a, b) => (a.estDaysLeft ?? 999) - (b.estDaysLeft ?? 999));

  return NextResponse.json({ rows, weatherFactor: Math.round(weatherFactor * 100) / 100 });
}
