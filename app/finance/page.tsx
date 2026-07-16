import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import { buildSankey, type SankTx, type SankCat } from '@/lib/finance/sankey';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import UploadPanel from '@/components/finance/UploadPanel';
import CardReconcile from '@/components/finance/CardReconcile';
import ReceiptEnrich from '@/components/finance/ReceiptEnrich';
import RequestAccessButton from '@/components/finance/RequestAccessButton';

interface OverviewData {
  latest: string;
  totalRevenue: number;
  totalExpense: number;
  surplus: number;
  unclassifiedTotal: number;
  unclassifiedLatest: number;
  latestConfirmed: boolean;
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const GREEN = 'hsl(var(--number-colored))';
const fmtYm = (ym: string) => {
  const [y, mo] = ym.split('-');
  return `${y}년 ${Number(mo)}월`;
};

export default async function FinancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await resolveRole(supabase, user);
  if (role === 'viewer') redirect('/finance/dashboard'); // 팀원은 대시보드가 홈
  const isStaff = ['admin', 'classifier'].includes(role ?? '');

  // 현황 계산(스태프만)
  let overview: OverviewData | null = null;
  if (isStaff) {
    const txnsRaw = unwrap(await supabase.schema('finance').from('transactions').select('ym,category_id,amount_in,amount_out'), '거래');
    const catsRaw = unwrap(await supabase.schema('finance').from('categories').select('id,type,name,parent_id'), '계정과목');
    const closesRaw = unwrap(await supabase.schema('finance').from('monthly_close').select('ym,status'), '월 확정');
    const txns = (txnsRaw as SankTx[] | null) ?? [];
    const cats = (catsRaw as SankCat[] | null) ?? [];
    const closes = (closesRaw as { ym: string; status: string }[] | null) ?? [];
    const yms = Array.from(new Set(txns.map((t) => t.ym))).sort((a, b) => b.localeCompare(a));
    const latest = yms[0] ?? '';
    const s = buildSankey(
      txns.filter((t) => t.ym === latest),
      cats
    );
    overview = {
      latest,
      totalRevenue: s.totalRevenue,
      totalExpense: s.totalExpense,
      surplus: s.totalRevenue - s.totalExpense,
      unclassifiedTotal: txns.filter((t) => t.category_id == null).length,
      unclassifiedLatest: txns.filter((t) => t.ym === latest && t.category_id == null).length,
      latestConfirmed: closes.some((c) => c.ym === latest && c.status === 'confirmed'),
    };
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        {isStaff && overview ? (
          <div className="flex flex-col gap-8">
            <Overview o={overview} />
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="m-0 text-[15px] text-foreground">자료 입력</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  은행 거래내역(PDF)·신한카드·쿠팡 자료를 여기서 올려요. 올린 뒤{' '}
                  <Link href="/finance/classify" className="underline">거래 분류</Link>에서 계정을 지정해요.
                </p>
              </div>
              {/* 1) 은행 거래내역 */}
              <UploadPanel />
              {/* 2) 신한카드 이용내역(통장 카드결제와 정산) */}
              <CardReconcile />
              {/* 3) 쿠팡 영수증(품목 분해) */}
              <ReceiptEnrich />
            </section>
          </div>
        ) : (
          <NoAccess email={user.email ?? ''} />
        )}
      </div>
    </div>
  );
}

function Overview({ o }: { o: OverviewData }) {
  const hasData = o.latest !== '';
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="m-0 text-[22px] tracking-[-0.5px]">회계 현황</h1>
        {hasData && <span className="text-[13px] text-muted-foreground">{fmtYm(o.latest)} 기준</span>}
      </div>

      {hasData ? (
        <>
          {/* 요약 카드 */}
          <div className="flex flex-wrap gap-3">
            <SummaryCard label="총 유입" value={won(o.totalRevenue)} color={GREEN} />
            <SummaryCard label="총 유출" value={won(o.totalExpense)} color="hsl(var(--foreground))" />
            <SummaryCard label="순증감 (현금)" value={won(o.surplus)} color={o.surplus >= 0 ? GREEN : 'hsl(var(--destructive))'} />
          </div>
          <p className="-mt-1 text-[11px] text-muted-foreground">
            통장 입출금 기준(현금)이에요. 발생주의 영업이익·원가율은 <Link href="/finance/pnl" className="underline">관리손익</Link>에서 봐요.
          </p>

          {/* 해야 할 일 */}
          <div className="ta-card flex flex-col gap-3">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">해야 할 일</div>
            <TodoRow
              done={o.unclassifiedTotal === 0}
              text={o.unclassifiedTotal === 0 ? '미분류 없음 — 모두 분류됐어요' : `미분류 ${o.unclassifiedTotal}건`}
              href="/finance/classify?unclassified=1"
              cta={o.unclassifiedTotal === 0 ? '거래 분류' : '분류하러 가기'}
            />
            <TodoRow
              done={o.latestConfirmed}
              text={
                o.latestConfirmed
                  ? `${fmtYm(o.latest)} 확정됨`
                  : o.unclassifiedLatest === 0
                  ? `${fmtYm(o.latest)} 확정 가능 (미분류 0)`
                  : `${fmtYm(o.latest)} 확정하려면 미분류 ${o.unclassifiedLatest}건 처리 필요`
              }
              href={o.unclassifiedLatest === 0 ? '/finance/close' : `/finance/classify?ym=${o.latest}&unclassified=1`}
              cta={o.latestConfirmed ? '월 확정' : o.unclassifiedLatest === 0 ? '확정하러 가기' : '분류하러 가기'}
            />
          </div>

          {/* 빠른 이동 */}
          <div className="flex flex-wrap gap-2">
            {[
              { href: '/finance/classify', label: '거래 분류' },
              { href: '/finance/flow', label: '자금 흐름' },
              { href: '/finance/dashboard', label: '대시보드' },
              { href: '/finance/cashflow', label: '월별 요약' },
              { href: '/finance/uploads', label: '자료 이력' },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="ta-btn h-8 px-3 text-[13px]">
                {l.label}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="ta-card text-[13px] text-muted-foreground">
          아직 거래가 없어요. 아래에서 은행 거래내역을 올리면 여기 현황이 채워져요.
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="ta-card min-w-[160px] flex-[1_1_auto] p-[16px_18px]">
      <div className="mb-1.5 text-[11px] uppercase tracking-[0.04em] text-muted-foreground">{label}</div>
      <div className="tabular text-[22px]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function TodoRow({ done, text, href, cta }: { done: boolean; text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="flex items-center gap-2 text-[13px]">
        <span className={done ? 'text-positive' : 'text-muted-foreground'}>{done ? '✓' : '•'}</span>
        <span className={done ? 'text-muted-foreground' : 'text-foreground'}>{text}</span>
      </span>
      <Link href={href} className="ta-btn h-8 px-3 text-[13px]">
        {cta} →
      </Link>
    </div>
  );
}

function NoAccess({ email }: { email: string }) {
  return (
    <div className="ta-card mx-auto mt-[60px] max-w-[480px] text-center">
      <div className="mb-3 text-[32px]">🔒</div>
      <h2 className="mb-2 mt-0 text-[15px]">회계·재무 접근 권한이 없어요</h2>
      <p className="m-0 text-[13px] leading-[1.6] text-muted-foreground">
        회계·재무 데이터는 관리자 승인이 필요해요.
        <br />
        아래 계정으로 <b>대표에게 권한을 요청</b>하세요.
      </p>
      <div className="mt-4 break-all rounded-md bg-muted px-3.5 py-2.5 font-mono text-[13px] text-foreground">
        {email}
      </div>
      <RequestAccessButton />
    </div>
  );
}
