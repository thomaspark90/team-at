// 관리손익(발생주의) 계산 — POS 공급가액 매출 + 거래분류 지출 + 월별 기말재고.
// PRD: docs/prd-pos-pnl.md (Q6 지출매핑 / Q7 재료비 2분할·기말재고 / Q8 지표)
//
// 매출  = Σ pos_sales.supply (공급가액, VAT 제외)  ← 채널수수료는 후속(=0)
// 재료비 = 기초(전월 기말) + 당월매입(cogs) − 기말      ← 기말 미입력 월은 '매입 그대로'
//   식자재 = cogs 중 포장재 외 전부 / 포장소모품 = cogs 포장재
// 인건비 = sga '인건비'(+하위)   ·  고정비 = sga 나머지  ·  미분류 = category 없는 유출(경고)
// 영업외·손익제외(카드대금정산/영수증분해 포함) = 관리손익 제외
// VAT: 매출은 POS 공급가액(VAT 제외). 지출도 대칭 위해 과세 매입은 공급가액(÷1.1)으로 순액 처리.
import { VAT_DIVISOR } from './aggregate';

export interface PnlCat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
  vat_taxable?: boolean; // 과세 매입이면 순액(÷1.1) 대상. 미지정=과세로 간주(안전 기본값)
}
export interface PnlTx {
  category_id: number | null;
  amount_in: number;
  amount_out: number;
}
export interface PnlPosRow {
  ym: string;
  category: string;
  qty: number;
  gross: number;
  vat: number;
  supply: number;
}
export type InvKind = '식자재' | '포장소모품';
export interface PnlInventory {
  ym: string;
  kind: InvKind;
  amount: number;
}

export interface CogsKind {
  기초: number;
  매입: number;
  기말: number;
  재료비: number;
  기말입력: boolean;
}
export interface PnlResult {
  ym: string;
  sales: {
    gross: number;
    vat: number;
    supply: number;
    byCategory: { category: string; qty: number; supply: number }[];
  };
  channelFee: { amount: number; estimated: boolean }; // 채널수수료(카드·간편결제 등). estimated=추정
  netSales: number; // 순매출 = 공급가액 − 채널수수료
  cogs: { 식자재: CogsKind; 포장소모품: CogsKind; total: number; invMissing: boolean };
  grossProfit: number; // 매출총이익 = 순매출 − 재료비
  labor: number; // 인건비
  fixed: number; // 고정비(나머지 판관비)
  unclassified: number; // 미분류 유출(경고)
  operatingProfit: number; // 영업이익(EBIT 근사)
  metrics: {
    foodCostRate: number; // 식자재원가율 = 식자재재료비 / 매출
    materialRate: number; // 전체 재료율 = 재료비 / 매출
    laborRate: number; // 인건비율
    primeCost: number; // (식자재 + 인건비) / 매출
    grossMargin: number; // 매출총이익률
  };
}

// 'YYYY-MM' → 직전 월
export function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return `${d.y}-${String(d.m).padStart(2, '0')}`;
}

const kindOf = (cat: PnlCat): InvKind => (cat.name === '포장재' ? '포장소모품' : '식자재');

// 채널수수료 추정 기본율(정산서 실제 금액 미입력 시) — 토스 POS(카드+간편결제) 블렌디드 근사.
// 실제 금액을 입력하면 이 추정은 무시된다.
export const CHANNEL_FEE_RATE = 0.017;

export function buildPnl(
  ym: string,
  data: { pos: PnlPosRow[]; txns: PnlTx[]; cats: PnlCat[]; inventory: PnlInventory[]; channelFee?: number | null },
): PnlResult {
  const { pos, txns, cats, inventory } = data;
  const byId = new Map(cats.map((c) => [c.id, c]));
  // 인건비 대분류 id 집합(자기 자신 + 하위)
  const laborRoot = cats.find((c) => c.type === 'sga' && c.name === '인건비' && c.parent_id == null);
  const laborIds = new Set<number>();
  if (laborRoot) {
    laborIds.add(laborRoot.id);
    for (const c of cats) if (c.parent_id === laborRoot.id) laborIds.add(c.id);
  }

  // ---- 매출(POS 공급가액) ----
  const posYm = pos.filter((p) => p.ym === ym);
  const sales = { gross: 0, vat: 0, supply: 0, byCategory: [] as { category: string; qty: number; supply: number }[] };
  const catMap = new Map<string, { category: string; qty: number; supply: number }>();
  for (const p of posYm) {
    sales.gross += p.gross;
    sales.vat += p.vat;
    sales.supply += p.supply;
    const c = catMap.get(p.category) ?? { category: p.category, qty: 0, supply: 0 };
    c.qty += p.qty;
    c.supply += p.supply;
    catMap.set(p.category, c);
  }
  sales.byCategory = Array.from(catMap.values()).sort((a, b) => b.supply - a.supply);

  // ---- 지출(거래분류) ----
  let 식자재매입 = 0;
  let 포장매입 = 0;
  let labor = 0;
  let fixed = 0;
  let unclassified = 0;
  for (const t of txns) {
    const gross = (t.amount_out || 0) - (t.amount_in || 0); // 환불 반영(순 지출)
    if (t.category_id == null) {
      // 미분류는 과세여부를 모르므로 총액 그대로(순액화 안 함)
      if ((t.amount_out || 0) > 0) unclassified += t.amount_out;
      continue;
    }
    const c = byId.get(t.category_id);
    if (!c) continue;
    // 과세 매입은 공급가액(÷1.1)으로 순액 — 매출(공급가액)과 기준 통일. 면세(인건비·이자·세금 등)는 그대로.
    const net = c.vat_taxable !== false ? Math.round(gross / VAT_DIVISOR) : gross;
    if (c.type === 'cogs') {
      if (kindOf(c) === '포장소모품') 포장매입 += net;
      else 식자재매입 += net;
    } else if (c.type === 'sga') {
      if (laborIds.has(c.id)) labor += net;
      else fixed += net;
    }
    // non_operating / excluded 는 관리손익 제외
  }

  // ---- 재료비(발생주의: 기초 + 매입 − 기말) ----
  const invAmt = (y: string, k: InvKind) => inventory.find((i) => i.ym === y && i.kind === k)?.amount;
  // 기초 = 이월(carry-forward): 이번 달 이전 중 '가장 최근에 입력된 기말'을 소급.
  // 매달 안 넣어도 분기 1회 입력값이 앞뒤 달로 제대로 이어지게 함.
  const 기초Amt = (k: InvKind) => {
    const prior = inventory
      .filter((i) => i.kind === k && i.ym < ym)
      .sort((a, b) => b.ym.localeCompare(a.ym))[0];
    return prior?.amount ?? 0;
  };
  const buildKind = (k: InvKind, 매입: number): CogsKind => {
    const 기말 = invAmt(ym, k);
    const 기초 = 기초Amt(k);
    const 기말입력 = 기말 != null;
    // 기말 미입력이면 재료비=당월매입(그대로), 기초/기말 미적용
    const 재료비 = 기말입력 ? 기초 + 매입 - (기말 as number) : 매입;
    return { 기초, 매입, 기말: 기말 ?? 0, 재료비, 기말입력 };
  };
  const 식자재 = buildKind('식자재', 식자재매입);
  const 포장소모품 = buildKind('포장소모품', 포장매입);
  const cogsTotal = 식자재.재료비 + 포장소모품.재료비;
  const invMissing = !식자재.기말입력 || !포장소모품.기말입력;

  // 채널수수료: 입력값 있으면 실제, 없으면 공급가액×기본율 추정. 순매출 = 공급가액 − 채널수수료.
  const feeAmount = data.channelFee != null ? data.channelFee : Math.round(sales.supply * CHANNEL_FEE_RATE);
  const netSales = sales.supply - feeAmount;
  const grossProfit = netSales - cogsTotal;
  const operatingProfit = grossProfit - labor - fixed - unclassified;

  const div = (n: number) => (sales.supply > 0 ? n / sales.supply : 0);
  return {
    ym,
    sales,
    channelFee: { amount: feeAmount, estimated: data.channelFee == null },
    netSales,
    cogs: { 식자재, 포장소모품, total: cogsTotal, invMissing },
    grossProfit,
    labor,
    fixed,
    unclassified,
    operatingProfit,
    metrics: {
      foodCostRate: div(식자재.재료비),
      materialRate: div(cogsTotal),
      laborRate: div(labor),
      primeCost: div(식자재.재료비 + labor),
      grossMargin: div(grossProfit),
    },
  };
}

// 지표 벤치마크 → 신호(good/warn/bad). 색은 화면에서 매핑.
// 재료율 28~35% · 인건비 25~30% · Prime ≤55~60% (초과=경고/위험)
export type Signal = 'good' | 'warn' | 'bad';
export function benchmark(kind: 'food' | 'labor' | 'prime', rate: number): Signal {
  const pct = rate * 100;
  if (kind === 'food') return pct <= 32 ? 'good' : pct <= 38 ? 'warn' : 'bad';
  if (kind === 'labor') return pct <= 28 ? 'good' : pct <= 33 ? 'warn' : 'bad';
  return pct <= 58 ? 'good' : pct <= 65 ? 'warn' : 'bad'; // prime
}
