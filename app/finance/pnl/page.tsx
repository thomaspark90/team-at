import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import { buildPnl, benchmark, prevYm, CHANNEL_FEE_RATE, type PnlCat, type PnlTx, type PnlPosRow, type PnlInventory, type Signal } from '@/lib/finance/pnl';
import { BRANDS, storeLabel, type Brand, type Store } from '@/lib/finance/types';
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

// 브랜드 세그먼트 — 기본 가든(기존 숫자와 동일), 'all' = 두 사업 브랜드 합산 보기.
// 개인(personal)은 손익 제외라 관리손익 세그먼트에 없다(BRANDS = 사업 브랜드만).
type BrandSeg = Exclude<Brand, 'personal'> | 'all';
const SEGMENTS: { id: BrandSeg; label: string }[] = [...BRANDS, { id: 'all', label: '전체' }];

// 손익 모드 — precise: 세부내역(카드·쿠팡·네이버) 연결 기준(기존). simple: 은행 출금 기준 간이
// (세부내역 업로드 전에도 지출 총량을 근사 — 카드대금 결제를 '카드 지출(미분해)' 줄로 포함, 2026-08-03 대표 지시)
type PnlMode = 'precise' | 'simple';

export default async function PnlPage({
  searchParams,
}: {
  searchParams: { ym?: string; brand?: string; store?: string; mode?: string };
}) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');
  const role = await resolveRoleStamped(supabase, user);
  if (!role || !['admin', 'classifier'].includes(role)) redirect('/finance');

  const seg: BrandSeg =
    searchParams.brand === 'staffmeal' ? 'staffmeal' : searchParams.brand === 'all' ? 'all' : 'garden';
  const mode: PnlMode = searchParams.mode === 'simple' ? 'simple' : 'precise';
  const modeQS = mode === 'simple' ? '&mode=simple' : '';
  // 지점 필터 — 가든에서만 의미(판교=페이히어, 양재천=토스). 지점 손익은 재고·수수료 안분 근사치.
  const store: Store | null =
    seg === 'garden' && (searchParams.store === 'pangyo' || searchParams.store === 'yangjae')
      ? searchParams.store
      : null;

  // POS 매출과 사이드바 배지가 서로 독립적이라 병렬로
  const [posRaw, initialTodos] = await Promise.all([
    supabase
      .schema('finance')
      .from('pos_sales')
      .select('ym,category,qty,gross,vat,supply,brand,store')
      .then((r) => unwrap(r, 'POS 매출')),
    // 좌측 연·월 사이드바 배지 — 선택 브랜드 몫('전체'는 전 브랜드 합산)
    computeBoardTodos(supabase, seg !== 'all' ? seg : undefined).catch(() => undefined),
  ]);
  const posRows = (posRaw as (PnlPosRow & { brand?: string; store?: string })[] | null) ?? [];
  // 가든·판교(페이히어) POS는 손익 집계 제외 — 스탭밀 파일과 동일 데이터라 가든 회계와 무관
  // (2026-08-17 대표 지시, DB 행은 보존). '전체' 세그먼트에서도 스탭밀과 이중계상되지 않게 뺀다.
  const posAll = posRows.filter((p) => !((p.brand ?? 'garden') === 'garden' && p.store === 'pangyo'));
  // 구버전(마이그레이션 전) 행은 brand 컬럼이 없을 수 있음 → garden 취급
  const pos = seg === 'all' ? posAll : posAll.filter((p) => (p.brand ?? 'garden') === seg);
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
        <MonthShell brand={seg !== 'all' ? seg : undefined} initialTodos={initialTodos} navigate>
        {/* 브랜드 세그먼트 */}
        <div className="mb-10 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border">
            {SEGMENTS.map((s) => (
              <Link
                key={s.id}
                href={`/finance/pnl?brand=${s.id}${modeQS}`}
                aria-current={s.id === seg ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  s.id === seg ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          {seg === 'garden' && (
            // 가든 지점 세그먼트 — 지점 손익은 재고·수수료를 매출비율로 안분한 근사치
            <div className="flex overflow-hidden rounded-md border border-border">
              {[
                { id: '', label: '전체 지점' },
                { id: 'pangyo', label: '판교' },
                { id: 'yangjae', label: '양재천' },
              ].map((s) => (
                <Link
                  key={s.id || 'all'}
                  href={`/finance/pnl?brand=garden${s.id ? `&store=${s.id}` : ''}${modeQS}`}
                  aria-current={(store ?? '') === s.id ? 'page' : undefined}
                  className={`px-3 py-1.5 text-[13px] transition-colors ${
                    (store ?? '') === s.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          )}
          {/* 손익 모드 토글 — 간이(은행 기준)는 세부내역 없이 지출 총량으로 보는 근사 */}
          <div className="flex overflow-hidden rounded-md border border-border">
            {(
              [
                { id: 'precise', label: '정밀' },
                { id: 'simple', label: '간이 (은행 기준)' },
              ] as { id: PnlMode; label: string }[]
            ).map((m) => (
              <Link
                key={m.id}
                href={`/finance/pnl?brand=${seg}${store ? `&store=${store}` : ''}${searchParams.ym ? `&ym=${searchParams.ym}` : ''}${m.id === 'simple' ? '&mode=simple' : ''}`}
                aria-current={m.id === mode ? 'page' : undefined}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  m.id === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </Link>
            ))}
          </div>
          {mode === 'simple' && (
            <span className="text-[11px] text-muted-foreground">
              간이 = 통장 출금 기준 근사 — 카드대금은 '카드 지출(미분해)' 한 줄, 결제 시차로 월별 지출이 ±1개월
              밀릴 수 있어요. 연간 합계는 거의 정확해요.
            </span>
          )}
          {seg === 'staffmeal' && mode === 'precise' && (
            <span className="text-[11px] text-muted-foreground">
              카드 세부내역 연결 전이면 지출이 비어 보여요 — <b>간이 (은행 기준)</b>으로 보세요.
            </span>
          )}
          {store && (
            <span className="text-[11px] text-muted-foreground">
              지점 손익은 근사치예요 — 기말재고·채널수수료는 지점 매출비율로 안분해요.
            </span>
          )}
        </div>

        {yms.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="text-[32px]">🧾</div>
            <p className="m-0 text-[13px] text-muted-foreground">
              먼저 {SEGMENTS.find((s) => s.id === seg)?.label} POS 매출리포트를 올려주세요.
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
            mode={mode}
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
  mode,
  supabase,
}: {
  pos: (PnlPosRow & { store?: string })[];
  yms: string[];
  selectedYm: string;
  seg: BrandSeg;
  store: Store | null;
  mode: PnlMode;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const modeQS = mode === 'simple' ? '&mode=simple' : '';
  // 지점 매출비율 — 재고·수수료 안분과 지점 뷰의 POS 필터에 사용
  const monthPos = pos.filter((p) => p.ym === selectedYm);
  const brandSupply = monthPos.reduce((s, p) => s + p.supply, 0);
  const storeSupply = store ? monthPos.filter((p) => (p.store ?? '') === store).reduce((s, p) => s + p.supply, 0) : 0;
  const storeRatio = store && brandSupply > 0 ? storeSupply / brandSupply : store ? 0 : 1;
  const posView = store ? pos.filter((p) => (p.store ?? '') === store) : pos;

  // 지출·재고·수수료도 브랜드로 필터 — '전체'는 합산, 지점 뷰는 store 까지
  let txnsQ = supabase.schema('finance').from('transactions').select('id,category_id,amount_in,amount_out').eq('ym', selectedYm);
  // '전체'는 사업 브랜드만 합산 — 개인(personal)은 손익 제외라 카테고리와 무관하게 뺀다.
  if (seg !== 'all') txnsQ = txnsQ.eq('brand', seg);
  else txnsQ = txnsQ.neq('brand', 'personal');
  if (store) txnsQ = txnsQ.eq('store', store);
  // 간이(은행 기준) 모드 — 통장 행만 집계(카드·쿠팡·네이버 세부 행 제외 = 카드대금과 이중계상 방지)
  if (mode === 'simple') txnsQ = txnsQ.eq('source', 'bank');
  // 지점 뷰에서 빠지는 '지점 미지정' 가든 지출 — 경고 표기용
  const unassignedQ = store
    ? supabase
        .schema('finance')
        .from('transactions')
        .select('id,category_id,amount_out')
        .eq('ym', selectedYm)
        .eq('brand', 'garden')
        .is('store', null)
    : null;
  const [txnsRes, catsRes, invRes, feeRes, unassignedRes] = await Promise.all([
    txnsQ,
    supabase.schema('finance').from('categories').select('id,type,name,parent_id,vat_taxable'),
    supabase.schema('finance').from('inventory').select('ym,kind,amount,brand'),
    supabase.schema('finance').from('channel_fees').select('amount,brand').eq('ym', selectedYm),
    unassignedQ ?? Promise.resolve(null),
  ]);
  const txns = (unwrap(txnsRes, '거래') as (PnlTx & { id: number })[] | null) ?? [];
  const cats = (unwrap(catsRes, '계정과목') as PnlCat[] | null) ?? [];
  const invAll = (unwrap(invRes, '기말재고') as (PnlInventory & { brand?: string })[] | null) ?? [];
  // 재고: 브랜드 필터, '전체'는 (ym,kind) 합산 — buildPnl 은 (ym,kind) 단위를 기대.
  // 지점 뷰는 브랜드 재고를 이번 달 매출비율로 안분(근사치 — 지점별 실사는 안 함, 2026-07-28 확정).
  const invBrand: PnlInventory[] =
    seg === 'all'
      ? Array.from(
          invAll
            .reduce((m, i) => {
              const k = `${i.ym}|${i.kind}`;
              const cur = m.get(k) ?? { ym: i.ym, kind: i.kind, amount: 0 };
              cur.amount += i.amount;
              return m.set(k, cur);
            }, new Map<string, PnlInventory>())
            .values(),
        )
      : invAll.filter((i) => (i.brand ?? 'garden') === seg);
  const inventory: PnlInventory[] = store
    ? invBrand.map((i) => ({ ...i, amount: Math.round(i.amount * storeRatio) }))
    : invBrand;
  // 채널수수료 실제 입력값 — '전체'는 입력된 브랜드 합(모두 미입력이면 null → 추정), 지점 뷰는 매출비율 안분
  const feeRows = feeRes.error ? [] : ((feeRes.data as { amount: number; brand?: string }[] | null) ?? []);
  const myFees = seg === 'all' ? feeRows : feeRows.filter((f) => (f.brand ?? 'garden') === seg);
  const feeSum = myFees.length > 0 ? myFees.reduce((s, f) => s + f.amount, 0) : null;
  const channelFee = feeSum != null ? (store ? Math.round(feeSum * storeRatio) : feeSum) : null;

  // 지점 미지정 지출(손익 계정만) — 지점 뷰 합계에서 빠져 있음을 경고
  const catTypeById = new Map(cats.map((c) => [c.id, c.type]));
  const unassignedRows = (unassignedRes && !unassignedRes.error ? (unassignedRes.data as { id: number; category_id: number | null; amount_out: number }[] | null) : null) ?? [];

  // 카드대금 대사 — 이 달 '카드대금정산' 인출이 카드 명세(uploads.settled_tx_id)와 연결됐는지 판정.
  // 미연결 인출은 손익 제외가 아니라 '카드 지출(미분해)'로 포함(이익 과대 방지, 2026-08-17 대표 지시).
  // 지점 뷰에선 인출이 가든 공용(지점 미지정)이라 unassignedRows 쪽에 있다 → 미지정 경고액에 합산.
  const cardSettleCatId = cats.find((c) => c.type === 'excluded' && c.name === '카드대금정산')?.id ?? null;
  const txnLumps = cardSettleCatId != null ? txns.filter((t) => t.category_id === cardSettleCatId) : [];
  const unassignedLumps = cardSettleCatId != null ? unassignedRows.filter((r) => r.category_id === cardSettleCatId) : [];
  const lumpIds = [...txnLumps.map((t) => t.id), ...unassignedLumps.map((r) => r.id)];
  const settledUsageById = new Map<number, number | null>();
  if (lumpIds.length > 0) {
    const { data: settledUps } = await supabase
      .schema('finance')
      .from('uploads')
      .select('settled_tx_id,statement_total')
      .in('settled_tx_id', lumpIds);
    for (const u of (settledUps ?? []) as { settled_tx_id: number; statement_total: number | null }[]) {
      if (u.settled_tx_id != null) settledUsageById.set(u.settled_tx_id, u.statement_total);
    }
  }
  let cardReconcile: { unsettledLump: number; settledWithdrawn: number; settledUsage: number } | null = null;
  if (mode !== 'simple' && seg !== 'all' && !store) {
    cardReconcile = { unsettledLump: 0, settledWithdrawn: 0, settledUsage: 0 };
    for (const t of txnLumps) {
      const amt = (t.amount_out || 0) - (t.amount_in || 0);
      if (settledUsageById.has(t.id)) {
        cardReconcile.settledWithdrawn += amt;
        // 구버전 연결(합계 미기록)은 사용액=인출액으로 간주(차액 0) — 대사 불능을 차액으로 오표시하지 않게
        cardReconcile.settledUsage += settledUsageById.get(t.id) ?? amt;
      } else cardReconcile.unsettledLump += amt;
    }
  }

  const unassignedOut = unassignedRows
    .filter(
      (r) =>
        r.category_id == null ||
        catTypeById.get(r.category_id) !== 'excluded' ||
        // 미연결 카드대금은 손익에 포함돼야 할 지출 — 지점 뷰에서도 '빠진 지출'로 경고
        (r.category_id === cardSettleCatId && !settledUsageById.has(r.id)),
    )
    .reduce((s, r) => s + r.amount_out, 0);

  const p = buildPnl(selectedYm, { pos: posView, txns, cats, inventory, channelFee, cardReconcile }, { bankOnly: mode === 'simple' });
  const foodSig = SIG[benchmark('food', p.metrics.foodCostRate)];
  const laborSig = SIG[benchmark('labor', p.metrics.laborRate)];
  const primeSig = SIG[benchmark('prime', p.metrics.primeCost)];
  // 간이 모드 카드 미분해·미분류·미상(용도 불명)이 있으면 지표가 실제보다 좋게 보임 → '잠정' 처리
  const uncertain = p.unclassified > 0 || p.cardLump > 0 || p.misang > 0;

  return (
    <>
      {/* 월 선택 + 업로드 */}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {yms.map((ym) => (
            <Link
              key={ym}
              href={`/finance/pnl?ym=${ym}&brand=${seg}${store ? `&store=${store}` : ''}${modeQS}`}
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

      {mode !== 'simple' && p.cardLump > 0 && (
        <div className="mb-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/40 bg-amber-500/5 px-4 py-3 text-[13px]">
          <span className="text-foreground">
            ⚠️ 카드 명세가 연결되지 않은 <b>카드대금 {won(p.cardLump)}</b>을 '카드 지출(미분해)'로 잡았어요.
            신한카드 이용내역을 올려 정산 연결하면 재료비·판관비로 분해돼요.
          </span>
          <Link
            href={`/finance/upload/${seg === 'staffmeal' ? 'staffmeal' : 'yangjae'}#card`}
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
                sub={p.cogs.invMissing ? '기말재고 일부 미입력 → 매입액 기준' : undefined}
              />
              <SubRow label="식자재" k={p.cogs.식자재} />
              <SubRow label="포장소모품" k={p.cogs.포장소모품} />
              <Row label="매출총이익" amount={p.grossProfit} bold rate={p.metrics.grossMargin} />
              <Row label="(−) 인건비" amount={-p.labor} rate={p.metrics.laborRate} />
              <Row label="(−) 고정비 (판관비)" amount={-p.fixed} />
              {p.cardLump > 0 && (
                <Row label="(−) 카드 지출 (세부 미분해)" amount={-p.cardLump} warn sub="카드대금 결제 총액 · 세부내역 연결 시 재료비·판관비로 분해" />
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
            {mode === 'simple' ? (
              <>
                간이(은행 기준) — 통장 출금만 집계하고 카드대금 결제는 '카드 지출(미분해)' 한 줄로 잡았어요.
                카드대금은 보통 전월 사용분이라 월별 지출이 ±1개월 밀릴 수 있어요(연간 합계는 거의 정확).
                영업외·자본적지출 등 손익제외 계정은 빠져 있어요.
              </>
            ) : (
              <>채널수수료는 정산서 금액(없으면 추정)까지 반영했어요. 영업외·자본적지출(감가상각) 등 손익제외 계정은 빠져 있어요.</>
            )}
          </p>
        </div>

        {/* 우측: 기말재고 + 매출 구성 — 재고·수수료 입력은 브랜드 단위(전체·지점 탭에선 숨김) */}
        <div id="pnl-inputs" className="flex flex-col gap-10">
          {store ? (
            <div className="rounded-md bg-muted/40 p-6 text-[13px] text-muted-foreground">
              지점 뷰의 재료비·수수료는 {storeLabel(store)} 매출비율({pct(storeRatio)})로 안분한 근사치예요.
              기말재고·채널수수료 입력은 가든서비스 전체 탭에서 해요.
            </div>
          ) : seg !== 'all' ? (
            <>
              <InventoryInput
                ym={selectedYm}
                brand={seg}
                initial={{
                  식자재: p.cogs.식자재.기말입력 ? p.cogs.식자재.기말 : null,
                  포장소모품: p.cogs.포장소모품.기말입력 ? p.cogs.포장소모품.기말 : null,
                }}
                prevMonth={{
                  식자재: inventory.find((i) => i.ym === prevYm(selectedYm) && i.kind === '식자재')?.amount ?? null,
                  포장소모품: inventory.find((i) => i.ym === prevYm(selectedYm) && i.kind === '포장소모품')?.amount ?? null,
                }}
              />
              <ChannelFeeInput
                ym={selectedYm}
                brand={seg}
                initial={p.channelFee.estimated ? null : p.channelFee.amount}
                estimate={Math.round(p.sales.supply * CHANNEL_FEE_RATE)}
              />
            </>
          ) : (
            <div className="rounded-md bg-muted/40 p-6 text-[13px] text-muted-foreground">
              기말재고·채널수수료는 브랜드별로 입력해요 — 가든서비스/스탭밀 탭에서 넣어주세요.
            </div>
          )}
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
