// 페이히어(Payhere) POS 매출리포트 파서 — 스탭밀·가든 판교점이 사용.
// ✅ 실측 보정 완료(2026-07-31): '매장별 결제 내역(요약)_스탭밀_2025-07-01~2025-07-31.xlsx' 기준.
//
// 실측 형식 — 시트 '매장별 결제 내역(요약)', 헤더 행(index 6): No. · 영업일 · 결제(환불)일 ·
//   결제(환불)시간 · 결제 내역 · 합계 · 결제 금액 · 공급가액 · 부가세 · 할인 · 포인트 사용 ·
//   포인트 적립 · 선불권 사용 · 배달팁 · 결제 수단 · … · 결제 채널 · 배달앱 · 환급* …
// 검증된 규칙(2025-07 스탭밀 3,369건 실측):
//   - 매출액 = '결제 금액'(실수령·할인 반영·VAT 포함). 합계 = 결제 금액 + 할인이라 합계를 쓰면 과대.
//   - 공급가액·부가세 컬럼이 직접 제공됨(공급가액+부가세 = 결제 금액 정확 일치) → 그대로 사용.
//   - 환불은 음수 행 → 그대로 합산하면 net (토스와 동일).
//   - 식권(선불 식권) 판매 = 선수금이라 매출 제외. 사용 시점(결제수단 '기타' = 식권 차감,
//     2026-07-31 대표 확인)에 일반 메뉴 행으로 잡히므로 사용분은 자연히 포함된다.
//   - 카테고리 = '결제 내역'의 메뉴명 첫 토큰(옵션 괄호·'외 N건' 제거) — Staff/Newbie/금액 추가 등.
//   - 날짜 귀속 = '영업일'.
// 형식이 다른 페이히어 리포트(다른 내보내기 종류)는 헤더 자동탐지 폴백으로 시도한다.
import * as officeCrypto from 'officecrypto-tool';
import * as XLSX from 'xlsx';
import type { PosParseResult, PosDailyCat, PosCategoryAgg, PosItemRow, PosGiftRow } from './pos';

const isGiftItem = (item: string) => /식권|선불권|상품권|금액권/.test(item);

const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 엑셀 serial(1900 date system) 또는 문자열('2025-07-01', '2025.07.01 13:02') → 'YYYY-MM-DD'
function toYmd(v: unknown): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

// '결제 내역' → 카테고리(메뉴명): 'Staff (기본 / 매장) 외 1건' → 'Staff'
function categoryOf(item: string): string {
  const base = item.replace(/\s*외\s*\d+\s*건\s*$/, '').trim();
  const head = base.split('(')[0].trim();
  return head || '기타';
}

export interface PayhereParseResult extends PosParseResult {
  // 어떤 컬럼을 읽었는지 — 업로드 미리보기에서 확인용
  mapping: { sheet: string; header: Record<string, string> };
  /**
   * 원본 시트에서의 위치 — 파서가 이긴 시트의 raw 행을 담을 때 쓴다(로우데이터 레이어).
   * 세 파서(상품별·요약·자동탐지)가 각자 찾은 헤더 행·영업일 열을 여기에 실어 보낸다.
   */
  layout?: { headerRow: number; dateCol: number };
}

interface Agg {
  daily: Map<string, PosDailyCat>;
  gift: Map<string, PosGiftRow>; // 식권 판매(선수금) — 매출에선 빼되 pos_gift_sales 용으로 담는다
  excluded: { rows: number; gross: number; vat: number };
  ymCount: Map<string, number>;
  completed: number;
  canceled: number;
  dataRows: number;
}

const newAgg = (): Agg => ({
  daily: new Map(),
  gift: new Map(),
  excluded: { rows: 0, gross: 0, vat: 0 },
  ymCount: new Map(),
  completed: 0,
  canceled: 0,
  dataRows: 0,
});

function addGift(agg: Agg, saleDate: string, item: string, qty: number, gross: number) {
  const key = `${saleDate}|${item}`;
  const cur = agg.gift.get(key) ?? { ym: saleDate.slice(0, 7), saleDate, item, qty: 0, gross: 0 };
  cur.qty += qty;
  cur.gross += gross;
  agg.gift.set(key, cur);
}

function addRow(agg: Agg, saleDate: string, category: string, gross: number, vat: number, supply: number, qty: number) {
  const ym = saleDate.slice(0, 7);
  agg.ymCount.set(ym, (agg.ymCount.get(ym) ?? 0) + 1);
  const key = `${saleDate}|${category}`;
  const cur = agg.daily.get(key) ?? { ym, saleDate, category, qty: 0, gross: 0, vat: 0, supply: 0 };
  cur.qty += qty;
  cur.gross += gross;
  cur.vat += vat;
  cur.supply += supply;
  agg.daily.set(key, cur);
}

function finish(agg: Agg, sheet: string, header: Record<string, string>): PayhereParseResult {
  const out = Array.from(agg.daily.values()).sort(
    (a, b) => a.saleDate.localeCompare(b.saleDate) || a.category.localeCompare(b.category),
  );
  const catMap = new Map<string, PosCategoryAgg>();
  for (const d of out) {
    const c = catMap.get(d.category) ?? { category: d.category, qty: 0, gross: 0, vat: 0, supply: 0 };
    c.qty += d.qty;
    c.gross += d.gross;
    c.vat += d.vat;
    c.supply += d.supply;
    catMap.set(d.category, c);
  }
  const byCategory = Array.from(catMap.values()).sort((a, b) => b.supply - a.supply);
  const totals = out.reduce(
    (t, d) => ({ qty: t.qty + d.qty, gross: t.gross + d.gross, vat: t.vat + d.vat, supply: t.supply + d.supply }),
    { qty: 0, gross: 0, vat: 0, supply: 0 },
  );
  const yms = Array.from(agg.ymCount.keys()).sort();
  const ym = Array.from(agg.ymCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const giftRows = Array.from(agg.gift.values()).sort(
    (a, b) => a.saleDate.localeCompare(b.saleDate) || a.item.localeCompare(b.item),
  );
  return {
    ym,
    yms,
    rows: out,
    giftRows,
    byCategory,
    totals,
    excluded: agg.excluded,
    meta: { sheet, dataRows: agg.dataRows, completed: agg.completed, canceled: agg.canceled },
    mapping: { sheet, header },
  };
}

// ---------- 1) 실측 형식: '매장별 결제 내역(요약)' — 결제 단위 상세 ----------
function parseSummaryRows(rows: unknown[][], sheetName: string): PayhereParseResult | null {
  // 헤더 탐색: '영업일' + '결제금액'이 같은 행에 있으면 채택(상위 12행 내)
  let hdr = -1;
  let norm: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const n = (rows[i] ?? []).map((x) => String(x ?? '').replace(/\s+/g, ''));
    if (n.includes('영업일') && n.some((h) => h.includes('결제금액'))) {
      hdr = i;
      norm = n;
      break;
    }
  }
  if (hdr < 0) return null;

  const ix = (name: string) => norm.findIndex((h) => h === name);
  const ixLike = (name: string) => norm.findIndex((h) => h.includes(name));
  const iDate = ix('영업일');
  const iItem = ixLike('결제내역');
  const iPay = ixLike('결제금액');
  const iSupply = ixLike('공급가액');
  const iVat = ixLike('부가세');
  if (iDate < 0 || iPay < 0) return null;

  const agg = newAgg();
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const saleDate = toYmd(r[iDate]);
    if (!saleDate) continue; // 제목·합계·빈 행 스킵
    const gross = Math.round(num(r[iPay]));
    if (gross === 0) continue;
    agg.dataRows++;
    if (gross < 0) agg.canceled++;
    else agg.completed++;

    const item = iItem >= 0 ? String(r[iItem] ?? '').trim() : '';
    const vat = iVat >= 0 ? Math.round(num(r[iVat])) : Math.round(gross - gross / 1.1);
    const supply = iSupply >= 0 && num(r[iSupply]) !== 0 ? Math.round(num(r[iSupply])) : gross - vat;

    if (item && isGiftItem(item)) {
      // 식권 판매 = 선수금 → 매출 제외. 사용분은 결제수단 '기타'의 일반 메뉴 행으로 이미 잡힌다.
      agg.excluded.rows++;
      agg.excluded.gross += gross;
      agg.excluded.vat += vat;
      addGift(agg, saleDate, categoryOf(item), gross < 0 ? -1 : 1, gross);
      continue;
    }
    addRow(agg, saleDate, item ? categoryOf(item) : '기타', gross, vat, supply, gross < 0 ? -1 : 1);
  }
  if (agg.dataRows === 0) return null;

  return {
    ...finish(agg, sheetName, {
      날짜: '영업일',
      금액: '결제 금액(할인 반영·VAT 포함)',
      공급가액: iSupply >= 0 ? '공급가액' : '(없음 — 결제금액−부가세)',
      부가세: iVat >= 0 ? '부가세' : '(없음 — 과세 1/11 산출)',
      카테고리: iItem >= 0 ? '결제 내역(메뉴명)' : '(없음)',
      식권: '판매 제외(선수금) · 사용은 포함',
    }),
    layout: { headerRow: hdr, dateCol: iDate },
  };
}

// ---------- 1-1) 실측 형식: '상품 분석_상품별 조회(일자별)' — 상품 단위 상세(2026-08-09) ----------
// 결제 요약과 달리 실제 카테고리·상품명·수량이 행 단위로 나와 finance.pos_items(품목 리포트)를
// 판교도 채울 수 있다. 서브토탈 행('전체 합계'·'부분 분할결제'·'일자별 합계 : …')은 상품명 칸이
// 비어 있는 걸로 걸러낸다 — 안 걸러내면 그 날 상세행 합계 + 소계 행이 같이 잡혀 매출이 정확히
// 2배가 된다(2026-08-09 판교 2025-10~12 실측: 필터 전 ₩92,482,971 vs 실제 ₩46,445,639).
// VAT·공급가액 컬럼이 없어 과세 1/11 산출(다른 페이히어 폴백과 동일 규칙)로 근사한다.
function parseProductDetailRows(rows: unknown[][], sheetName: string): PayhereParseResult | null {
  let hdr = -1;
  let norm: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const n = (rows[i] ?? []).map((x) => String(x ?? '').replace(/\s+/g, ''));
    if (n.includes('영업일') && n.includes('상품명') && n.some((h) => h.includes('카테고리'))) {
      hdr = i;
      norm = n;
      break;
    }
  }
  if (hdr < 0) return null;

  const ix = (name: string) => norm.findIndex((h) => h === name);
  const ixLike = (name: string) => norm.findIndex((h) => h.includes(name));
  const iCat = ixLike('카테고리');
  const iProduct = ix('상품명');
  const iDate = ix('영업일');
  // '판매량'은 상품 상세행에선 대부분 비어 있고(집계용 컬럼으로 추정, 2026-08-09 실측: 판교
  // 8개월 7,151행 전부 0) '수량'에 실제 값이 들어있다 — '수량'을 우선하고 '판매량'은 보조로만.
  const iSold = ixLike('판매량');
  const iQtyCol = ix('수량');
  const iGross = ixLike('총매출');
  const iNet = ixLike('실매출');
  if (iCat < 0 || iProduct < 0 || iDate < 0 || (iGross < 0 && iNet < 0)) return null;

  const agg = newAgg();
  const itemAgg = new Map<string, PosItemRow>();
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const category = String(r[iCat] ?? '').trim();
    const product = String(r[iProduct] ?? '').trim();
    // 상품명이 비었거나 '합계' 라벨이 섞여 있으면 소계/합계 행 — 스킵
    if (!product || category.includes('합계') || product.includes('합계')) continue;
    const saleDate = toYmd(r[iDate]);
    if (!saleDate) continue;

    const net = iNet >= 0 ? num(r[iNet]) : num(r[iGross]);
    const gross = Math.round(net);
    const qtyCount = iQtyCol >= 0 ? num(r[iQtyCol]) : 0;
    const qtySold = iSold >= 0 ? num(r[iSold]) : 0;
    const qty = qtyCount !== 0 ? qtyCount : qtySold;
    if (gross === 0 && qty === 0) continue; // 완전 빈 행

    if (isGiftItem(product) || isGiftItem(category)) {
      const vatExcl = Math.round(gross - gross / 1.1);
      agg.excluded.rows++;
      agg.excluded.gross += gross;
      agg.excluded.vat += vatExcl;
      addGift(agg, saleDate, product, qty, gross);
      continue;
    }

    agg.dataRows++;
    if (gross < 0) agg.canceled++;
    else agg.completed++;
    const vat = Math.round(gross - gross / 1.1);
    const supply = gross - vat;
    const cat = category || '기타';
    addRow(agg, saleDate, cat, gross, vat, supply, qty);

    const key = `${saleDate}|${cat}|${product}`;
    const it =
      itemAgg.get(key) ?? { ym: saleDate.slice(0, 7), saleDate, category: cat, product, option: '', qty: 0, gross: 0, vat: 0, supply: 0 };
    it.qty += qty;
    it.gross += gross;
    it.vat += vat;
    it.supply += supply;
    itemAgg.set(key, it);
  }
  if (agg.dataRows === 0) return null;

  const base = finish(agg, sheetName, {
    날짜: '영업일',
    금액: iNet >= 0 ? '실매출(총매출−할인)' : '총 매출',
    부가세: '(없음 — 과세 1/11 산출)',
    카테고리: '카테고리명',
    상품명: '상품명',
    수량: iQtyCol >= 0 ? '수량(비어있으면 판매량)' : '판매량',
  });
  const items = Array.from(itemAgg.values()).sort(
    (a, b) =>
      a.saleDate.localeCompare(b.saleDate) || a.category.localeCompare(b.category) || a.product.localeCompare(b.product),
  );
  return { ...base, items, layout: { headerRow: hdr, dateCol: iDate } };
}

// ---------- 2) 폴백: 헤더 자동탐지(다른 내보내기 형식 대비) ----------
const DATE_HEADERS = ['영업일', '결제일시', '주문일시', '거래일시', '판매일시', '판매일자', '영업일자', '일자', '날짜'];
const AMOUNT_HEADERS = ['결제금액', '실매출', '실판매금액', '판매금액', '총매출', '합계금액', '금액'];
const VAT_HEADERS = ['부가세액', '부가세', 'VAT'];
const CAT_HEADERS = ['카테고리', '상품분류', '메뉴분류', '분류', '결제내역', '상품명'];
const QTY_HEADERS = ['판매수량', '수량', '개수'];
const STATE_HEADERS = ['결제상태', '취소여부', '상태'];

function parseGenericRows(rows: unknown[][], sheetName: string): PayhereParseResult | null {
  const findIdx = (norm: string[], cands: string[]) => {
    for (const c of cands) {
      const i = norm.findIndex((h) => h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  let loc: { hdr: number; date: number; amount: number; vat: number; category: number; qty: number; state: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const norm = (rows[i] ?? []).map((x) => String(x ?? '').replace(/\s+/g, ''));
    const date = findIdx(norm, DATE_HEADERS);
    const amount = findIdx(norm, AMOUNT_HEADERS);
    if (date >= 0 && amount >= 0) {
      loc = {
        hdr: i,
        date,
        amount,
        vat: findIdx(norm, VAT_HEADERS),
        category: findIdx(norm, CAT_HEADERS),
        qty: findIdx(norm, QTY_HEADERS),
        state: findIdx(norm, STATE_HEADERS),
      };
      break;
    }
  }
  if (!loc) return null;
  const hdrRow = (rows[loc.hdr] ?? []).map((x) => String(x ?? '').trim());
  const headerOf = (i: number) => (i >= 0 ? hdrRow[i] ?? '' : '(없음)');

  const agg = newAgg();
  for (let i = loc.hdr + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const saleDate = toYmd(r[loc.date]);
    if (!saleDate) continue;
    let gross = Math.round(num(r[loc.amount]));
    if (gross === 0) continue;
    agg.dataRows++;
    const state = loc.state >= 0 ? String(r[loc.state] ?? '').trim() : '';
    const isCancel = /취소|환불/.test(state) || gross < 0;
    if (isCancel) {
      agg.canceled++;
      if (gross > 0) gross = -gross; // 취소가 양수 표기인 파일 방어
    } else {
      agg.completed++;
    }
    const rawCat = loc.category >= 0 ? String(r[loc.category] ?? '').trim() : '';
    if (rawCat && isGiftItem(rawCat)) {
      agg.excluded.rows++;
      agg.excluded.gross += gross;
      addGift(agg, saleDate, categoryOf(rawCat), isCancel ? -1 : 1, gross);
      continue;
    }
    let vat = loc.vat >= 0 ? Math.round(num(r[loc.vat])) : Math.round(gross - gross / 1.1);
    if (isCancel && vat > 0) vat = -vat;
    const qty = loc.qty >= 0 ? num(r[loc.qty]) : isCancel ? -1 : 1;
    addRow(agg, saleDate, rawCat ? categoryOf(rawCat) : '기타', gross, vat, gross - vat, qty);
  }
  if (agg.dataRows === 0) return null;

  return {
    ...finish(agg, sheetName, {
      날짜: headerOf(loc.date),
      금액: headerOf(loc.amount),
      부가세: loc.vat >= 0 ? headerOf(loc.vat) : '(없음 — 과세 1/11 산출)',
      카테고리: headerOf(loc.category),
      수량: headerOf(loc.qty),
      상태: headerOf(loc.state),
    }),
    layout: { headerRow: loc.hdr, dateCol: loc.date },
  };
}

async function decryptIfNeeded(data: Uint8Array | Buffer, password: string): Promise<Buffer> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (officeCrypto.isEncrypted(buf)) {
    return officeCrypto.decrypt(buf, { password });
  }
  return buf;
}

// 진입점: xlsx 버퍼 → 실측 형식 우선, 실패 시 자동탐지 폴백. 시트 전체 중 데이터행 최다 채택.
export async function parsePayhereXlsx(
  data: Uint8Array | ArrayBuffer | Buffer,
  password = '',
): Promise<PayhereParseResult> {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array | Buffer);
  const decrypted = await decryptIfNeeded(bytes, password || '0000');
  const wb = XLSX.read(decrypted, { type: 'buffer' });

  let best: PayhereParseResult | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
    const r = parseProductDetailRows(rows, name) ?? parseSummaryRows(rows, name) ?? parseGenericRows(rows, name);
    if (r && (!best || r.meta.dataRows > best.meta.dataRows)) {
      // 이긴 시트의 원본 행을 그대로 싣는다(로우데이터 레이어 적재용). 날짜는 파서가 찾은
      // 영업일 열에서 행별로 뽑아 함께 보낸다 — 소계·메타 행은 날짜가 null 로 남는다.
      const dateCol = r.layout?.dateCol ?? -1;
      best = {
        ...r,
        raw: {
          rows,
          header: r.layout != null ? (rows[r.layout.headerRow] ?? null) : null,
          dates: rows.map((row) => (dateCol >= 0 ? toYmd(row?.[dateCol]) : null)),
        },
      };
    }
  }
  if (!best || best.rows.length === 0) {
    throw new Error(
      "페이히어 매출 컬럼(영업일·결제 금액)을 찾지 못했어요. 페이히어 '매장별 결제 내역(요약)' 엑셀인지 확인해주세요.",
    );
  }
  return best;
}
