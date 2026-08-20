import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { cashflow } from '@/lib/finance/cashflow';
import { buildExpensePrep, type ExpenseTx } from '@/lib/finance/prepExpense';
import { buildRevenuePrep, type PosSaleRow, type GiftSaleRow } from '@/lib/finance/prepRevenue';
import { buildCashflowRecon } from '@/lib/finance/cashflowRecon';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import Cashflow from '@/components/finance/Cashflow';
import CashflowReconTable from '@/components/finance/CashflowRecon';
import { UNITS, unitOf } from '@/lib/finance/types';

// 월별 요약 — 통장 현금흐름을 전처리1(지출)·전처리3(매출)과 나란히 대사한다(2026-08-20 개편).
// 통장 숫자만 보여주던 이전 화면은 전처리와 "왜 다른지"가 숨었다 — 식권 시차·선수금·대여금이
// 전부 통장에 섞여 있기 때문. 값은 전처리와 같은 빌더를 써서 화면 간 정합이 구조로 보장된다.

interface TxRow extends ExpenseTx {
  bank: string | null;
  balance: number | null;
  id: number;
  split_parent_id: number | null;
}

export default async function CashflowPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const role = await resolveRoleStamped(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  // 계좌가 브랜드별로 분리 — 통장 현황도 상단 매장 필로 필터
  const unit = unitOf(searchParams.unit) ?? UNITS[0];

  // 거래를 한 번에 읽어 메모리에서 집계한다(전처리1과 같은 방식) — 통장 표와 대사 열이
  // 같은 원본에서 나와야 한다. id 정렬은 동시각 거래의 월말 잔액 안정화용(명세 순서).
  let txQ = supabase
    .schema('finance')
    .from('transactions')
    .select('id,tx_at,ym,source,memo,bank,balance,amount_out,amount_in,category_id,split_parent_id,categories(type,name)')
    .eq('brand', unit.brand)
    .order('tx_at')
    .order('id')
    .limit(50000);
  if (unit.store) txQ = txQ.eq('store', unit.store);

  let posQ = supabase
    .schema('finance')
    .from('pos_sales')
    .select('sale_date,gross')
    .eq('brand', unit.brand)
    .limit(50000);
  if (unit.store) posQ = posQ.eq('store', unit.store);

  // 자가 식권 판매(선수금) — 매출 대사에서 입금>POS 초과를 실측으로 설명하는 열
  let giftQ = supabase
    .schema('finance')
    .from('pos_gift_sales')
    .select('sale_date,gross')
    .eq('brand', unit.brand)
    .limit(50000);
  if (unit.store) giftQ = giftQ.eq('store', unit.store);

  // 지점 뷰에서 빠지는 '지점 미지정' 가든 거래 건수 — 경고 표기용
  const unassignedQ = unit.store
    ? supabase
        .schema('finance')
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'bank')
        .eq('brand', 'garden')
        .is('store', null)
    : null;

  const [{ data: txData, error: txErr }, { data: posData, error: posErr }, { data: giftData }, unassignedRes] =
    await Promise.all([txQ, posQ, giftQ, unassignedQ ?? Promise.resolve({ count: null })]);
  if (txErr) throw new Error(`통장 거래 조회 실패: ${txErr.message}`);
  if (posErr) throw new Error(`POS 매출 조회 실패: ${posErr.message}`);
  const unassignedCount = unassignedRes?.count ?? 0;

  const txns: TxRow[] = (
    (txData as unknown as (Omit<TxRow, 'cat_type' | 'cat_name'> & {
      categories: { type: string; name: string } | null;
    })[] | null) ?? []
  ).map((t) => ({
    id: t.id,
    tx_at: t.tx_at,
    ym: t.ym,
    source: t.source,
    memo: t.memo,
    bank: t.bank,
    balance: t.balance,
    amount_out: t.amount_out,
    amount_in: t.amount_in,
    category_id: t.category_id,
    split_parent_id: t.split_parent_id,
    cat_type: t.categories?.type ?? null,
    cat_name: t.categories?.name ?? null,
  }));

  // 통장 표 — 은행 거래만(카드 이용내역 등 제외해 현금 중복 방지). 건별분할 자식은 제외 —
  // 실제 통장 이동은 부모 한 건이고 자식은 손익용 파생 행이라, 안 거르면 그 금액이 이중이
  // 된다(지표 loadBankCash와 동일 규칙). 쿼리가 tx_at,id 순이라 월말 잔액 선택도 안정적.
  const bankTxns = txns
    .filter((t) => t.source === 'bank' && t.bank != null && t.split_parent_id == null)
    .map((t) => ({
      ym: t.ym,
      bank: t.bank!,
      tx_at: t.tx_at,
      amount_in: t.amount_in,
      amount_out: t.amount_out,
      balance: t.balance ?? 0,
    }));
  const months = cashflow(bankTxns);

  // 대사 축 — 전처리1·3과 같은 빌더의 월 뷰 결과를 그대로 붙인다
  const expensePrep = buildExpensePrep(txns, 'month');
  const revenuePrep = buildRevenuePrep(
    (posData as PosSaleRow[] | null) ?? [],
    txns.filter((t) => t.cat_type === 'revenue'),
    'month',
    (giftData as GiftSaleRow[] | null) ?? []
  );
  const recon = buildCashflowRecon(months, expensePrep, revenuePrep, txns);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1680px] px-6 py-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">월별 요약</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 업로드로
          </Link>
        </div>
        <p className="mb-4 mt-0 max-w-[880px] text-[13px] text-muted-foreground">
          <b>{unit.label}</b>의 통장 입출금·월말 잔액을 <b>전처리3 매출</b>·<b>전처리1 지출</b>과 나란히
          대사해요. 통장과 전처리 숫자가 다른 건 대부분 식권 정산 시차·매출 외 입금·비용 외 출금(대여금
          등) 때문이고, 그 차이를 열로 드러내요 — 값은 전처리 화면과 같은 계산이라 항상 일치해요.
        </p>
        {unit.store && unassignedCount > 0 && (
          <div className="mb-5 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
            ⚠️ 지점이 지정되지 않은 가든 통장 거래 {unassignedCount}건이 이 지점 요약에서 빠져 있어요. 분류
            화면에서 지점을 지정해 주세요.
          </div>
        )}

        <CashflowReconTable recon={recon} unitId={unit.id} />

        <details className="mt-8">
          <summary className="cursor-pointer text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            은행별 상세 (월별 입금·출금·잔액)
          </summary>
          <div className="mt-4">
            <Cashflow months={months} />
          </div>
        </details>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '월별 요약' };
