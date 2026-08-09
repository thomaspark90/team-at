import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import type { AggTx, AggCat } from '@/lib/finance/aggregate';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import MonthShell from '@/components/finance/MonthShell';
import dynamic from 'next/dynamic';

// recharts 포함 차트 번들은 별도 청크로 지연 로드 — 페이지 뼈대가 먼저 그려진다
const Dashboard = dynamic(() => import('@/components/finance/Dashboard'), {
  loading: () => <p className="px-6 py-8 text-[13px] text-muted-foreground">차트 불러오는 중…</p>,
});

// 지표 — 매출·이익·비율 추이 차트 (구 재무 대시보드). 대시보드는 업무 보드로 개편.
export default async function MetricsPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const role = await resolveRoleStamped(supabase, user);
  if (!role) redirect('/finance'); // 멤버(admin/classifier/viewer)만 — viewer는 이름 없는 안전 뷰로

  // ⚠️ 전량 조회(페이지네이션) — limit 없이 한 번만 select 하면 PostgREST 응답이 프로젝트
  // Max Rows(Settings→API, 2026-08-09 기준 20000)에서 잘린다. POS 일별 행이 그 이상이면
  // 가장 최근 달이 통째로 잘려 매출 0으로 보였다(2026-08-04 버그). PAGE는 항상 그 설정값
  // 이하로 유지할 것 — 실측 결과 페이지당 요청이 1~2초라 PAGE를 낮게 잡을수록(예전 1000)
  // 왕복이 늘어 느려진다(2026-08-09, 지표 페이지 26초 로딩 원인).
  // 뷰엔 고유 id가 없어 선택 컬럼 전부로 정렬 → 페이지 경계의 동일 튜플은 서로 교환 가능(누락·중복 없음).
  const fetchAll = async (table: string, cols: string, order: string[]) => {
    const PAGE = 20000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase.schema('finance').from(table).select(cols);
      for (const c of order) q = q.order(c, { ascending: true, nullsFirst: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) return { data: out, error };
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return { data: out, error: null as null };
  };

  // dashboard_tx = memo(이름) 없는 멤버 전용 뷰(viewer도 읽음). store 컬럼은 마이그레이션 전이면 없어 폴백.
  const loadTxns = async () => {
    const txOrder = ['tx_at', 'category_id', 'brand', 'store', 'amount_in', 'amount_out'];
    let txRows = await fetchAll('dashboard_tx', 'tx_at,amount_in,amount_out,category_id,brand,store', txOrder);
    if (txRows.error) {
      txRows = await fetchAll('dashboard_tx', 'tx_at,amount_in,amount_out,category_id,brand', ['tx_at', 'category_id', 'brand', 'amount_in', 'amount_out']);
    }
    return unwrap(txRows, '지표 거래');
  };

  const loadCats = async () =>
    unwrap(
      await supabase.schema('finance').from('categories').select('id,type,name,parent_id,vat_taxable'),
      '계정과목',
    );

  // 매출 = POS 공급가액(발생주의). memo-free 뷰(dashboard_pos), 없으면 pos_sales로 폴백.
  const loadPosSales = async () => {
    let posRows = await fetchAll('dashboard_pos', 'sale_date,supply,brand,store', ['sale_date', 'brand', 'store', 'supply']);
    if (posRows.error) posRows = await fetchAll('dashboard_pos', 'sale_date,supply,brand', ['sale_date', 'brand', 'supply']);
    if (posRows.error) posRows = await fetchAll('pos_sales', 'sale_date,supply,brand', ['sale_date', 'brand', 'supply']);
    return ((posRows.data as { sale_date: string; supply: number; brand?: string | null; store?: string | null }[] | null) ?? []).map((p) => ({ saleDate: p.sale_date, supply: p.supply, brand: p.brand, store: p.store ?? null }));
  };

  // 통장 입출금·월말 잔액 월별 집계 — 지표 첫 차트용(2026-08-04 대표 지시).
  // dashboard_tx(안전 뷰)에는 은행·잔액이 없어 원본 transactions에서 별도 집계.
  // admin/classifier만(viewer는 RLS로 원본이 안 보여 차트 생략). 분할 자식 행 제외(이중계상 방지).
  type BankCashRow = { ym: string; brand: string; bank: string; inflow: number; outflow: number; balance: number };
  const loadBankCash = async (): Promise<BankCashRow[]> => {
    const bankCash: BankCashRow[] = [];
    if (!['admin', 'classifier'].includes(role)) return bankCash;
    const PAGE = 20000; // ⚠️ 프로젝트 Max Rows(Settings→API) 이하로 유지 — 위 fetchAll 주석 참고
    const raw: { ym: string; bank: string; brand: string | null; tx_at: string; amount_in: number; amount_out: number; balance: number }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .schema('finance')
        .from('transactions')
        .select('ym,bank,brand,tx_at,amount_in,amount_out,balance')
        .eq('source', 'bank')
        .is('split_parent_id', null)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) break;
      raw.push(...((data ?? []) as typeof raw));
      if (!data || data.length < PAGE) break;
    }
    // (브랜드,은행)별 월 집계 + 월말 잔액(그 달 마지막 거래), 거래 없는 달은 잔액 이월
    const agg = new Map<string, Map<string, { inflow: number; outflow: number; lastAt: string; balance: number }>>();
    for (const t of raw) {
      const k = `${t.brand ?? 'garden'}|${t.bank}`;
      if (!agg.has(k)) agg.set(k, new Map());
      const mm = agg.get(k)!;
      const ym = String(t.ym);
      const a = mm.get(ym) ?? { inflow: 0, outflow: 0, lastAt: '', balance: 0 };
      a.inflow += Number(t.amount_in) || 0;
      a.outflow += Number(t.amount_out) || 0;
      // 잔액 0 = 미기재(엑셀 일부) — 월말 잔액 후보에서 제외
      if (Number(t.balance) !== 0 && String(t.tx_at) >= a.lastAt) {
        a.lastAt = String(t.tx_at);
        a.balance = Number(t.balance);
      }
      mm.set(ym, a);
    }
    const allYms = Array.from(new Set(raw.map((t) => String(t.ym)))).sort();
    for (const [k, mm] of Array.from(agg.entries())) {
      const [bBrand, bank] = k.split('|');
      let carry = 0;
      for (const ym of allYms) {
        const a = mm.get(ym);
        if (a) {
          if (a.balance !== 0) carry = a.balance;
          bankCash.push({ ym, brand: bBrand, bank, inflow: a.inflow, outflow: a.outflow, balance: carry });
        } else {
          bankCash.push({ ym, brand: bBrand, bank, inflow: 0, outflow: 0, balance: carry });
        }
      }
    }
    return bankCash;
  };

  // 4개 테이블이 서로 독립적이라 병렬로 조회 — 예전엔 순차 await라 지표 페이지 로딩이 밀렸다.
  const [txns, cats, posSales, bankCash] = await Promise.all([loadTxns(), loadCats(), loadPosSales(), loadBankCash()]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">지표</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 업로드로
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          <b>매출은 POS(발생주의)</b>, 지출은 통장·카드 기준이에요. 통장 현금흐름·잔액은 <Link href="/finance/cashflow" className="underline">월별 요약</Link>·<Link href="/finance/flow" className="underline">자금 흐름</Link>에서 봐요.
        </p>
        {/* 좌측 연·월 사이드바 — 회계 자료 화면과 동일한 셸. 지표는 모든 데이터가 이미 클라이언트에 있어
            서버 재조회가 필요 없다 → navigate=false(얕은 갱신). 배지 없음(initialTodos={{}}). */}
        <MonthShell navigate={false} initialTodos={{}}>
          <Dashboard txns={(txns as AggTx[]) ?? []} cats={(cats as AggCat[]) ?? []} posSales={posSales} bankCash={bankCash} />
        </MonthShell>
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '지표' };
