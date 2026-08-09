import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import { cashflow } from '@/lib/finance/cashflow';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import Cashflow from '@/components/finance/Cashflow';
import BrandSegments, { parseBrandSeg } from '@/components/finance/BrandSegments';

interface CashTx {
  ym: string;
  bank: string;
  tx_at: string;
  amount_in: number;
  amount_out: number;
  balance: number;
}

export default async function CashflowPage({ searchParams }: { searchParams: { brand?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const role = await resolveRoleStamped(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  // 계좌가 브랜드별로 분리 — 통장 현황도 브랜드로 필터('전체'는 두 브랜드 합)
  const seg = parseBrandSeg(searchParams.brand);

  // 통장 현황(현금)은 은행 거래만 — 카드 이용내역(source='card')은 제외해 현금 중복 방지
  let txQ = supabase
    .schema('finance')
    .from('transactions')
    .select('ym,bank,tx_at,amount_in,amount_out,balance')
    .eq('source', 'bank');
  if (seg !== 'all') txQ = txQ.eq('brand', seg);
  const txns = unwrap(await txQ, '통장 거래');

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
        <div className="mb-5">
          <BrandSegments basePath="/finance/cashflow" seg={seg} />
        </div>
        <Cashflow months={months} />
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '월별 요약' };
