import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import { buildSankey, type SankTx, type SankCat, type SankeyData } from '@/lib/finance/sankey';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import SankeyFlow, { type Period } from '@/components/finance/SankeyFlow';

const fmtYm = (ym: string) => {
  const [y, mo] = ym.split('-');
  return `${y}년 ${Number(mo)}월`;
};

export default async function FlowPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const txnsRaw = unwrap(
    await supabase.schema('finance').from('transactions').select('ym,category_id,amount_in,amount_out'),
    '거래',
  );
  const catsRaw = unwrap(
    await supabase.schema('finance').from('categories').select('id,type,name,parent_id'),
    '계정과목',
  );

  const txns = (txnsRaw as SankTx[] | null) ?? [];
  const cats = (catsRaw as SankCat[] | null) ?? [];

  const yms = Array.from(new Set(txns.map((t) => t.ym))).sort((a, b) => b.localeCompare(a));

  const periods: Period[] = [{ key: 'all', label: '전체 기간' }, ...yms.map((ym) => ({ key: ym, label: fmtYm(ym) }))];
  const data: Record<string, SankeyData> = { all: buildSankey(txns, cats) };
  for (const ym of yms) data[ym] = buildSankey(txns.filter((t) => t.ym === ym), cats);

  const initialKey = yms[0] ?? 'all';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1680px] px-6 py-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">자금 흐름</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무 홈
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          통장 현금 기준으로 매출·지출을 카테고리·품목별로 보여줘요(미분류 포함, 카드는 품목까지). 현금 입출금·잔액 합계는 <Link href="/finance/cashflow" className="underline">월별 요약</Link>, 발생주의 손익은 <Link href="/finance/pnl" className="underline">관리손익</Link>에서 봐요.
        </p>
        {yms.length === 0 ? (
          <div className="mx-auto my-[60px] text-center text-muted-foreground">
            <div className="mb-2.5 text-[32px]">📭</div>
            <p className="m-0 text-[13px]">먼저 거래를 업로드·분류해주세요.</p>
          </div>
        ) : (
          <SankeyFlow periods={periods} data={data} initialKey={initialKey} />
        )}
      </div>
    </div>
  );
}
