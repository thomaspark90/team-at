import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { canConfirm } from '@/lib/finance/access';
import { resolveMemberStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import MonthlyCloseManager, { type MonthRow } from '@/components/finance/MonthlyCloseManager';
import MonthShell from '@/components/finance/MonthShell';
import { computeBoardTodos } from '@/lib/finance/boardTodos';
import { unitOf } from '@/lib/finance/types';
import ClosePnlSummary, { type PnlSummaryRow } from '@/components/finance/ClosePnlSummary';
import { buildExpensePrep, type ExpenseTx } from '@/lib/finance/prepExpense';
import { buildExpenseDetail, type CategoryInfo } from '@/lib/finance/prepExpenseDetail';
import { buildRevenuePrep, type PosSaleRow } from '@/lib/finance/prepRevenue';
import { cashflow } from '@/lib/finance/cashflow';

export default async function ClosePage({ searchParams }: { searchParams: { brand?: string; unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMemberStamped(supabase, user);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');
  const allowConfirm = await canConfirm(supabase, user);
  // 확정은 3단위 — 단위는 상단 내비(2단)에서 선택돼 ?unit= 으로 내려온다 (기본 스탭밀, 구 ?brand= 링크 호환)
  // 개인(personal) 단위는 월 확정 대상이 아니다 — 진입 시 스탭밀로 대체.
  const requested = unitOf(searchParams.unit);
  const unit =
    (requested && requested.id !== 'personal' ? requested : null) ??
    (searchParams.brand === 'garden' ? unitOf('yangjae')! : unitOf('staffmeal')!);
  if (requested?.id === 'personal') redirect('/finance/classify?unit=personal');

  // 월별 거래수·미분류수 집계 (데이터량이 작아 JS 집계) — 선택된 단위만.
  // 가든 지점 단위는 '지점 미지정' 가든 거래도 함께 집계 — 미지정이 남으면 확정 불가.
  const txns = unwrap(
    await supabase.schema('finance').from('transactions').select('ym,category_id,store').eq('brand', unit.brand),
    '거래',
  );

  const closes = unwrap(
    await supabase
      .schema('finance')
      .from('monthly_close')
      .select('ym,status,confirmed_at,brand,store')
      .eq('brand', unit.brand)
      .eq('store', unit.store ?? ''),
    '월 확정',
  );

  const closeMap = new Map(
    (closes ?? []).map((c: { ym: string; status: string; confirmed_at: string | null }) => [c.ym, c])
  );
  const agg = new Map<string, { total: number; unclassified: number; unassigned: number }>();
  for (const t of (txns as { ym: string; category_id: number | null; store: string | null }[]) ?? []) {
    const a = agg.get(t.ym) ?? { total: 0, unclassified: 0, unassigned: 0 };
    if (unit.store) {
      // 지점 단위: 그 지점 거래 + 미지정 거래(확정 차단 사유)를 나눠 센다
      if (t.store === unit.store) {
        a.total += 1;
        if (t.category_id == null) a.unclassified += 1;
      } else if (t.store == null) {
        a.unassigned += 1;
      } else {
        agg.set(t.ym, a);
        continue;
      }
    } else {
      a.total += 1;
      if (t.category_id == null) a.unclassified += 1;
    }
    agg.set(t.ym, a);
  }
  const months: MonthRow[] = Array.from(agg.entries())
    .filter(([, a]) => a.total > 0 || a.unassigned > 0)
    .map(([ym, a]) => {
      const c = closeMap.get(ym);
      return {
        ym,
        total: a.total,
        unclassified: a.unclassified,
        unassigned: a.unassigned,
        status: (c?.status as MonthRow['status']) ?? 'open',
        confirmedAt: c?.confirmed_at ?? null,
      };
    })
    .sort((a, b) => b.ym.localeCompare(a.ym));

  // 월별 손익 요약 — 전처리1(지출)·전처리3(매출)·전처리2(미분해)의 빌더를 그대로 재사용.
  // 같은 코드로 계산해야 결산 페이지와 전처리 화면의 숫자가 어긋나지 않는다(2026-08-20 대표 요청).
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
  let fullTxQ = supabase
    .schema('finance')
    .from('transactions')
    .select('tx_at,ym,source,memo,bank,balance,split_parent_id,amount_out,amount_in,category_id,categories(type,name)')
    .eq('brand', unit.brand)
    .limit(50000);
  if (unit.store) fullTxQ = fullTxQ.eq('store', unit.store);
  let posQ = supabase.schema('finance').from('pos_sales').select('sale_date,gross').eq('brand', unit.brand).limit(50000);
  if (unit.store) posQ = posQ.eq('store', unit.store);
  let giftQ = supabase.schema('finance').from('pos_gift_sales').select('sale_date,qty,gross').eq('brand', unit.brand).limit(50000);
  if (unit.store) giftQ = giftQ.eq('store', unit.store);
  const [{ data: fullTxData }, { data: posData }, { data: catsData }, { data: giftData }] = await Promise.all([
    fullTxQ,
    posQ,
    supabase.schema('finance').from('categories').select('id,name,type,parent_id'),
    giftQ,
  ]);
  const fullTxns = mapTx(fullTxData);
  const p1 = buildExpensePrep(fullTxns, 'month');
  const p2 = buildExpenseDetail(fullTxns, (catsData as CategoryInfo[] | null) ?? [], 'month');
  const p3 = buildRevenuePrep(
    (posData as PosSaleRow[] | null) ?? [],
    fullTxns.filter((t) => t.cat_type === 'revenue'),
    'month',
    (giftData as { sale_date: string; qty: number; gross: number }[] | null) ?? []
  );
  const amountsOf = (cols: { key: string; amounts: Record<string, number> }[], key: string) =>
    cols.find((c) => c.key === key)?.amounts ?? {};
  const expenseA = amountsOf(p1.rows, 'total');
  const pendingA = amountsOf(p2.summary, 'g_pending');
  const posA = amountsOf(p3.columns, 'pos');
  const inA = amountsOf(p3.columns, 'in_total');
  // 은행 월말 잔액 — 통장 표(cashflow)와 같은 계산(앵커 방식·분할 자식 제외). 은행 자료 없는 달은 null.
  const bankRaw = (fullTxData ?? []) as { tx_at: string; ym: string; source: string; bank: string | null; balance: number | null; split_parent_id: number | null; amount_in: number; amount_out: number }[];
  const bankMonths = cashflow(
    bankRaw
      .filter((t) => t.source === 'bank' && t.bank != null && t.split_parent_id == null)
      .map((t) => ({ ym: t.ym, bank: t.bank!, tx_at: t.tx_at, amount_in: t.amount_in, amount_out: t.amount_out, balance: t.balance ?? 0 }))
  );
  const balanceByYm = new Map(bankMonths.map((m) => [m.ym, m.totalBalance]));
  // 미분해·미분류 구성 분해 — 셀 클릭 시 "뭐가 분류 안 됐는지"를 보여주기 위해(2026-08-20 대표 요청)
  const cardOtherA = amountsOf(p2.columns, 'card_other');
  const collectedOtherA = amountsOf(p2.columns, 'collected_other');
  const unclassifiedA = amountsOf(p2.columns, 'unclassified');
  const misangA = amountsOf(p2.columns, 'misang');
  const pnlRows: PnlSummaryRow[] = Array.from(
    new Set([...Object.keys(expenseA), ...Object.keys(posA)])
  )
    .sort((a, b) => b.localeCompare(a))
    .map((ym) => ({
      ym,
      pos: posA[ym] ?? 0,
      inTotal: inA[ym] ?? 0,
      expense: expenseA[ym] ?? 0,
      pendingExpense: pendingA[ym] ?? 0,
      pending: {
        cardOther: cardOtherA[ym] ?? 0,
        collectedOther: collectedOtherA[ym] ?? 0,
        unclassified: unclassifiedA[ym] ?? 0,
        misang: misangA[ym] ?? 0,
      },
      bankBalance: balanceByYm.get(ym) ?? null,
    }));

  // 좌측 연·월 사이드바 배지 — 이 단위의 브랜드 몫만
  const initialTodos = await computeBoardTodos(supabase, unit.brand).catch(() => undefined);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">월 결산</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무 홈
          </Link>
        </div>
        <p className="mb-5 mt-0 text-[13px] leading-[1.6] text-muted-foreground">
          <b>{unit.label}</b>의 월 결산이에요 — 확정하면 입력이 잠기고 그 시점 집계가 결산값으로 저장돼요. 결산 후 분류를 고치면 '결산 확인'에서 차이가 보여요. 미분류
          {unit.store ? '와 지점 미지정 가든 거래' : ''}가 0건인 달만 확정할 수 있고, 확정하면 그 달·그 단위의 지출 자료 분류가
          잠겨요. {allowConfirm ? '' : '(확정 권한은 관리자에게 요청하세요.)'}
        </p>
        {/* personal 은 위에서 리다이렉트되므로 여기 unit 은 항상 사업 단위.
            좌측 연·월 사이드바 — 달을 고르면 표에서 그 달 행을 하이라이트·스크롤(2026-08-03) */}
        <MonthShell brand={unit.brand} initialTodos={initialTodos}>
          <ClosePnlSummary rows={pnlRows} unitId={unit.id} />
          <MonthlyCloseManager
            key={unit.id}
            months={months}
            canConfirm={allowConfirm}
            unit={unit.id as 'staffmeal' | 'yangjae' | 'pangyo'}
            brand={unit.brand as 'staffmeal' | 'garden'}
          />
        </MonthShell>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '월 결산' };
