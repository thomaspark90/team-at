import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { benchmark, prevYm, CHANNEL_FEE_RATE, type Signal } from '@/lib/finance/pnl';
import { loadPnlPos, computePnlMonth, type BrandSeg, type PnlPosRowS } from '@/lib/finance/pnlMonth';
import { UNITS, unitOf, storeLabel, type Store } from '@/lib/finance/types';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import MonthShell from '@/components/finance/MonthShell';
import { computeBoardTodos } from '@/lib/finance/boardTodos';
import PnlUpload from '@/components/finance/PnlUpload';
import InventoryInput from '@/components/finance/InventoryInput';
import ChannelFeeInput from '@/components/finance/ChannelFeeInput';

const won = (n: number) => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString('ko-KR');
const pct = (n: number) => (n * 100).toFixed(1) + '%';
const fmtYm = (ym: string) => `${ym.split('-')[0]}년 ${Number(ym.split('-')[1])}월`;

const SIG: Record<Signal, { cls: string; label: string }> = {
  good: { cls: 'text-positive', label: '양호' },
  warn: { cls: 'text-amber-600 dark:text-amber-500', label: '주의' },
  bad: { cls: 'text-destructive', label: '높음' },
};

// 브랜드 세그먼트(BrandSeg) — 상단 매장 필(FinanceNav)이 정하는 단위. 개인(personal)은 손익 제외라 없다.
const unitLabelFor = (seg: BrandSeg, store: Store | null) =>
  UNITS.find((u) => u.brand === seg && u.store === store)?.label ?? seg;

export default async function PnlPage({
  searchParams,
}: {
  searchParams: { ym?: string; unit?: string };
}) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');
  const role = await resolveRoleStamped(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const unit = unitOf(searchParams.unit) ?? UNITS[0];
  const seg = unit.brand as BrandSeg;
  // 지점 필터 — 가든에서만 의미(판교=페이히어, 양재천=토스). 지점 손익은 재고·수수료 안분 근사치.
  const store: Store | null = unit.store;

  // POS 매출(자가 식권 합류·브랜드 필터는 lib/finance/pnlMonth)과 사이드바 배지가 서로 독립적이라 병렬로
  const [pos, initialTodos] = await Promise.all([
    loadPnlPos(supabase, seg),
    // 좌측 연·월 사이드바 배지 — 선택 매장 몫
    computeBoardTodos(supabase, seg, store ?? undefined).catch(() => undefined),
  ]);
  const yms = Array.from(new Set(pos.map((p) => p.ym))).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">관리손익</h1>
          <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            ← 재무 홈
          </Link>
        </div>
        <p className="mb-10 text-[13px] text-muted-foreground">
          POS 매출(발생주의·공급가액)에 매입기준 재료비·인건비를 맞춰 본 손익이에요. 통장 입출금 기준은 <Link href="/finance/cashflow" className="underline">월별 요약</Link>·<Link href="/finance/flow" className="underline">자금 흐름</Link>에서 봐요.
        </p>

        {/* 좌측 연·월 사이드바 — 달 선택 시 ?ym= 내비게이션으로 서버가 그 달 손익을 다시 계산(2026-08-03) */}
        <MonthShell brand={seg} initialTodos={initialTodos} navigate>
        {store && (
          <p className="mb-10 text-[11px] text-muted-foreground">
            지점 손익은 근사치예요 — 기말재고·채널수수료는 지점 매출비율로 안분해요.
          </p>
        )}

        {yms.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="text-[32px]">🧾</div>
            <p className="m-0 text-[13px] text-muted-foreground">
              먼저 {unitLabelFor(seg, store)} POS 매출리포트를 올려주세요.
            </p>
            <PnlUpload />
          </div>
        ) : (
          <PnlBody
            pos={pos}
            yms={yms}
            selectedYm={
              // 사이드바로 POS 없는 달도 볼 수 있게 형식만 검증 — 그 달은 매출 0 + 지출만 표시
              searchParams.ym && /^\d{4}-\d{2}$/.test(searchParams.ym) ? searchParams.ym : yms[0]
            }
            seg={seg}
            store={store}
            supabase={supabase}
          />
        )}
        </MonthShell>
      </div>
    </div>
  );
}

// 선택 월의 손익을 서버에서 계산해 렌더.
async function PnlBody({
  pos,
  yms,
  selectedYm,
  seg,
  store,
  supabase,
}: {
  pos: PnlPosRowS[];
  yms: string[];
  selectedYm: string;
  seg: BrandSeg;
  store: Store | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  // 이 달 손익 계산 — lib/finance/pnlMonth 로 추출(2026-08-21). 월 결산 페이지의
  // 손익 드릴다운(/api/finance/pnl-month)과 같은 코드라 두 화면 숫자가 항상 일치한다.
  const unitId = seg === 'staffmeal' ? 'staffmeal' : (store ?? 'yangjae');
  const { p, channelFee, invBrand, myFees, unassignedOut, storeRatio, brandSupply } = await computePnlMonth(supabase, {
    seg,
    store,
    ym: selectedYm,
    pos,
  });
  const foodSig = SIG[benchmark('food', p.metrics.foodCostRate)];
  const laborSig = SIG[benchmark('labor', p.metrics.laborRate)];
  const primeSig = SIG[benchmark('prime', p.metrics.primeCost)];
  // 미분해 lump(카드·쿠팡·네이버)·미분류·미상(용도 불명)이 있으면 지표가 왜곡됨 → '잠정' 처리
  const payLumpTotal = (p.payLump?.coupang ?? 0) + (p.payLump?.naverpay ?? 0);
  const uncertain = p.unclassified > 0 || p.cardLump > 0 || payLumpTotal > 0 || p.misang > 0;

  return (
    <>
      {/* 월 선택 + 업로드 */}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {yms.map((ym) => (
            <Link
              key={ym}
              href={`/finance/pnl?ym=${ym}&unit=${unitId}`}
              aria-current={ym === selectedYm ? 'page' : undefined}
              className={`rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
                ym === selectedYm
                  ? 'border-foreground font-medium text-foreground'
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
      <div className="mb-10 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4">
        <Metric label="식자재 원가율" value={pct(p.metrics.foodCostRate)} sub={`전체 재료율 ${pct(p.metrics.materialRate)}`} sig={foodSig} uncertain={uncertain} />
        <Metric label="인건비율" value={pct(p.metrics.laborRate)} sub="매출 대비" sig={laborSig} uncertain={uncertain} />
        <Metric label="Prime Cost" value={pct(p.metrics.primeCost)} sub="식자재+인건비" sig={primeSig} uncertain={uncertain} />
        <Metric label="매출총이익률" value={pct(p.metrics.grossMargin)} sub={won(p.grossProfit)} />
      </div>

      {p.unclassified > 0 && (
        <div className="mb-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
          <span className="text-foreground">
            ⚠️ 이 달 <b>미분류 지출 {won(p.unclassified)}</b>이 손익에 잡혀 있어요. 분류하면 지표가 정확해져요.
          </span>
          <Link href={`/finance/classify?ym=${selectedYm}&unclassified=1`} className="whitespace-nowrap underline">
            미분류 분류하러 →
          </Link>
        </div>
      )}

      {p.cardLump > 0 && (
        <div className="mb-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
          <span className="text-foreground">
            ⚠️ 카드 명세가 연결되지 않은 <b>카드대금 {won(p.cardLump)}</b>을 '카드 지출(미분해)'로 잡았어요.
            신한카드 이용내역을 올려 정산 연결하면 재료비·판관비로 분해돼요.
          </span>
          <Link
            href={`/finance/upload/${unitId}#card`}
            className="whitespace-nowrap underline"
          >
            명세 올리고 연결하러 →
          </Link>
        </div>
      )}

      {store && unassignedOut > 0 && (
        <div className="mb-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
          <span className="text-foreground">
            ⚠️ 지점이 지정되지 않은 가든 지출 <b>{won(unassignedOut)}</b>이 이 지점 손익에서 빠져 있어요.
            분류 화면에서 지점을 지정하거나 건별 분할로 나눠주세요.
          </span>
          <Link href={`/finance/classify?ym=${selectedYm}&brand=garden`} className="whitespace-nowrap underline">
            지점 지정하러 →
          </Link>
        </div>
      )}

      {/* 보정값 미입력 경고 — 관리손익 설계(2026-07-05)의 필수 보정 2가지가 빠지면 지표가 왜곡된다.
          수수료 미입력 → 추정률 사용(순매출 부정확), 기말재고 미입력 → 매입 전액이 재료비(이익 과소, 특히 초도발주 달). */}
      {(channelFee == null || !invBrand.some((i) => i.ym === selectedYm)) && (
        <div className="mb-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
          <span className="text-foreground">
            ⚠️ 이 달{' '}
            {channelFee == null && <b>채널 수수료가 미입력</b>}
            {channelFee == null && !invBrand.some((i) => i.ym === selectedYm) && ' · '}
            {!invBrand.some((i) => i.ym === selectedYm) && <b>기말재고가 미입력</b>}
            이에요. {channelFee == null && '수수료는 추정률로 계산 중이고, '}
            {!invBrand.some((i) => i.ym === selectedYm) && '재고 미입력이면 매입 전액이 재료비로 잡혀 영업이익이 실제보다 낮게 보여요. '}
            아래 입력란에서 채워주세요.
          </span>
          <a href="#pnl-inputs" className="whitespace-nowrap underline">
            입력란으로 →
          </a>
        </div>
      )}

      <div className="grid gap-x-5 gap-y-10 lg:grid-cols-[1fr_320px]">
        {/* 손익계산서 */}
        <div className="rounded-md bg-muted/40 p-6">
          <h2 className="mb-4 text-[15px] text-foreground">손익계산서 · {fmtYm(selectedYm)}</h2>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              <Row label="총매출 (VAT 포함)" amount={p.sales.gross} muted />
              <Row label="(−) 부가세" amount={-p.sales.vat} muted />
              <Row label="공급가액 매출" amount={p.sales.supply} bold />
              <Row
                label="(−) 채널수수료"
                amount={-p.channelFee.amount}
                sub={p.channelFee.estimated ? '추정 · 정산서 실제 금액 입력 시 교체' : undefined}
              />
              <Row label="순매출" amount={p.netSales} bold />
              <Row
                label="(−) 재료비"
                amount={-p.cogs.total}
                sub={
                  [
                    p.cogs.invMissing ? '기말재고 일부 미입력 → 매입액 기준' : null,
                    p.cardDupOffset > 0 ? `카드대금 속 네이버페이·쿠팡 수집분 ${won(p.cardDupOffset)} 차감(이중계상 방지)` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
              <SubRow label="식자재" k={p.cogs.식자재} />
              <SubRow label="포장소모품" k={p.cogs.포장소모품} />
              <Row label="매출총이익" amount={p.grossProfit} bold rate={p.metrics.grossMargin} />
              <Row label="(−) 인건비" amount={-p.labor} rate={p.metrics.laborRate} />
              <Row label="(−) 고정비 (판관비)" amount={-p.fixed} />
              {p.vatPayment !== 0 && (
                <Row
                  label="부가세 납부 (손익 제외)"
                  amount={p.vatPayment}
                  muted
                  sub="예수금 정산이라 지출로 안 잡아요 — 매출을 공급가액(VAT 제외)으로 이미 뺐어요. 통장에선 나간 돈"
                />
              )}
              {p.cardLump > 0 && (
                <Row label="(−) 카드 지출 (세부 미분해)" amount={-p.cardLump} warn sub="카드대금 결제 총액 · 세부내역 연결 시 재료비·판관비로 분해" />
              )}
              {(p.payLump?.coupang ?? 0) > 0 && (
                <Row label="(−) 쿠팡 (미분류)" amount={-p.payLump!.coupang} warn sub="쿠팡 세부 내역 미수집 — 통장 출금 총액 그대로 · 수집되면 계정별로 분해" />
              )}
              {(p.payLump?.naverpay ?? 0) > 0 && (
                <Row label="(−) 네이버페이 (미분류)" amount={-p.payLump!.naverpay} warn sub="네이버페이 세부 내역 미수집 — 통장 출금 총액 그대로 · 수집되면 계정별로 분해" />
              )}
              {p.misang > 0 && (
                <Row label="(−) 미상 (확인 필요)" amount={-p.misang} warn sub="용도 불명 보류 — 분류 화면 '미상 N건'에서 밝혀 재분류" />
              )}
              {p.unclassified > 0 && <Row label="(−) 미분류" amount={-p.unclassified} warn />}
              <Row label="영업이익 (EBIT 근사)" amount={p.operatingProfit} bold big sub="감가상각 전" />
            </tbody>
          </table>
          {p.cardReconcile && p.cardReconcile.settledWithdrawn > 0 && (
            <p className={`mt-4 text-[11px] ${p.cardReconcile.diff !== 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
              카드 정산 대사 — 카드대금 인출 {won(p.cardReconcile.settledWithdrawn)} ↔ 연결 명세 사용액{' '}
              {won(p.cardReconcile.settledUsage)}
              {p.cardReconcile.diff !== 0 ? ` · 차액 ${won(Math.abs(p.cardReconcile.diff))} ⚠️` : ' · 일치 ✓'}
            </p>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">
            채널수수료는 정산서 금액(없으면 추정)까지 반영했어요. 영업외·자본적지출(감가상각) 등 손익제외 계정은 빠져 있어요.
            카드·쿠팡·네이버페이는 세부 자료가 있으면 계정별로, 없으면 통장 인출 총액을 '(미분해/미분류)' 줄로 잡아요
            — 미분해 lump는 보통 전월 사용분이라 월 귀속이 ±1개월 밀릴 수 있어요.
          </p>
        </div>

        {/* 우측: 기말재고 + 매출 구성 — 입력은 항상 브랜드(가든서비스 전체/스탭밀) 단위.
            지점 필을 선택 중이어도 여기서 그대로 입력하면 가든서비스 전체 값이 바뀐다(지점별 입력 아님). */}
        <div id="pnl-inputs" className="flex flex-col gap-10">
          {store && (
            <div className="rounded-md bg-muted/40 p-4 text-[13px] text-muted-foreground">
              지점 뷰의 재료비·수수료는 {storeLabel(store)} 매출비율({pct(storeRatio)})로 안분한 근사치예요.
              아래 입력은 가든서비스 전체 기준이에요.
            </div>
          )}
          <InventoryInput
            ym={selectedYm}
            brand={seg}
            initial={{
              식자재: invBrand.find((i) => i.ym === selectedYm && i.kind === '식자재')?.amount ?? null,
              포장소모품: invBrand.find((i) => i.ym === selectedYm && i.kind === '포장소모품')?.amount ?? null,
            }}
            prevMonth={{
              식자재: invBrand.find((i) => i.ym === prevYm(selectedYm) && i.kind === '식자재')?.amount ?? null,
              포장소모품: invBrand.find((i) => i.ym === prevYm(selectedYm) && i.kind === '포장소모품')?.amount ?? null,
            }}
          />
          <ChannelFeeInput
            ym={selectedYm}
            brand={seg}
            initial={store ? (myFees.length > 0 ? myFees.reduce((s, f) => s + f.amount, 0) : null) : (p.channelFee.estimated ? null : p.channelFee.amount)}
            estimate={Math.round((store ? brandSupply : p.sales.supply) * CHANNEL_FEE_RATE)}
          />
          <div className="rounded-md bg-muted/40 p-6">
            <h2 className="mb-3 text-[15px] text-foreground">매출 구성</h2>
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
    <div className="rounded-md bg-muted/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[22px] tabular ${showSig ? sig.cls : 'text-foreground'}`}>{value}</div>
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
      <td className={`py-2 ${big ? 'text-[15px]' : ''} ${bold ? 'font-medium text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'}`}>
        {label}
        {sub && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{sub}</span>}
      </td>
      <td className="py-2 text-right text-[11px] tabular text-muted-foreground">{rate != null ? pct(rate) : ''}</td>
      <td className={`py-2 text-right tabular ${big ? 'text-[15px]' : ''} ${bold ? 'font-medium text-foreground' : warn ? 'text-amber-600 dark:text-amber-500' : 'text-foreground'}`}>
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

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '관리손익' };
