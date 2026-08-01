import type { SupabaseClient } from '@supabase/supabase-js';
import { UPLOAD_SLOTS } from './uploadSlots';
import { monthCoverage, type DayInterval } from './coverage';

const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// 월 스트립 배지용 — 월별 남은 업무 수 일괄 집계.
// 남은 업무 = 미완료 업로드 슬롯 + 미분류가 남은 출처 수 + 월 확정(자료 있고 미확정이면 1).
// 확정된 달·이번 달 이후·자료 없는 옛날 달은 0 (배지 없음).
// brand 지정 시 그 브랜드 몫만 집계(페이지가 브랜드 고정) — 미지정은 전 브랜드 합산(구버전 호환).
// API 라우트와 대시보드 서버 컴포넌트(초기 데이터 프리페치)가 공용으로 사용. 조회 실패 시 throw.
export async function computeBoardTodos(supabase: SupabaseClient, brand?: string): Promise<Record<string, number>> {
  const now = new Date();
  const currentYm = toYm(now);
  const prevYm = toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const months: string[] = [];
  for (let i = -24; i <= 1; i++) months.push(toYm(new Date(now.getFullYear(), now.getMonth() + i, 1)));

  const closesSel = supabase.schema('finance').from('monthly_close').select('ym,status,store');
  const uploadsSel = supabase.schema('finance').from('uploads').select('slot,slot_ym,bank,source,period_start,period_end');
  const txSel = supabase.schema('finance').from('transactions').select('ym,source,category_id');
  // POS 매출은 브랜드 지정 시에만 배지에 포함 — 보드의 POS 칸과 합이 맞도록. (전역 모드는 기존 동작 유지)
  const posSel = supabase.schema('finance').from('pos_sales').select('ym,store');
  const [closesQ, uploadsQ, txQ, posQ] = await Promise.all([
    brand ? closesSel.eq('brand', brand) : closesSel,
    brand ? uploadsSel.eq('brand', brand) : uploadsSel,
    brand ? txSel.eq('brand', brand) : txSel,
    brand && brand !== 'personal' ? posSel.eq('brand', brand) : Promise.resolve({ data: [], error: null }),
  ]);
  if (uploadsQ.error) throw new Error(uploadsQ.error.message);
  if (txQ.error) throw new Error(txQ.error.message);

  const posByYm = new Map<string, Set<string>>();
  for (const p of posQ.data ?? []) {
    const ym = String(p.ym);
    if (!posByYm.has(ym)) posByYm.set(ym, new Set());
    posByYm.get(ym)!.add(String(p.store ?? ''));
  }
  const posStores = brand === 'garden' ? ['yangjae', 'pangyo'] : brand === 'staffmeal' ? [''] : [];

  // 월확정은 단위별 (ym,brand,store) — 가든은 양재천·판교 둘 다 확정돼야 그 달 완료.
  // 그 외(스탭밀 등·브랜드 미지정 전역)는 확정 행이 있으면 완료(기존 동작 유지).
  const confirmedRows = (closesQ.data ?? []).filter((c) => c.status === 'confirmed');
  let confirmed: Set<string>;
  if (brand === 'garden') {
    const byYm = new Map<string, Set<string>>();
    for (const c of confirmedRows) {
      const ym = String(c.ym);
      if (!byYm.has(ym)) byYm.set(ym, new Set());
      byYm.get(ym)!.add(String(c.store ?? ''));
    }
    confirmed = new Set(
      Array.from(byYm.entries())
        .filter(([, stores]) => stores.has('yangjae') && stores.has('pangyo'))
        .map(([ym]) => ym)
    );
  } else {
    confirmed = new Set(confirmedRows.map((c) => String(c.ym)));
  }

  // 월·슬롯별 수집 — 보드 업로드(slot 기록)는 slot_ym 달 + 파일 기간이 겹치는 모든 달에,
  // 기존 경로(slot 없음)는 기간 겹침으로 자동 감지해 반영한다.
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
    if (u.slot) {
      const slotYm = u.slot_ym ? String(u.slot_ym) : null;
      if (slotYm) mark(slotYm, String(u.slot), iv);
      if (iv) {
        for (const ym of months) {
          if (ym !== slotYm && iv.start.slice(0, 7) <= ym && ym <= iv.end.slice(0, 7)) mark(ym, String(u.slot), iv);
        }
      }
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
    // 개인(personal)은 월확정 개념이 없다(확정 화면에서 제외되는 단위)
    const closeOpen = brand === 'personal' ? 0 : hasData ? 1 : 0;
    // POS 매출 미입력 지점 수 (브랜드 지정 시에만 — 보드 POS 칸과 동일 규칙)
    const posOpen = posStores.filter((s) => !posByYm.get(ym)?.has(s)).length;
    counts[ym] = uploadOpen + classifyOpen + closeOpen + posOpen;
  }

  return counts;
}
