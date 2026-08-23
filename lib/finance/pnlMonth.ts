import type { SupabaseClient } from '@supabase/supabase-js';
import { unwrap } from './db';
import { fetchAllRows } from './fetchAll';
import { CARD_PAYMENT_RE } from './cardOffset';
import { buildPnl, VAT_PAYMENT_RE, type PnlCat, type PnlTx, type PnlPosRow, type PnlInventory, type PnlResult } from './pnl';
import type { Brand, Store } from './types';

// 관리손익 '한 달' 데이터 로딩+계산 — /finance/pnl 페이지 본문(PnlBody)에서 추출(2026-08-21).
// 월 결산 페이지의 손익 드릴다운(/api/finance/pnl-month)과 관리손익 페이지가 이 코드를 공용해
// 두 화면의 숫자가 항상 일치한다("같은 코드 = 같은 숫자").

export type BrandSeg = Exclude<Brand, 'personal' | 'eastpark'>; // 개인·이스트파크(과거 귀속 전용)는 손익 세그먼트가 아니다

export type PnlPosRowS = PnlPosRow & { store?: string };

// POS 매출 로딩 — pos_sales + 자가 식권 판매(pos_gift_sales)를 pos_sales 행 형태로 합류.
// 자가 식권 판매 = 매출(2026-08-20 확정: 사용 시점엔 POS에 안 찍혀 판매 인식이 이중 없음). 과세 매출이라 부가세 1/11.
// 브랜드 필터는 DB에서, 전량은 페이지 로더로 — 무필터 전량 조회는 서버 Max Rows 에서 조용히
// 잘려 매출이 비결정적으로 줄어드는 경로였다(2026-08-21 감사 P0; 지표에서 2026-08-04 실사고).
export async function loadPnlPos(supabase: SupabaseClient, seg: BrandSeg): Promise<PnlPosRowS[]> {
  const [posRaw, giftRaw] = await Promise.all([
    fetchAllRows<PnlPosRowS & { brand?: string }>(
      (from, to) =>
        supabase
          .schema('finance')
          .from('pos_sales')
          .select('ym,category,qty,gross,vat,supply,brand,store')
          .eq('brand', seg)
          .order('id')
          .range(from, to),
      { label: 'POS 매출' }
    ),
    fetchAllRows<{ ym: string; qty: number; gross: number; brand?: string; store?: string }>(
      (from, to) =>
        supabase
          .schema('finance')
          .from('pos_gift_sales')
          .select('ym,qty,gross,brand,store')
          .eq('brand', seg)
          .order('id')
          .range(from, to),
      { label: '식권 판매', missingTableOk: true }
    ),
  ]);
  // 매출 구성 라벨 — 스탭밀=자가 식권, 가든=금액권·선불권(가든은 식권이 아예 없다, 2026-08-23 대표 확인)
  const giftLabel = seg === 'garden' ? '금액권 판매' : '식권판매';
  const giftAsPos = giftRaw.map(
    (g) => {
      const gross = Number(g.gross);
      const vat = Math.round(gross - gross / 1.1);
      return { ym: g.ym, category: giftLabel, qty: Number(g.qty), gross, vat, supply: gross - vat, brand: g.brand, store: g.store };
    }
  );
  const posRows = [...posRaw, ...giftAsPos] as (PnlPosRowS & { brand?: string })[];
  // 쿼리에서 이미 브랜드 필터 완료 — 방어적으로 한 번 더 거른다(전 행 brand 채워짐 확인, 2026-08-21)
  return posRows.filter((p) => (p.brand ?? 'garden') === seg);
}

export interface PnlMonthResult {
  p: PnlResult;
  /** channel_fees 실제 입력값. 지점 뷰: 지점 실액 우선, 브랜드('') 입력분은 매출비율 안분해 가산.
      null = 미입력(추정률 사용). (지점 차원 추가 2026-08-23, G5 선행) */
  channelFee: number | null;
  /** 브랜드 단위 기말재고 원본(안분 전) — 입력란 초기값·미입력 경고용 */
  invBrand: PnlInventory[];
  /** 이 뷰의 입력란 초기값용 channel_fees 행 — 지점 뷰는 그 지점 행만, 브랜드 뷰는 브랜드('') 행만 */
  myFees: { amount: number; brand?: string; store?: string }[];
  /** 지점 뷰에서 빠져 있는 '지점 미지정' 가든 손익 지출 합 — 경고용(브랜드 뷰는 0) */
  unassignedOut: number;
  /** 지점 매출비율(브랜드 뷰는 1) — 재고·수수료 안분 근사치 표기용 */
  storeRatio: number;
  /** 브랜드 전체 공급가액(이 달) — 수수료 추정치 표기용 */
  brandSupply: number;
}

// 선택 월의 관리손익 계산 — pos 는 loadPnlPos 결과(브랜드 필터 완료)를 넘긴다.
export async function computePnlMonth(
  supabase: SupabaseClient,
  { seg, store, ym, pos }: { seg: BrandSeg; store: Store | null; ym: string; pos: PnlPosRowS[] }
): Promise<PnlMonthResult> {
  // 지점 매출비율 — 재고·수수료 안분과 지점 뷰의 POS 필터에 사용
  const monthPos = pos.filter((p) => p.ym === ym);
  const brandSupply = monthPos.reduce((s, p) => s + p.supply, 0);
  const storeSupply = store ? monthPos.filter((p) => (p.store ?? '') === store).reduce((s, p) => s + p.supply, 0) : 0;
  const storeRatio = store && brandSupply > 0 ? storeSupply / brandSupply : store ? 0 : 1;
  const posView = store ? pos.filter((p) => (p.store ?? '') === store) : pos;

  // 지출·재고·수수료도 브랜드로 필터, 지점 뷰는 store 까지
  let txnsQ = supabase
    .schema('finance')
    .from('transactions')
    .select('id,category_id,amount_in,amount_out,source,memo')
    .eq('ym', ym)
    .eq('brand', seg);
  if (store) txnsQ = txnsQ.eq('store', store);
  // 지점 뷰에서 빠지는 '지점 미지정' 가든 지출 — 경고 표기용
  const unassignedQ = store
    ? supabase
        .schema('finance')
        .from('transactions')
        .select('id,category_id,amount_out')
        .eq('ym', ym)
        .eq('brand', 'garden')
        .is('store', null)
    : null;
  const [txnsRes, catsRes, invRes, feeRes, unassignedRes] = await Promise.all([
    txnsQ,
    supabase.schema('finance').from('categories').select('id,type,name,parent_id,vat_taxable'),
    supabase.schema('finance').from('inventory').select('ym,kind,amount,brand'),
    supabase.schema('finance').from('channel_fees').select('amount,brand,store').eq('ym', ym),
    unassignedQ ?? Promise.resolve(null),
  ]);
  // 카드대금 인출 판정(memo 패턴)을 빌더에 넘긴다 — buildPnl 이 수집분(네이버페이·쿠팡)과의
  // 이중계상을 차감한다(cardOffset.ts). memo 자체는 빌더로 안 넘어간다.
  const txnsRaw = (unwrap(txnsRes, '거래') as (PnlTx & { id: number; memo?: string | null })[] | null) ?? [];
  const txns = txnsRaw.map(({ memo, ...t }) => ({
    ...t,
    is_card_payment: (t.source ?? 'bank') === 'bank' && CARD_PAYMENT_RE.test(memo ?? ''),
    // 부가세 납부/환급 — buildPnl 이 손익에서 제외(예수금 정산 이중 차감 방지, 2026-08-21)
    is_vat_payment: (t.source ?? 'bank') === 'bank' && VAT_PAYMENT_RE.test(memo ?? ''),
  }));
  const cats = (unwrap(catsRes, '계정과목') as PnlCat[] | null) ?? [];
  const invAll = (unwrap(invRes, '기말재고') as (PnlInventory & { brand?: string })[] | null) ?? [];
  // 재고: 브랜드 필터. 지점 뷰는 브랜드 재고를 이번 달 매출비율로 안분(근사치 — 지점별 실사는
  // 안 함, 2026-07-28 확정). 입력은 항상 브랜드 단위(가든 전체) — 지점 뷰에서도 입력란에 그대로 넣는다.
  const invBrand: PnlInventory[] = invAll.filter((i) => (i.brand ?? 'garden') === seg);
  const inventory: PnlInventory[] = store
    ? invBrand.map((i) => ({ ...i, amount: Math.round(i.amount * storeRatio) }))
    : invBrand;
  // 채널수수료 실제 입력값 — 지점 차원(2026-08-23, G5 선행):
  //  · 지점 뷰: 그 지점 실액(store='yangjae'/'pangyo') 우선. 브랜드 단위('') 입력분이 남아 있으면
  //    레거시 규칙대로 매출비율 안분해 가산(둘이 섞여 있어도 이중이 아니게 — 실액은 실액대로,
  //    브랜드 lump 는 안분 몫만).
  //  · 브랜드 뷰: 전 행 합(지점 실액 + 브랜드 단위).
  const feeRows = feeRes.error ? [] : (((feeRes.data as { amount: number; brand?: string; store?: string }[] | null) ?? []));
  const brandFeeRows = feeRows.filter((f) => (f.brand ?? 'garden') === seg);
  const storeFeeRows = store ? brandFeeRows.filter((f) => (f.store ?? '') === store) : [];
  const lumpFeeRows = brandFeeRows.filter((f) => !(f.store ?? ''));
  const myFees = store ? storeFeeRows : lumpFeeRows;
  let channelFee: number | null = null;
  if (store) {
    const exact = storeFeeRows.reduce((s, f) => s + f.amount, 0);
    const lump = lumpFeeRows.reduce((s, f) => s + f.amount, 0);
    channelFee =
      storeFeeRows.length > 0 || lumpFeeRows.length > 0 ? exact + Math.round(lump * storeRatio) : null;
  } else {
    channelFee = brandFeeRows.length > 0 ? brandFeeRows.reduce((s, f) => s + f.amount, 0) : null;
  }

  // 지점 미지정 지출(손익 계정만) — 지점 뷰 합계에서 빠져 있음을 경고
  const catTypeById = new Map(cats.map((c) => [c.id, c.type]));
  const unassignedRows =
    (unassignedRes && !unassignedRes.error
      ? (unassignedRes.data as { id: number; category_id: number | null; amount_out: number }[] | null)
      : null) ?? [];

  // 카드대금 대사 — 이 달 '카드대금정산' 인출이 카드 명세(uploads.settled_tx_id)와 연결됐는지 판정.
  // 미연결 인출은 손익 제외가 아니라 '카드 지출(미분해)'로 포함(이익 과대 방지, 2026-08-17 대표 지시).
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
      if (u.settled_tx_id == null) continue;
      // 한 인출에 여러 명세가 연결될 수 있다(예: 4·5월 명세 → 6/9 결제) — 사용액은 합산.
      // null(구버전 합계 미기록)은 합산에서 제외하되 연결 자체는 유효.
      const prev = settledUsageById.get(u.settled_tx_id);
      settledUsageById.set(
        u.settled_tx_id,
        u.statement_total == null ? (prev ?? null) : (prev ?? 0) + u.statement_total
      );
    }
  }
  const cardReconcile = { unsettledLump: 0, settledWithdrawn: 0, settledUsage: 0 };
  for (const t of txnLumps) {
    const amt = (t.amount_out || 0) - (t.amount_in || 0);
    if (settledUsageById.has(t.id)) {
      cardReconcile.settledWithdrawn += amt;
      // 구버전 연결(합계 미기록)은 사용액=인출액으로 간주(차액 0) — 대사 불능을 차액으로 오표시하지 않게
      cardReconcile.settledUsage += settledUsageById.get(t.id) ?? amt;
    } else cardReconcile.unsettledLump += amt;
  }

  // 쿠팡·네이버페이 통장 대체 출금 — 같은 원리(2026-08-17): 그 달 세부 수집(자동수집 행)이 있으면
  // 세부가 대체하므로 제외 유지, 없으면 '쿠팡(미분류)'·'네이버페이(미분류)' 지출로 포함.
  const coupangSubstId = cats.find((c) => c.type === 'excluded' && c.name === '쿠팡대체')?.id ?? null;
  const naverSubstId = cats.find((c) => c.type === 'excluded' && c.name === '네이버페이대체')?.id ?? null;
  const substSum = (rows: { category_id: number | null; amount_out: number }[], catId: number | null) =>
    catId == null ? 0 : rows.filter((r) => r.category_id === catId).reduce((s, r) => s + r.amount_out, 0);
  const txnCoupangSubst = substSum(txns, coupangSubstId);
  const txnNaverSubst = substSum(txns, naverSubstId);
  const unassignedCoupangSubst = substSum(unassignedRows, coupangSubstId);
  const unassignedNaverSubst = substSum(unassignedRows, naverSubstId);
  // 세부 수집 존재 판정 — 지점 뷰는 txns가 지점 필터라 판단 불가 → 브랜드 단위 head-count로 통일
  const lumpBrand = seg === 'staffmeal' ? 'staffmeal' : 'garden';
  const hasDetail = async (src: string) => {
    const { count } = await supabase
      .schema('finance')
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('brand', lumpBrand)
      .eq('ym', ym)
      .eq('source', src);
    return (count ?? 0) > 0;
  };
  const needSubstCheck = txnCoupangSubst + txnNaverSubst + unassignedCoupangSubst + unassignedNaverSubst > 0;
  const [coupangHasDetail, naverHasDetail] = needSubstCheck
    ? await Promise.all([hasDetail('coupang'), hasDetail('naverpay')])
    : [true, true];
  const payLump = {
    coupang: coupangHasDetail ? 0 : txnCoupangSubst,
    naverpay: naverHasDetail ? 0 : txnNaverSubst,
  };

  const unassignedOut = unassignedRows
    .filter(
      (r) =>
        r.category_id == null ||
        catTypeById.get(r.category_id) !== 'excluded' ||
        // 미연결 카드대금·세부 미수집 대체 출금은 손익에 포함돼야 할 지출 — 지점 뷰에서도 '빠진 지출'로 경고
        (r.category_id === cardSettleCatId && !settledUsageById.has(r.id)) ||
        (r.category_id === coupangSubstId && !coupangHasDetail) ||
        (r.category_id === naverSubstId && !naverHasDetail)
    )
    .reduce((s, r) => s + r.amount_out, 0);

  const p = buildPnl(ym, { pos: posView, txns, cats, inventory, channelFee, cardReconcile, payLump });
  return { p, channelFee, invBrand, myFees, unassignedOut, storeRatio, brandSupply };
}
