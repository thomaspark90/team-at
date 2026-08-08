import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveMember } from '@/lib/finance/access';
import { unwrap } from '@/lib/finance/db';
import { buildSankey, type SankTx, type SankCat } from '@/lib/finance/sankey';
import TabNav from '@/components/TabNav';
import AccountingNav from '@/components/AccountingNav';
import NaverpayConfig from '@/components/finance/NaverpayConfig';
import RequestAccessButton from '@/components/finance/RequestAccessButton';
import BrandSegments, { parseBrandSeg, type BrandSeg } from '@/components/finance/BrandSegments';

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

export default async function FinancePage({ searchParams }: { searchParams: { brand?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { role, brandScope } = await resolveMember(supabase, user);
  // 브랜드 스코프 멤버는 분류 화면이 홈
  if (brandScope) redirect('/finance/classify');
  if (role === 'viewer') redirect('/finance/metrics'); // 팀원은 지표가 홈
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  const seg: BrandSeg = parseBrandSeg(searchParams.brand);

  // 현황 계산(스태프만) — 브랜드 세그먼트 적용('전체'는 합산)
  let overview: OverviewData | null = null;
  if (isStaff) {
    let txQ = supabase.schema('finance').from('transactions').select('ym,category_id,amount_in,amount_out,brand');
    if (seg !== 'all') txQ = txQ.eq('brand', seg);
    const txnsRaw = unwrap(await txQ, '거래');
    const catsRaw = unwrap(await supabase.schema('finance').from('categories').select('id,type,name,parent_id'), '계정과목');
    const closesRaw = unwrap(await supabase.schema('finance').from('monthly_close').select('ym,status,brand,store'), '월 확정');
    const txns = (txnsRaw as (SankTx & { brand?: string })[] | null) ?? [];
    const cats = (catsRaw as SankCat[] | null) ?? [];
    const closes = (closesRaw as { ym: string; status: string; brand?: string; store?: string | null }[] | null) ?? [];
    const yms = Array.from(new Set(txns.map((t) => t.ym))).sort((a, b) => b.localeCompare(a));
    const latest = yms[0] ?? '';
    const s = buildSankey(
      txns.filter((t) => t.ym === latest),
      cats
    );
    // 확정은 3단위(ym, brand, store) — 브랜드가 '확정'이려면 가든은 양재천·판교 둘 다, 스탭밀은 자기 단위
    const confirmedUnits = new Set(
      closes
        .filter((c) => c.ym === latest && c.status === 'confirmed')
        .map((c) => `${c.brand ?? 'garden'}|${c.store || ''}`),
    );
    const brandConfirmed = (b: string) =>
      b === 'garden'
        ? confirmedUnits.has('garden|yangjae') && confirmedUnits.has('garden|pangyo')
        : confirmedUnits.has(`${b}|`);
    const latestBrands = Array.from(new Set(txns.filter((t) => t.ym === latest).map((t) => t.brand ?? 'garden')));
    const latestConfirmed =
      seg === 'all'
        ? latestBrands.length > 0 && latestBrands.every((b) => brandConfirmed(b))
        : brandConfirmed(seg);
    overview = {
      latest,
      totalRevenue: s.totalRevenue,
      totalExpense: s.totalExpense,
      surplus: s.totalRevenue - s.totalExpense,
      unclassifiedTotal: txns.filter((t) => t.category_id == null).length,
      unclassifiedLatest: txns.filter((t) => t.ym === latest && t.category_id == null).length,
      latestConfirmed,
    };
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <AccountingNav role={role} />
      <div className="mx-auto max-w-[1120px] px-6 py-8">
        {isStaff && overview ? (
          <div className="flex flex-col gap-8">
            <BrandSegments basePath="/finance" seg={seg} />
            <Overview o={overview} />
            <section className="flex flex-col gap-8">
              <div>
                <h2 className="m-0 text-[15px] text-foreground">자료 입력</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  회계가 브랜드별로 분리돼 있어요. <b>브랜드 페이지에서 올려야</b> 그 브랜드 회계로 정확히 들어가요.
                  올린 뒤 <Link href="/finance/classify" className="underline">지출 자료 분류</Link>에서 계정을 지정해요.
                </p>
              </div>
              {/* 단위별 업로드 페이지 진입 — 스탭밀 / 가든 양재천점 / 가든 판교점 */}
              <div className="grid gap-x-3 gap-y-6 sm:grid-cols-3">
                <Link
                  href="/finance/upload/staffmeal"
                  className="ta-card flex flex-col gap-1 p-5 transition-colors hover:border-foreground/40"
                >
                  <span className="text-[15px] font-medium">스탭밀 →</span>
                  <span className="text-[13px] text-muted-foreground">통장 PDF · 신한카드 · POS(페이히어)</span>
                </Link>
                <Link
                  href="/finance/upload/yangjae"
                  className="ta-card flex flex-col gap-1 p-5 transition-colors hover:border-foreground/40"
                >
                  <span className="text-[15px] font-medium">가든서비스 양재천점 →</span>
                  <span className="text-[13px] text-muted-foreground">POS(토스) · 가든 공용 통장·카드</span>
                </Link>
                <Link
                  href="/finance/upload/pangyo"
                  className="ta-card flex flex-col gap-1 p-5 transition-colors hover:border-foreground/40"
                >
                  <span className="text-[15px] font-medium">가든서비스 판교점 →</span>
                  <span className="text-[13px] text-muted-foreground">POS(페이히어) · 가든 공용 통장·카드</span>
                </Link>
              </div>
              {/* 네이버페이 자동 수집 설정 — 배송지로 브랜드를 자동 판정하는 공용 설정 */}
              <NaverpayConfig />
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
    <section className="flex flex-col gap-8">
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
          <p className="-mt-5 text-[11px] text-muted-foreground">
            통장 입출금 기준(현금)이에요. 발생주의 영업이익·원가율은 <Link href="/finance/pnl" className="underline">관리손익</Link>에서 봐요.
          </p>

          {/* 해야 할 일 */}
          <div className="flex flex-col gap-6">
            <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">해야 할 일</div>
            <TodoRow
              done={o.unclassifiedTotal === 0}
              text={o.unclassifiedTotal === 0 ? '미분류 없음 — 모두 분류됐어요' : `미분류 ${o.unclassifiedTotal}건`}
              href="/finance/classify?unclassified=1"
              cta={o.unclassifiedTotal === 0 ? '지출 자료 분류' : '분류하러 가기'}
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
              { href: '/finance/classify', label: '지출 자료 분류' },
              { href: '/finance/flow', label: '자금 흐름' },
              { href: '/finance/dashboard', label: '대시보드' },
              { href: '/finance/metrics', label: '지표' },
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
        <div className="rounded-md bg-muted/40 p-6 text-[13px] text-muted-foreground">
          아직 거래가 없어요. 아래에서 은행 거래내역을 올리면 여기 현황이 채워져요.
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-[160px] flex-[1_1_auto] rounded-md bg-muted/40 p-[16px_18px]">
      <div className="mb-1.5 text-[11px] uppercase tracking-[0.04em] text-muted-foreground">{label}</div>
      <div className="tabular text-[22px]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function TodoRow({ done, text, href, cta }: { done: boolean; text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-6 first:border-t-0 first:pt-0">
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
    <div className="mx-auto mt-[60px] max-w-[480px] text-center">
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
