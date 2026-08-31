import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { resolveRoleStamped } from '@/lib/access/stamp';
import { unwrap } from '@/lib/finance/db';
import { fetchAllRows } from '@/lib/finance/fetchAll';
import type { AggTx, AggCat } from '@/lib/finance/aggregate';
import { monthEndBalance } from '@/lib/finance/cashflow';
import { UNITS, unitOf } from '@/lib/finance/types';
import { GRAM_PRODUCTS } from '@/lib/finance/gramProducts';
import { get as getBlob } from '@vercel/blob';
import { WEATHER_SALES_CACHE_PATH } from '@/lib/garden/weatherSales';
import TabNav from '@/components/TabNav';
import FinanceNav from '@/components/finance/FinanceNav';
import dynamic from 'next/dynamic';

// recharts 포함 차트 번들은 별도 청크로 지연 로드 — 페이지 뼈대가 먼저 그려진다
const Dashboard = dynamic(() => import('@/components/finance/Dashboard'), {
  loading: () => <p className="px-6 py-8 text-[13px] text-muted-foreground">차트 불러오는 중…</p>,
});

// 지표 — 매출·이익·비율 추이 차트 (구 재무 대시보드). 대시보드는 업무 보드로 개편.
export default async function MetricsPage({ searchParams }: { searchParams: { unit?: string } }) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect('/');

  const role = await resolveRoleStamped(supabase, user);
  if (!role) redirect('/finance'); // 멤버(admin/classifier/viewer)만 — viewer는 이름 없는 안전 뷰로
  // '전사 통합'(?unit=all) — 사업 브랜드 합산(개인 제외) 뷰. 매장 필(UNITS) 밖의 특수 진입점이라
  // 상단 내비가 아닌 이 페이지의 링크로만 드나든다(2026-08-23, G6 브랜드 통합 손익).
  const isAll = searchParams.unit === 'all';
  const unit = unitOf(searchParams.unit) ?? UNITS[0];

  // ⚠️ 전량 조회(페이지네이션) — limit 없이 한 번만 select 하면 PostgREST 응답이 프로젝트
  // Max Rows(Settings→API, 2026-08-09 기준 20000)에서 잘린다. POS 일별 행이 그 이상이면
  // 가장 최근 달이 통째로 잘려 매출 0으로 보였다(2026-08-04 버그). fetchAllRows 는 실제 반환
  // 길이만큼만 전진하고 0행에서만 멈추므로 서버 상한이 PAGE 보다 작아져도 잘리지 않는다
  // (구 구현은 `length < PAGE`에서 멈춰 상한 축소 시 첫 페이지 잘림 — 2026-08-21 감사 B2 수정).
  // PAGE 를 낮게 잡으면 왕복이 늘어 느려진다(2026-08-09, 지표 26초 로딩 원인) — 20000 유지.
  // ⚠️ 정렬은 반드시 **선택 컬럼 전부** — 뷰엔 고유 id가 없어, 정렬 키에서 빠진 컬럼이 다른
  // 행이 페이지 경계에서 중복·누락될 수 있다(2026-08-21 감사 B3 — source 등 3개 컬럼 보강).
  const PAGE = 20000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchAll = (table: string, cols: string, order: string[]): Promise<any[]> =>
    fetchAllRows(
      (from, to) => {
        let q = supabase.schema('finance').from(table).select(cols);
        for (const c of order) q = q.order(c, { ascending: true, nullsFirst: true });
        return q.range(from, to);
      },
      { page: PAGE, label: table }
    );

  // dashboard_tx = memo(이름) 없는 멤버 전용 뷰(viewer도 읽음). store 컬럼은 마이그레이션 전이면 없어 폴백.
  const loadTxns = async () => {
    const full = 'tx_at,amount_in,amount_out,category_id,brand,store,source,is_card_payment,is_vat_payment';
    // source·is_card_payment·is_vat_payment = 카드대금 차감·부가세 제외용 신호(aggregate) — 뷰 미마이그레이션이면 구 컬럼 폴백
    try {
      return await fetchAll('dashboard_tx', full, full.split(','));
    } catch {
      const cols = 'tx_at,amount_in,amount_out,category_id,brand,store';
      return await fetchAll('dashboard_tx', cols, cols.split(',')); // 실패는 여기서 그대로 던진다(조용한 빈 화면 방지)
    }
  };

  const loadCats = async () =>
    unwrap(
      await supabase.schema('finance').from('categories').select('id,type,name,parent_id,vat_taxable,cost_nature'),
      '계정과목',
    );

  // 매출 = POS 공급가액(발생주의). memo-free 뷰(dashboard_pos), 없으면 pos_sales로 폴백.
  // category 포함 — 식권 판매 비중 차트('식권판매' 분리)용. 최종 폴백까지 실패하면 던진다 —
  // 예전엔 조용히 매출 0으로 진행돼 지출만 남은 적자 그래프가 무경고로 그려졌다(2026-08-21 감사 B4).
  const loadPosSales = async () => {
    let rows: { sale_date: string; supply: number; brand?: string | null; store?: string | null; category?: string | null }[];
    try {
      rows = await fetchAll('dashboard_pos', 'sale_date,supply,brand,store,category', ['sale_date', 'brand', 'store', 'category', 'supply']);
    } catch {
      // 뷰 미마이그레이션 환경 폴백 — pos_sales 원본(식권 union 없음·category 없음)
      rows = await fetchAll('pos_sales', 'sale_date,supply,brand', ['sale_date', 'brand', 'supply']);
    }
    return rows.map((p) => ({ saleDate: p.sale_date, supply: p.supply, brand: p.brand, store: p.store ?? null, category: p.category ?? null }));
  };

  // 채널수수료 실입력 — 지표 EBIT도 관리손익과 같은 기준(실입력 우선, 없으면 추정율)으로 차감(2026-08-20)
  const loadChannelFees = async () => {
    const { data } = await supabase.schema('finance').from('channel_fees').select('ym,amount,brand,store');
    return ((data as { ym: string; amount: number; brand?: string | null; store?: string | null }[] | null) ?? []);
  };

  // 통장 입출금·월말 잔액 월별 집계 — 지표 첫 차트용(2026-08-04 대표 지시).
  // dashboard_tx(안전 뷰)에는 은행·잔액이 없어 원본 transactions에서 별도 집계.
  // admin/classifier만(viewer는 RLS로 원본이 안 보여 차트 생략). 분할 자식 행 제외(이중계상 방지).
  type BankCashRow = { ym: string; brand: string; bank: string; inflow: number; outflow: number; balance: number };
  const loadBankCash = async (): Promise<BankCashRow[]> => {
    const bankCash: BankCashRow[] = [];
    if (!['admin', 'classifier'].includes(role)) return bankCash;
    // 조회 실패는 던진다 — 부분 데이터로 월말 잔액을 그리던 침묵 폴백 제거(2026-08-21 감사 B4)
    const raw = await fetchAllRows<{ ym: string; bank: string; brand: string | null; tx_at: string; amount_in: number; amount_out: number; balance: number }>(
      (from, to) =>
        supabase
          .schema('finance')
          .from('transactions')
          .select('ym,bank,brand,tx_at,amount_in,amount_out,balance')
          .eq('source', 'bank')
          .is('split_parent_id', null)
          .order('id')
          .range(from, to),
      { page: PAGE, label: '통장 거래' }
    );
    // (브랜드,은행)별 월 집계 + 월말 잔액, 거래 없는 달은 잔액 이월.
    // 월말 잔액은 '마지막 행'이 아니라 유일 시각 앵커 방식(monthEndBalance) — 은행 파일이
    // 오름차순·내림차순으로 섞여 들어와 동시각 묶음의 순서를 믿을 수 없다(2026-08-20, cashflow.ts 참고).
    const agg = new Map<string, Map<string, { inflow: number; outflow: number; rows: { tx_at: string; amount_in: number; amount_out: number; balance: number }[] }>>();
    for (const t of raw) {
      const k = `${t.brand ?? 'garden'}|${t.bank}`;
      if (!agg.has(k)) agg.set(k, new Map());
      const mm = agg.get(k)!;
      const ym = String(t.ym);
      const a = mm.get(ym) ?? { inflow: 0, outflow: 0, rows: [] };
      a.inflow += Number(t.amount_in) || 0;
      a.outflow += Number(t.amount_out) || 0;
      a.rows.push({
        tx_at: String(t.tx_at),
        amount_in: Number(t.amount_in) || 0,
        amount_out: Number(t.amount_out) || 0,
        balance: Number(t.balance) || 0,
      });
      mm.set(ym, a);
    }
    const allYms = Array.from(new Set(raw.map((t) => String(t.ym)))).sort();
    for (const [k, mm] of Array.from(agg.entries())) {
      const [bBrand, bank] = k.split('|');
      let carry = 0;
      for (const ym of allYms) {
        const a = mm.get(ym);
        if (a) {
          const end = monthEndBalance(a.rows);
          if (end != null) carry = end;
          bankCash.push({ ym, brand: bBrand, bank, inflow: a.inflow, outflow: a.outflow, balance: carry });
        } else {
          bankCash.push({ ym, brand: bBrand, bank, inflow: 0, outflow: 0, balance: carry });
        }
      }
    }
    return bankCash;
  };

  // 대여금 마커 — '대여금'(excluded) 분류 거래를 (브랜드, 월)로 합쳐 통장 차트에 빨간 원으로 표기.
  // 문구는 chart_annotations 오버라이드가 있으면 그걸로, 없으면 기본 '가든서비스 대여금'.
  // 분류가 정본 — 지출 자료 분류에서 '대여금'으로 바꾸면 마커가 자동으로 생기고 없어진다.
  type LoanMarker = { brand: string; ym: string; amount: number; label: string };
  const loadLoanMarkers = async (): Promise<LoanMarker[]> => {
    if (!['admin', 'classifier'].includes(role)) return []; // viewer는 통장 차트 자체가 없음
    const { data: cat } = await supabase
      .schema('finance')
      .from('categories')
      .select('id')
      .eq('type', 'excluded')
      .eq('name', '대여금')
      .maybeSingle();
    if (!cat) return [];
    const [txsRes, labelsRes] = await Promise.all([
      supabase.schema('finance').from('transactions').select('ym,brand,amount_out,amount_in').eq('category_id', cat.id).limit(10000),
      supabase.schema('finance').from('chart_annotations').select('brand,ym,label'),
    ]);
    const txs = unwrap(txsRes, '대여금 거래');
    const labels = unwrap(labelsRes, '차트 주석');
    const agg = new Map<string, LoanMarker>();
    for (const t of (txs ?? []) as { ym: string; brand: string | null; amount_out: number; amount_in: number }[]) {
      const b = t.brand ?? 'garden';
      const key = `${b}|${t.ym}`;
      const m = agg.get(key) ?? { brand: b, ym: t.ym, amount: 0, label: '가든서비스 대여금' };
      m.amount += (Number(t.amount_out) || 0) - (Number(t.amount_in) || 0);
      agg.set(key, m);
    }
    for (const l of (labels ?? []) as { brand: string; ym: string; label: string }[]) {
      const m = agg.get(`${l.brand}|${l.ym}`);
      if (m) m.label = l.label;
    }
    return Array.from(agg.values());
  };

  // 메뉴 판매량 추이(Newbie/Staff/Boss × 매장/포장) — 스탭밀 상품별 리포트(finance.pos_items) 기준.
  // memo 없는 안전 뷰(dashboard_pos_items) 우선, 없으면 원본 폴백. fetchAll 은 브랜드 필터를 못 걸어
  // 전체(가든 포함 1.5만 행 안팎)를 받은 뒤 여기서 스탭밀만 추린다 — 물량이 작아 부담 없다.
  const loadMenuQty = async () => {
    const cols = 'sale_date,category,product,qty,brand';
    const order = cols.split(','); // 선택 컬럼 전부로 정렬 — 페이지 경계 안전(위 주석 참고)
    let all: { sale_date: string; category: string; product: string; qty: number; brand: string }[];
    try {
      all = await fetchAll('dashboard_pos_items', cols, order);
    } catch {
      all = await fetchAll('pos_items', cols, order);
    }
    return all.filter((r) => r.brand === 'staffmeal').map((r) => ({ saleDate: r.sale_date, category: r.category, product: r.product, qty: Number(r.qty) }));
  };

  // 그램 단위 판매 상품(가든 양재천 '브런치바') 일별 행 — 매출 추이 옆 추이 차트용(2026-08-31).
  // 단가표(gramProducts.ts)에 이 단위의 규칙이 없으면 조회 자체를 건너뛴다.
  const loadGramItems = async () => {
    if (isAll) return [];
    const store = unit.store ?? '';
    const products = Array.from(
      new Set(GRAM_PRODUCTS.filter((r) => r.brand === unit.brand && (r.store === '' || r.store === store)).map((r) => r.product)),
    );
    if (products.length === 0) return [];
    const { data, error } = await supabase
      .schema('finance')
      .from('dashboard_pos_item_hours')
      .select('sale_date,product,qty,supply,list_price')
      .eq('brand', unit.brand)
      .eq('store', store)
      .in('product', products)
      .limit(20000);
    if (error) return []; // 뷰 미마이그레이션 환경 — 차트만 빠지고 나머지는 그대로
    return ((data ?? []) as { sale_date: string; product: string; qty: number; supply: number; list_price: number }[]).map((r) => ({
      saleDate: r.sale_date,
      product: r.product,
      qty: Number(r.qty),
      supply: Number(r.supply),
      listPrice: Number(r.list_price),
    }));
  };

  // 날씨 × 매출 상관 — /api/garden-weather-sales 가 하루 한 번 계산해 Blob 에 넣어 둔 결과를
  // 그대로 읽어 쓴다(2026-08-31 대표 요청, 지표에도 노출). 여기선 절대 재계산하지 않는다 —
  // 전 기간 POS 스캔 + Open-Meteo 아카이브 조회라 지표 로딩이 수십 초 밀린다.
  // 캐시가 없거나(첫 진입) 형식이 다르면 조용히 카드만 빠진다. 갱신은 가든 → 날씨 분석에서.
  const loadWeatherImpact = async () => {
    if (isAll || unit.brand !== 'garden') return null;
    try {
      const res = await getBlob(WEATHER_SALES_CACHE_PATH, { access: 'private', useCache: false });
      if (!res) return null;
      const cached = JSON.parse(await new Response(res.stream).text());
      const key = `${unit.store ?? ''}-supply`;
      const series = (cached?.payload?.series ?? []) as {
        key: string;
        label: string;
        result: {
          n: number; r2: number; tempRef: string;
          temp: { label: string; pct: number; t: number; n: number }[];
          rain: { label: string; pct: number; t: number; n: number }[];
          trendPct: number; trendT: number; holidayPct: number | null; holidayT: number | null;
        } | null;
      }[];
      const hit = series.find((x) => x.key === key);
      if (!hit?.result) return null;
      const r = hit.result;
      return {
        label: hit.label,
        computedAt: cached.computedAt as string,
        n: r.n,
        r2: r.r2,
        tempRef: r.tempRef,
        effects: [...r.temp, ...r.rain].map((e) => ({ label: e.label, pct: e.pct, t: e.t, days: e.n })),
        trendPct: r.trendPct,
        holidayPct: r.holidayPct,
        holidayT: r.holidayT,
      };
    } catch {
      return null;
    }
  };

  // 미분해 지출 lump — 명세 미연결 카드대금·세부 미수집 대체 출금(dashboard_lumps 안전 뷰).
  // 관리손익의 cardLump·payLump 와 같은 규칙으로 지표 EBIT에서도 차감(2026-08-21 감사 P4-7).
  // 뷰 미마이그레이션 환경이면 빈 배열(그때만 구 동작 = lump 미반영).
  const loadLumps = async () => {
    const { data, error } = await supabase.schema('finance').from('dashboard_lumps').select('brand,ym,kind,amount');
    if (error) return [];
    return ((data as { brand: string; ym: string; kind: string; amount: number }[] | null) ?? []);
  };

  // 5개 테이블이 서로 독립적이라 병렬로 조회 — 예전엔 순차 await라 지표 페이지 로딩이 밀렸다.
  const [txns, cats, posSales, bankCash, menuItems, loanMarkers, channelFees, lumps, gramItems, weatherImpact] = await Promise.all([
    loadTxns(),
    loadCats(),
    loadPosSales(),
    loadBankCash(),
    loadMenuQty(),
    loadLoanMarkers(),
    loadChannelFees(),
    loadLumps(),
    loadGramItems(),
    loadWeatherImpact(),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <FinanceNav role={role} />
      <div className="w-full px-6 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] tracking-[-0.5px]">지표{isAll ? ' — 전사 통합' : ''}</h1>
          <span className="flex items-baseline gap-4">
            {isAll ? (
              <Link href="/finance/metrics" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                ← 매장별 보기
              </Link>
            ) : (
              <Link href="/finance/metrics?unit=all" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                전사 통합 →
              </Link>
            )}
            <Link href="/finance" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              ← 업로드로
            </Link>
          </span>
        </div>
        <p className="mb-5 text-[13px] text-muted-foreground">
          <b>매출은 POS(발생주의)</b>, 지출은 통장·카드 기준이에요. 통장 현금흐름·잔액은 <Link href="/finance/cashflow" className="underline">월별 요약</Link>·<Link href="/finance/flow" className="underline">자금 흐름</Link>에서 봐요.
        </p>
        {/* 좌측 연·월 사이드바와 요약 타일은 제거했다(2026-08-31 대표 지시) — 이 화면은 추이 전용이고,
            달 단위 숫자는 관리손익·월 결산에서 본다. 차트는 항상 전체 기간(진행월 포함). */}
        <Dashboard
          txns={(txns as AggTx[]) ?? []}
          cats={(cats as AggCat[]) ?? []}
          posSales={posSales}
          bankCash={bankCash}
          menuItems={menuItems}
          gramItems={gramItems}
          weatherImpact={weatherImpact}
          loanMarkers={loanMarkers}
          channelFees={channelFees}
          lumps={lumps}
          reportUnit={isAll ? { brand: 'all', store: null } : { brand: unit.brand as 'staffmeal' | 'garden', store: unit.store }}
          showIncentiveSim={['admin', 'classifier'].includes(role)}
        />
      </div>
    </div>
  );
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '지표' };
