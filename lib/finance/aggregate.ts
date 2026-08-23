// 월/주 단위 손익 집계 (EBIT 기준). 손익제외는 제외하되 미분류·'미상'은 지출로 포함(이익 부풀림 방지).
// 매출 = POS 공급가액(발생주의). 통장 매출 입금이 아니라 POS 판매 시점 기준.
// 지출(재료비·판관비)은 거래분류(통장·카드)에서, 과세분은 공급가액(÷1.1)으로 순액화해 매출과 기준 통일.
// 카드대금 인출과 네이버페이·쿠팡 수집분이 둘 다 손익에 실리면 월 단위에서 겹침을 차감한다(cardOffset.ts).
import { COLLECTED_SOURCES, cardDupOffset } from './cardOffset';

export const VAT_DIVISOR = 1.1;

// 채널수수료 추정 기본율(정산서 실제 금액 미입력 시) — 관리손익(pnl)과 동일 상수를 공유해
// 두 화면의 EBIT 기준을 통일한다(2026-08-20). 실제 금액을 입력하면 그 달은 추정을 무시한다.
export const CHANNEL_FEE_RATE = 0.017;

// 미분류 지출을 지출 구분/손익에 노출할 때 쓰는 라벨
export const UNCLASSIFIED = '미분류';

export interface AggCat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
  vat_taxable?: boolean; // 과세 매입/매출이면 순액(÷1.1) 대상. 없으면 과세로 간주(안전 기본값)
}
export interface AggTx {
  tx_at: string; // ISO
  amount_in: number;
  amount_out: number;
  category_id: number | null;
  brand?: string | null; // 'garden' | 'staffmeal' — 대시보드 브랜드 필터용(집계 자체는 사용 안 함)
  store?: string | null; // 'pangyo' | 'yangjae' — 가든 지점 필터용(집계 자체는 사용 안 함)
  source?: string | null; // 'bank' | 'naverpay' | 'coupang' | 'card' — 카드대금 상쇄 판정용(없으면 상쇄 생략)
  is_card_payment?: boolean; // 은행 카드대금 인출 — memo 없는 안전 뷰(dashboard_tx)가 패턴으로 계산해 준다
  is_vat_payment?: boolean; // 부가세 납부/환급 — 같은 뷰가 패턴으로 계산. 손익 제외(pnl.ts와 규칙 통일)
}
export type Unit = 'month' | 'week';

export interface MonthAgg {
  ym: string; // period key (월: YYYY-MM, 주: 그 주 월요일 YYYY-MM-DD)
  revenue: number;
  unclassifiedIn: number; // 미분류 입금(대출·자본유입 등 비매출 가능) — 매출과 분리해 별도 표기
  cogs: number;
  sga: number;
  ebit: number;
  nonOp: number;
  net: number;
  costRatio: number | null;
  profitRatio: number | null;
  expense: Record<string, number>;
  /** 카드대금↔수집분 겹침 차감액(월 단위만) — 0이면 차감 없음 */
  cardDupOffset: number;
  /** 채널수수료(opts.channelFees 전달 시) — 실입력 우선, 없으면 매출×추정율. EBIT에서 차감 */
  fee: number;
}

function periodKey(iso: string, unit: Unit): string {
  if (unit === 'month') return iso.slice(0, 7);
  // 주: 그 주의 월요일 날짜
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // 월=0 … 일=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function aggregate(
  txns: AggTx[],
  cats: AggCat[],
  unit: Unit = 'month',
  netVat = true,
  posSales: { saleDate: string; supply: number }[] = [],
  // 채널수수료 옵션 — 전달 시 EBIT에서 수수료를 뺀다(관리손익과 기준 통일).
  // channelFees: ym→실입력 금액(월 단위에서만 적용). 없는 구간은 매출×rate 추정.
  feeOpts?: { channelFees?: Record<string, number>; rate?: number } | null,
): { months: MonthAgg[]; expenseKeys: string[] } {
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const nameOf = (c: AggCat): string => {
    if (c.parent_id != null) {
      const p = catMap.get(c.parent_id);
      return p ? p.name : c.name;
    }
    return c.name;
  };

  const m = new Map<string, MonthAgg>();
  const expenseKeys = new Set<string>();

  // 순액 모드에서 과세 항목만 공급가액(총액÷1.1)으로. VAT는 손익 아닌 예수/대급금이라 제외.
  // 면세·비대상(인건비·이자·수도·세금 등)은 그대로. vat_taxable 미지정은 과세로 간주.
  const netAmt = (v: number, c: AggCat) => (netVat && c.vat_taxable !== false ? Math.round(v / VAT_DIVISOR) : v);
  const getMo = (key: string): MonthAgg => {
    let mo = m.get(key);
    if (!mo) {
      mo = { ym: key, revenue: 0, unclassifiedIn: 0, cogs: 0, sga: 0, ebit: 0, nonOp: 0, net: 0, costRatio: null, profitRatio: null, expense: {}, cardDupOffset: 0, fee: 0 };
      m.set(key, mo);
    }
    return mo;
  };

  // 카드대금↔수집분 상쇄 재료 — 그 구간 손익에 실린 금액만 모아 뒤에서 겹침을 뺀다(cardOffset.ts 규칙).
  // 카드대금은 실린 키별로 들어(대개 '재료비') 차감도 같은 키에서 비례로 한다.
  const cardByPeriod = new Map<string, Map<string, { amt: number; bucket: 'cogs' | 'sga' }>>();
  const collectedByPeriod = new Map<string, number>();
  const addCard = (key: string, expKey: string, bucket: 'cogs' | 'sga', amt: number) => {
    const m = cardByPeriod.get(key) ?? new Map<string, { amt: number; bucket: 'cogs' | 'sga' }>();
    const cur = m.get(expKey) ?? { amt: 0, bucket };
    cur.amt += amt;
    m.set(expKey, cur);
    cardByPeriod.set(key, m);
  };

  for (const t of txns) {
    const key = periodKey(t.tx_at, unit);
    const mo = getMo(key);
    const c = t.category_id != null ? catMap.get(t.category_id) : undefined;
    const isCollected = t.source != null && COLLECTED_SOURCES.has(t.source);

    if (!c) {
      // 미분류(또는 삭제된 계정): 지출은 '미분류' 비용으로 EBIT 차감(유지). 단 입금은 대출·자본유입 등
      // 비매출일 수 있어 매출에 넣지 않고 별도(unclassifiedIn)로 분리 — 분류하면 정확한 계정으로 이동.
      // 과세여부를 모르므로 순액화 안 함(총액 그대로).
      mo.unclassifiedIn += t.amount_in;
      if (t.amount_out) {
        mo.sga += t.amount_out;
        mo.expense[UNCLASSIFIED] = (mo.expense[UNCLASSIFIED] || 0) + t.amount_out;
        expenseKeys.add(UNCLASSIFIED);
        if (t.is_card_payment) addCard(key, UNCLASSIFIED, 'sga', t.amount_out);
        else if (isCollected) collectedByPeriod.set(key, (collectedByPeriod.get(key) ?? 0) + t.amount_out);
      }
      continue;
    }

    // 매출은 POS(발생주의)에서 잡으므로 은행 매출 입금(revenue)은 손익 집계에 넣지 않음.
    // 비용 계정의 입금은 매입 환불(환입) — 잡손익이 아니라 해당 비용에서 차감해야
    // 재료비율·EBIT 구성이 정확하다(2026-08-17 미트박스 환불 건).
    if (c.type === 'cogs') {
      const amt = netAmt(t.amount_out, c) - netAmt(t.amount_in, c);
      mo.cogs += amt;
      const k = nameOf(c);
      mo.expense[k] = (mo.expense[k] || 0) + amt;
      expenseKeys.add(k);
      if (t.is_card_payment) addCard(key, k, 'cogs', amt);
      else if (isCollected) collectedByPeriod.set(key, (collectedByPeriod.get(key) ?? 0) + amt);
    } else if (c.type === 'sga') {
      // 부가세 납부(예수금 정산) — 매출이 공급가액(VAT 제외) 기준이라 지출로 잡으면 이중 차감.
      // 관리손익(pnl.ts is_vat_payment)과 같은 규칙으로 EBIT에서 제외(2026-08-21).
      if (t.is_vat_payment) continue;
      const amt = netAmt(t.amount_out, c) - netAmt(t.amount_in, c);
      mo.sga += amt;
      const k = nameOf(c);
      mo.expense[k] = (mo.expense[k] || 0) + amt;
      expenseKeys.add(k);
      if (t.is_card_payment) addCard(key, k, 'sga', amt);
      else if (isCollected) collectedByPeriod.set(key, (collectedByPeriod.get(key) ?? 0) + amt);
    } else if (c.type === 'non_operating') {
      mo.nonOp += netAmt(t.amount_in, c) - netAmt(t.amount_out, c);
    } else if (c.type === 'excluded' && c.name.includes('미상')) {
      // '미상'(용도 불명 보류) — 관리손익(pnl)·전처리1과 같은 규칙으로 지출에 포함해
      // 이익이 부풀려 보이지 않게 한다. 과세여부를 몰라 총액 그대로(순액화 안 함).
      const amt = t.amount_out - t.amount_in;
      mo.sga += amt;
      mo.expense['미상'] = (mo.expense['미상'] || 0) + amt;
      expenseKeys.add('미상');
    }
  }

  // 카드대금↔수집분 겹침 차감 — 월 단위만(일·주는 결제일/사용일이 어긋나 같은 칸에서 못 뺀다).
  // 카드대금이 실린 키(대개 '재료비')에서 비례로 빼 지출 구성도 함께 정확해진다.
  if (unit === 'month') {
    for (const [key, cardKeys] of Array.from(cardByPeriod.entries())) {
      const cardTotal = Array.from(cardKeys.values()).reduce((s, v) => s + v.amt, 0);
      const off = cardDupOffset(cardTotal, collectedByPeriod.get(key) ?? 0);
      if (off <= 0) continue;
      const mo = getMo(key);
      let applied = 0;
      for (const [k, v] of Array.from(cardKeys.entries())) {
        const cut = Math.round(off * (v.amt / cardTotal));
        mo.expense[k] = (mo.expense[k] || 0) - cut;
        if (v.bucket === 'cogs') mo.cogs -= cut;
        else mo.sga -= cut;
        applied += cut;
      }
      mo.cardDupOffset = applied;
    }
  }

  // 매출 = POS 공급가액(발생주의). 통장 입금 대신 판매 시점(sale_date) 기준으로 기간 귀속.
  for (const p of posSales) {
    getMo(periodKey(p.saleDate, unit)).revenue += p.supply;
  }

  const months = Array.from(m.values()).sort((a, b) => a.ym.localeCompare(b.ym));
  const feeRate = feeOpts ? (feeOpts.rate ?? CHANNEL_FEE_RATE) : 0;
  for (const mo of months) {
    // 채널수수료 — 실입력(월 키)이 있으면 그 값, 없으면 매출×추정율. 주 단위는 실입력이 월 단위라 항상 추정.
    mo.fee = feeOpts
      ? (unit === 'month' && feeOpts.channelFees?.[mo.ym] != null
          ? feeOpts.channelFees[mo.ym]
          : Math.round(mo.revenue * feeRate))
      : 0;
    mo.ebit = mo.revenue - mo.fee - mo.cogs - mo.sga;
    mo.net = mo.ebit + mo.nonOp;
    mo.costRatio = mo.revenue > 0 ? mo.cogs / mo.revenue : null;
    mo.profitRatio = mo.revenue > 0 ? mo.ebit / mo.revenue : null;
  }
  return { months, expenseKeys: Array.from(expenseKeys) };
}

// 감가상각(정액법): 자본적지출(인테리어·설비·초기투자)을 usefulMonths(기본 60=5년)로 나눠
// 지출한 달부터 매달 균등 배분한다. ym → 월 감가상각액 맵을 반환.
// 관리손익/EBIT엔 자본적지출이 통째로 빠져 있어 영업이익이 과대 → 이 상각액을 빼면 '실질'에 가까움.
export function capexDepreciation(txns: AggTx[], cats: AggCat[], usefulMonths = 60): Record<string, number> {
  const capexRoot = cats.find((c) => c.type === 'excluded' && c.name === '자본적지출' && c.parent_id == null);
  if (!capexRoot) return {};
  const capexIds = new Set<number>([capexRoot.id]);
  for (const c of cats) if (c.parent_id === capexRoot.id) capexIds.add(c.id);

  const addMonths = (ym: string, k: number): string => {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + k;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };

  const dep: Record<string, number> = {};
  for (const t of txns) {
    if (t.category_id == null || !capexIds.has(t.category_id) || !(t.amount_out > 0)) continue;
    const startYm = t.tx_at.slice(0, 7);
    const monthly = t.amount_out / usefulMonths;
    for (let k = 0; k < usefulMonths; k++) {
      const ym = addMonths(startYm, k);
      dep[ym] = (dep[ym] ?? 0) + monthly;
    }
  }
  for (const k of Object.keys(dep)) dep[k] = Math.round(dep[k]);
  return dep;
}

// 자본적지출 원금의 월별 합(상각 전) — 인센 시뮬레이션이 상각 개월수를 바꿔가며 재분산할 수
// 있게 지출 시점 그대로 넘긴다(2026-08-23 대표 결정: 인센 기준 = 손익 − 투자 상각, 개월수 가변).
export function capexByMonth(txns: AggTx[], cats: AggCat[]): Record<string, number> {
  const capexRoot = cats.find((c) => c.type === 'excluded' && c.name === '자본적지출' && c.parent_id == null);
  if (!capexRoot) return {};
  const capexIds = new Set<number>([capexRoot.id]);
  for (const c of cats) if (c.parent_id === capexRoot.id) capexIds.add(c.id);
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (t.category_id == null || !capexIds.has(t.category_id) || !(t.amount_out > 0)) continue;
    const ym = t.tx_at.slice(0, 7);
    out[ym] = (out[ym] ?? 0) + t.amount_out;
  }
  return out;
}
