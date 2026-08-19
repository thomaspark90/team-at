import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import { cashflow } from '@/lib/finance/cashflow';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import Cashflow from '@/components/finance/Cashflow';
import { UNITS, unitOf } from '@/lib/finance/types';

interface CashTx {
  ym: string;
  bank: string;
  tx_at: string;
  amount_in: number;
  amount_out: number;
  balance: number;
}

export default async function CashflowPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const role = await resolveRoleStamped(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  // 계좌가 브랜드별로 분리 — 통장 현황도 상단 매장 필로 필터
  const unit = unitOf(searchParams.unit) ?? UNITS[0];

  // 통장 현황(현금)은 은행 거래만 — 카드 이용내역(source='card')은 제외해 현금 중복 방지
  let txQ = supabase
    .schema('finance')
    .from('transactions')
    .select('ym,bank,tx_at,amount_in,amount_out,balance')
    .eq('source', 'bank')
    .eq('brand', unit.brand);
  if (unit.store) txQ = txQ.eq('store', unit.store);
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
  const [txRes, unassignedRes] = await Promise.all([txQ, unassignedQ ?? Promise.resolve({ count: null })]);
  const txns = unwrap(txRes, '통장 거래');
  const unassignedCount = unassignedRes?.count ?? 0;

  const months = cashflow((txns as CashTx[]) ?? []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">월별 요약</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 업로드로
          </Link>
        </div>
        <p className="mb-4 mt-0 text-[13px] text-muted-foreground">
          월별로 은행별 입금·출금과 월말 잔액, 통장 합계를 집계해요. (분류와 무관하게 통장 자체의 인/아웃)
        </p>
        {unit.store && unassignedCount > 0 && (
          <div className="mb-5 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
            ⚠️ 지점이 지정되지 않은 가든 통장 거래 {unassignedCount}건이 이 지점 요약에서 빠져 있어요. 분류
            화면에서 지점을 지정해 주세요.
          </div>
        )}
        <Cashflow months={months} />
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '월별 요약' };
