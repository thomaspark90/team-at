import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import type { AggTx, AggCat } from '@/lib/finance/aggregate';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import dynamic from 'next/dynamic';

// recharts 포함 차트 번들은 별도 청크로 지연 로드 — 페이지 뼈대가 먼저 그려진다
const Dashboard = dynamic(() => import('@/components/finance/Dashboard'), {
  loading: () => <p className="px-6 py-8 text-[13px] text-muted-foreground">차트 불러오는 중…</p>,
});

// 지표 — 매출·이익·비율 추이 차트 (구 재무 대시보드). 대시보드는 업무 보드로 개편.
export default async function MetricsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (!role) redirect('/finance'); // 멤버(admin/classifier/viewer)만 — viewer는 이름 없는 안전 뷰로

  // dashboard_tx = memo(이름) 없는 멤버 전용 뷰. viewer도 읽을 수 있어 지표 화면이 열림.
  // brand 컬럼은 migration_brand.sql 의 뷰 재정의로 노출됨.
  // store 컬럼은 migration_accounting_split.sql 뷰 재정의로 노출 — 마이그레이션 전이면 store 없이 폴백
  let txRows = await supabase.schema('finance').from('dashboard_tx').select('tx_at,amount_in,amount_out,category_id,brand,store');
  if (txRows.error) {
    txRows = await supabase.schema('finance').from('dashboard_tx').select('tx_at,amount_in,amount_out,category_id,brand');
  }
  const txns = unwrap(txRows, '지표 거래');
  const cats = unwrap(
    await supabase.schema('finance').from('categories').select('id,type,name,parent_id,vat_taxable'),
    '계정과목',
  );
  // 매출 = POS 공급가액(발생주의). viewer도 볼 수 있는 memo-free 뷰(dashboard_pos)에서 조회.
  // 뷰가 아직 없으면(마이그레이션 전) pos_sales로 폴백 — admin/classifier는 즉시 동작.
  let posRows = await supabase.schema('finance').from('dashboard_pos').select('sale_date,supply,brand,store');
  if (posRows.error) posRows = await supabase.schema('finance').from('dashboard_pos').select('sale_date,supply,brand');
  if (posRows.error) posRows = await supabase.schema('finance').from('pos_sales').select('sale_date,supply,brand');
  const posSales = ((posRows.data as { sale_date: string; supply: number; brand?: string | null; store?: string | null }[] | null) ?? []).map((p) => ({ saleDate: p.sale_date, supply: p.supply, brand: p.brand, store: p.store ?? null }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">지표</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 업로드로
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          <b>매출은 POS(발생주의)</b>, 지출은 통장·카드 기준이에요. 통장 현금흐름·잔액은 <Link href="/finance/cashflow" className="underline">월별 요약</Link>·<Link href="/finance/flow" className="underline">자금 흐름</Link>에서 봐요.
        </p>
        <Dashboard txns={(txns as AggTx[]) ?? []} cats={(cats as AggCat[]) ?? []} posSales={posSales} />
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '지표' };
