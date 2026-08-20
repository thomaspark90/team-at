// 월 결산값 계산·비교 — 2026-08-20.
//
// 결산 시점의 집계를 전처리1(소스별)·전처리2(요약 그룹)·전처리3(매출 대사)의 **같은 빌더로**
// 계산해 얼린다 — 화면과 결산값이 다른 코드로 계산되면 그 자체가 새 불일치의 씨앗이 된다.
// 비교(diff)도 여기서: 현재 계산값과 최신 결산값의 항목별 차이를 돌려준다.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildExpensePrep, type ExpenseTx } from './prepExpense';
import { buildExpenseDetail, type CategoryInfo } from './prepExpenseDetail';
import { buildRevenuePrep, type PosSaleRow } from './prepRevenue';
import type { UnitDef } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

/** 결산값 스키마 — v 를 올리면 과거 스냅샷과의 비교 시 판독에 쓴다 */
export interface SnapshotFigures {
  v: 1;
  /** 전처리1 — 소스별 지출 (그 달 열의 값들) */
  expense: Record<string, number>; // key: 전처리1 row key (bank, card_other, naverpay, coupang, unclassified, misang, total …)
  /** 전처리2 — 요약 그룹 (5+1) */
  groups: Record<string, number>; // key: summary key (g_material, g_labor, …, total)
  /** 전처리3 — 매출 대사 */
  revenue: Record<string, number>; // key: pos, in_total, meal_ticket, rate, rate_adj
  /** 그 달 거래 행 수 — 재업로드·삭제 감지용 */
  txCount: number;
}

export interface FigureDiff {
  section: 'expense' | 'groups' | 'revenue' | 'txCount';
  key: string;
  label: string;
  was: number;
  now: number;
}

const LABELS: Record<string, string> = {
  bank: '은행 직접지출',
  card_payment: '카드대금 인출',
  card_other: '카드 기타지출',
  naverpay: '네이버페이',
  coupang: '쿠팡',
  card_statement: '카드 명세',
  unclassified: '미분류',
  misang: '미상',
  total: '지출 합계',
  g_material: '재료비',
  g_labor: '인건비',
  g_rent: '임관리비',
  g_tax: '세금·보험',
  g_etc: '기타 운영비',
  g_pending: '미분해·미분류',
  pos: 'POS 매출',
  in_total: '통장 입금 합계',
  meal_ticket: '식권 정산',
  rate: '정산률',
  rate_adj: '보정 정산률',
  txCount: '거래 행 수',
};

/** 한 달·한 단위의 결산값을 화면과 같은 빌더로 계산한다 */
export async function computeMonthlyFigures(
  supabase: AnyClient,
  unit: UnitDef,
  ym: string
): Promise<SnapshotFigures> {
  const db = supabase.schema('finance');

  let txQ = db
    .from('transactions')
    .select('tx_at,ym,source,memo,amount_out,amount_in,category_id,categories(type,name)')
    .eq('brand', unit.brand)
    .eq('ym', ym)
    .limit(50000);
  if (unit.store) txQ = txQ.eq('store', unit.store);

  let posQ = db
    .from('pos_sales')
    .select('sale_date,gross')
    .eq('brand', unit.brand)
    .gte('sale_date', `${ym}-01`)
    .lte('sale_date', `${ym}-31`)
    .limit(10000);
  if (unit.store) posQ = posQ.eq('store', unit.store);

  // 전처리3의 식권 정산은 '다음 달 중순' 입금이라, 이 달의 회수 상태를 얼리려면
  // 다음 달 입금까지 봐야 한다 — 매출 계정 거래는 이 달·다음 달 두 달치를 읽는다.
  const [y, m] = ym.split('-').map(Number);
  const nextYm = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  let revQ = db
    .from('transactions')
    .select('tx_at,ym,source,memo,amount_out,amount_in,category_id,categories!inner(type,name)')
    .eq('brand', unit.brand)
    .eq('categories.type', 'revenue')
    .in('ym', [ym, nextYm])
    .limit(50000);
  if (unit.store) revQ = revQ.eq('store', unit.store);

  const [{ data: txData, error: txErr }, { data: posData, error: posErr }, { data: revData, error: revErr }, { data: catsData, error: catsErr }] =
    await Promise.all([txQ, posQ, revQ, db.from('categories').select('id,name,type,parent_id')]);
  if (txErr) throw new Error(`거래 조회 실패: ${txErr.message}`);
  if (posErr) throw new Error(`POS 조회 실패: ${posErr.message}`);
  if (revErr) throw new Error(`매출 입금 조회 실패: ${revErr.message}`);
  if (catsErr) throw new Error(`계정과목 조회 실패: ${catsErr.message}`);

  const mapTx = (rows: unknown[] | null): ExpenseTx[] =>
    ((rows as (Omit<ExpenseTx, 'cat_type' | 'cat_name'> & { categories: { type: string; name: string } | null })[] | null) ?? []).map(
      (t) => ({
        tx_at: t.tx_at,
        ym: t.ym,
        source: t.source,
        memo: t.memo,
        amount_out: t.amount_out,
        amount_in: t.amount_in,
        category_id: t.category_id,
        cat_type: t.categories?.type ?? null,
        cat_name: t.categories?.name ?? null,
      })
    );

  const txns = mapTx(txData);
  const cats = (catsData as CategoryInfo[] | null) ?? [];

  const pick = (cols: { key: string; amounts: Record<string, number> }[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const c of cols) {
      const v = c.amounts[ym] ?? 0;
      if (v !== 0 || c.key === 'total' || c.key === 'pos' || c.key === 'in_total') out[c.key] = v;
    }
    return out;
  };

  const p1 = buildExpensePrep(txns, 'month');
  const p2 = buildExpenseDetail(txns, cats, 'month');
  const p3 = buildRevenuePrep((posData as PosSaleRow[] | null) ?? [], mapTx(revData), 'month');

  return {
    v: 1,
    expense: pick(p1.rows),
    groups: pick(p2.summary),
    revenue: pick(p3.columns),
    txCount: txns.length,
  };
}

/** 결산값 대비 현재 계산값의 항목별 차이 — 0이 아닌 것만 */
export function diffFigures(was: SnapshotFigures, now: SnapshotFigures): FigureDiff[] {
  const out: FigureDiff[] = [];
  const sections: ('expense' | 'groups' | 'revenue')[] = ['expense', 'groups', 'revenue'];
  for (const s of sections) {
    const keys = new Set([...Object.keys(was[s] ?? {}), ...Object.keys(now[s] ?? {})]);
    for (const k of Array.from(keys)) {
      const a = was[s]?.[k] ?? 0;
      const b = now[s]?.[k] ?? 0;
      if (a !== b) out.push({ section: s, key: k, label: LABELS[k] ?? k, was: a, now: b });
    }
  }
  if (was.txCount !== now.txCount)
    out.push({ section: 'txCount', key: 'txCount', label: LABELS.txCount, was: was.txCount, now: now.txCount });
  // 합계·핵심부터 보이게
  const rank = (d: FigureDiff) => (d.key === 'total' ? 0 : d.section === 'txCount' ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || Math.abs(b.now - b.was) - Math.abs(a.now - a.was));
}
