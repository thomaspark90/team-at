import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { buildPnl, benchmark, prevYm, type PnlCat, type PnlTx, type PnlPosRow, type PnlInventory, type Signal } from '@/lib/finance/pnl';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import PnlUpload from '@/components/finance/PnlUpload';
import InventoryInput from '@/components/finance/InventoryInput';

const won = (n: number) => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString('ko-KR');
const pct = (n: number) => (n * 100).toFixed(1) + '%';
const fmtYm = (ym: string) => `${ym.split('-')[0]}년 ${Number(ym.split('-')[1])}월`;

const SIG: Record<Signal, { cls: string; label: string }> = {
  good: { cls: 'text-positive', label: '양호' },
  warn: { cls: 'text-amber-600 dark:text-amber-500', label: '주의' },
  bad: { cls: 'text-destructive', label: '높음' },
};

export default async function PnlPage({ searchParams }: { searchParams: { ym?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const role = await resolveRole(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const { data: posRaw } = await supabase
    .schema('finance')
    .from('pos_sales')
    .select('ym,category,qty,gross,vat,supply');
  const pos = (posRaw as PnlPosRow[] | null) ?? [];
  const yms = Array.from(new Set(pos.map((p) => p.ym))).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">관리손익</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무 홈
          </Link>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          POS 매출(발생주의·공급가액)에 매입기준 재료비·인건비를 맞춰 본 손익이에요. 통장 입출금 기준은 <Link href="/finance/cashflow" className="underline">월별 요약</Link>·<Link href="/finance/flow" className="underline">자금 흐름</Link>에서 봐요.
        </p>

        {yms.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="text-[32px]">🧾</div>
            <p className="m-0 text-[13px] text-muted-foreground">먼저 토스 POS 매출리포트를 올려주세요.</p>
            <PnlUpload />
          </div>
        ) : (
          <PnlBody
            pos={pos}
            yms={yms}
            selectedYm={searchParams.ym && yms.includes(searchParams.ym) ? searchParams.ym : yms[0]}
            supabase={supabase}
          />
        )}
      </div>
    </div>
  );
}

// 선택 월의 손익을 서버에서 계산해 렌더.
async function PnlBody({
  pos,
  yms,
  selectedYm,
  supabase,
}: {
  pos: PnlPosRow[];
  yms: string[];
  selectedYm: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [{ data: txnsRaw }, { data: catsRaw }, { data: invRaw }] = await Promise.all([
    supabase.schema('finance').from('transactions').select('category_id,amount_in,amount_out').eq('ym', selectedYm),
    supabase.schema('finance').from('categories').select('id,type,name,parent_id,vat_taxable'),
    supabase.schema('finance').from('inventory').select('ym,kind,amount'),
  ]);
  const txns = (txnsRaw as PnlTx[] | null) ?? [];
  const cats = (catsRaw as PnlCat[] | null) ?? [];
  const inventory = (invRaw as PnlInventory[] | null) ?? [];

  const p = buildPnl(selectedYm, { pos, txns, cats, inventory });
  const foodSig = SIG[benchmark('food', p.metrics.foodCostRate)];
  const laborSig = SIG[benchmark('labor', p.metrics.laborRate)];
  const primeSig = SIG[benchmark('prime', p.metrics.primeCost)];

  return (
    <>
      {/* 월 선택 + 업로드 */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {yms.map((ym) => (
            <Link
              key={ym}
              href={`/finance/pnl?ym=${ym}`}
              aria-current={ym === selectedYm ? 'page' : undefined}
              className={`rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                ym === selectedYm
                  ? 'border-foreground font-semibold text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {fmtYm(ym)}
            </Link>
          ))}
        </div>
        <PnlUpload />
      </div>

      {/* 지표 카드 */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="식자재 원가율" value={pct(p.metrics.foodCostRate)} sub={`전체 재료율 ${pct(p.metrics.materialRate)}`} sig={foodSig} uncertain={p.unclassified > 0} />
        <Metric label="인건비율" value={pct(p.metrics.laborRate)} sub="매출 대비" sig={laborSig} uncertain={p.unclassified > 0} />
        <Metric label="Prime Cost" value={pct(p.metrics.primeCost)} sub="식자재+인건비" sig={primeSig} uncertain={p.unclassified > 0} />
        <Metric label="매출총이익률" value={pct(p.metrics.grossMargin)} sub={won(p.grossProfit)} />
      </div>

      {p.unclassified > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
          <span className="text-foreground">
            ⚠️ 이 달 <b>미분류 지출 {won(p.unclassified)}</b>이 손익에 잡혀 있어요. 분류하면 지표가 정확해져요.
          </span>
          <Link href={`/finance/classify?ym=${selectedYm}&unclassified=1`} className="whitespace-nowrap underline">
            미분류 분류하러 →
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* 손익계산서 */}
        <div className="ta-card">
          <h2 className="mb-4 text-[15px] font-semibold text-foreground">손익계산서 · {fmtYm(selectedYm)}</h2>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              <Row label="총매출 (VAT 포함)" amount={p.sales.gross} muted />
              <Row label="(−) 부가세" amount={-p.sales.vat} muted />
              <Row label="공급가액 매출 (순매출)" amount={p.sales.supply} bold />
              <Row
                label="(−) 재료비"
                amount={-p.cogs.total}
                sub={p.cogs.invMissing ? '기말재고 일부 미입력 → 매입액 기준' : undefined}
              />
              <SubRow label="식자재" k={p.cogs.식자재} />
              <SubRow label="포장소모품" k={p.cogs.포장소모품} />
              <Row label="매출총이익" amount={p.grossProfit} bold rate={p.metrics.grossMargin} />
              <Row label="(−) 인건비" amount={-p.labor} rate={p.metrics.laborRate} />
              <Row label="(−) 고정비 (판관비)" amount={-p.fixed} />
              {p.unclassified > 0 && <Row label="(−) 미분류" amount={-p.unclassified} warn />}
              <Row label="영업이익 (EBIT 근사)" amount={p.operatingProfit} bold big sub="채널수수료·감가상각 전" />
            </tbody>
          </table>
          <p className="mt-4 text-[11px] text-muted-foreground">
            채널수수료(카드·배달)는 아직 미반영이에요(후속). 영업외·자본적지출 등 손익제외 계정은 빠져 있어요.
          </p>
        </div>

        {/* 우측: 기말재고 + 매출 구성 */}
        <div className="flex flex-col gap-5">
          <InventoryInput
            ym={selectedYm}
            initial={{
              식자재: p.cogs.식자재.기말입력 ? p.cogs.식자재.기말 : null,
              포장소모품: p.cogs.포장소모품.기말입력 ? p.cogs.포장소모품.기말 : null,
            }}
            prevMonth={{
              식자재: inventory.find((i) => i.ym === prevYm(selectedYm) && i.kind === '식자재')?.amount ?? null,
              포장소모품: inventory.find((i) => i.ym === prevYm(selectedYm) && i.kind === '포장소모품')?.amount ?? null,
            }}
          />
          <div className="ta-card">
            <h2 className="mb-3 text-[15px] font-semibold text-foreground">매출 구성</h2>
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {p.sales.byCategory.map((c) => (
                  <tr key={c.category} className="border-t border-border first:border-t-0">
                    <td className="py-1.5 text-foreground">{c.category}</td>
                    <td className="py-1.5 text-right tabular text-muted-foreground">{p.sales.supply > 0 ? pct(c.supply / p.sales.supply) : '—'}</td>
                    <td className="py-1.5 text-right tabular text-foreground">{won(c.supply)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  sub,
  sig,
  uncertain,
}: {
  label: string;
  value: string;
  sub?: string;
  sig?: { cls: string; label: string };
  uncertain?: boolean;
}) {
  // 미분류가 크면 지표(재료율·인건비율…)가 실제보다 좋게 보이는 착시 → 확신 신호(양호) 대신 '잠정'으로 낮춤
  const showSig = sig && !uncertain;
  return (
    <div className="ta-card p-4">
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tabular ${showSig ? sig.cls : 'text-foreground'}`}>{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {showSig && <span className={sig.cls}>● {sig.label}</span>}
        {uncertain && <span className="text-amber-600 dark:text-amber-500">● 미분류 있어 잠정</span>}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function Row({
  label,
  amount,
  bold,
  big,
  muted,
  warn,
  rate,
  sub,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  big?: boolean;
  muted?: boolean;
  warn?: boolean;
  rate?: number;
  sub?: string;
}) {
  return (
    <tr className={bold ? 'border-t-2 border-border' : 'border-t border-border'}>
      <td className={`py-2 ${big ? 'text-[15px]' : ''} ${bold ? 'font-semibold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {label}
        {sub && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{sub}</span>}
      </td>
      <td className="py-2 text-right text-[11px] tabular text-muted-foreground">{rate != null ? pct(rate) : ''}</td>
      <td className={`py-2 text-right tabular ${big ? 'text-[15px]' : ''} ${bold ? 'font-semibold text-foreground' : warn ? 'text-amber-600 dark:text-amber-500' : 'text-foreground'}`}>
        {won(amount)}
      </td>
    </tr>
  );
}

function SubRow({ label, k }: { label: string; k: { 기초: number; 매입: number; 기말: number; 재료비: number; 기말입력: boolean } }) {
  return (
    <tr className="border-t border-border/50">
      <td className="py-1.5 pl-4 text-[13px] text-muted-foreground">
        {label}
        <span className="ml-2 text-[11px]">
          {k.기말입력 ? `기초 ${won(k.기초)} + 매입 ${won(k.매입)} − 기말 ${won(k.기말)}` : `매입 ${won(k.매입)} (기말 미입력)`}
        </span>
      </td>
      <td />
      <td className="py-1.5 text-right text-[13px] tabular text-muted-foreground">{won(k.재료비)}</td>
    </tr>
  );
}
