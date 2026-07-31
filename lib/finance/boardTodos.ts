import type { SupabaseClient } from '@supabase/supabase-js';
import { UPLOAD_SLOTS } from './uploadSlots';
import { monthCoverage, type DayInterval } from './coverage';

const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// 월 스트립 배지용 — 월별 남은 업무 수 일괄 집계.
// 남은 업무 = 미완료 업로드 슬롯 + 미분류가 남은 출처 수 + 월 확정(자료 있고 미확정이면 1).
// 확정된 달·이번 달 이후·자료 없는 옛날 달은 0 (배지 없음).
// API 라우트와 대시보드 서버 컴포넌트(초기 데이터 프리페치)가 공용으로 사용. 조회 실패 시 throw.
export async function computeBoardTodos(supabase: SupabaseClient): Promise<Record<string, number>> {
  const now = new Date();
  const currentYm = toYm(now);
  const prevYm = toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const months: string[] = [];
  for (let i = -24; i <= 1; i++) months.push(toYm(new Date(now.getFullYear(), now.getMonth() + i, 1)));

  const [closesQ, uploadsQ, txQ] = await Promise.all([
    supabase.schema('finance').from('monthly_close').select('ym,status'),
    supabase.schema('finance').from('uploads').select('slot,slot_ym,bank,source,period_start,period_end'),
    supabase.schema('finance').from('transactions').select('ym,source,category_id'),
  ]);
  if (uploadsQ.error) throw new Error(uploadsQ.error.message);
  if (txQ.error) throw new Error(txQ.error.message);

  const confirmed = new Set(
    (closesQ.data ?? []).filter((c) => c.status === 'confirmed').map((c) => String(c.ym))
  );

  // 월·슬롯별 수집 — 보드 업로드(slot 기록) + 기존 경로 자동 감지(기간 겹침).
  // 기간 구간을 모아 커버리지(부분 업로드는 미완료로 집계)까지 판정한다.
  const slotAcc = new Map<string, Map<string, { intervals: DayInterval[]; periodless: boolean }>>();
  const mark = (ym: string, key: string, iv: DayInterval | null) => {
    if (!slotAcc.has(ym)) slotAcc.set(ym, new Map());
    const m = slotAcc.get(ym)!;
    if (!m.has(key)) m.set(key, { intervals: [], periodless: false });
    if (iv) m.get(key)!.intervals.push(iv);
    else m.get(key)!.periodless = true;
  };
  for (const u of uploadsQ.data ?? []) {
    const iv =
      u.period_start && u.period_end ? { start: String(u.period_start), end: String(u.period_end) } : null;
    if (u.slot && u.slot_ym) {
      mark(String(u.slot_ym), String(u.slot), iv);
      continue;
    }
    const key =
      u.source === 'card' ? 'card_main' : u.bank === 'shinhan' ? 'bank_shinhan' : u.bank === 'woori' ? 'bank_woori' : null;
    if (!key || !iv) continue;
    for (const ym of months) {
      if (iv.start.slice(0, 7) <= ym && ym <= iv.end.slice(0, 7)) mark(ym, key, iv);
    }
  }

  // 월·출처별 거래/미분류 집계
  const perMonth = new Map<string, Record<string, { total: number; uncl: number }>>();
  for (const t of txQ.data ?? []) {
    const ym = String(t.ym);
    const src = String(t.source ?? 'bank');
    if (!perMonth.has(ym)) perMonth.set(ym, {});
    const bucket = perMonth.get(ym)!;
    bucket[src] = bucket[src] ?? { total: 0, uncl: 0 };
    bucket[src].total++;
    if (t.category_id == null) bucket[src].uncl++;
  }

  const counts: Record<string, number> = {};
  for (const ym of months) {
    const sources = perMonth.get(ym) ?? {};
    if ((sources.naverpay?.total ?? 0) > 0) {
      // 자동수집 = 매일 들어오므로 월 전체로 간주
      const [yy, mm] = ym.split('-').map(Number);
      mark(ym, 'naverpay', { start: `${ym}-01`, end: `${ym}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}` });
    }
    const hasData = Object.values(sources).some((s) => s.total > 0);

    if (ym >= currentYm || confirmed.has(ym) || (!hasData && ym !== prevYm)) {
      counts[ym] = 0;
      continue;
    }
    const slotMap = slotAcc.get(ym) ?? new Map();
    // 완료 = 올라갔고(커버리지 판정 가능하면) 월 전체를 덮음 — 부분(◐)은 남은 업무로 집계
    const uploadOpen = UPLOAD_SLOTS.filter((s) => {
      const a = slotMap.get(s.key);
      if (!a) return true;
      if (a.intervals.length === 0) return !a.periodless; // 기간 없는 구버전 기록만 = 완료 간주
      return !monthCoverage(ym, a.intervals).full;
    }).length;
    const classifyOpen = Object.values(sources).filter((s) => s.uncl > 0).length;
    const closeOpen = hasData ? 1 : 0;
    counts[ym] = uploadOpen + classifyOpen + closeOpen;
  }

  return counts;
}
