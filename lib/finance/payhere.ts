// 페이히어(Payhere) POS 매출리포트 파서 — 스탭밀·가든 판교점이 사용.
// ⚠️ 실파일 샘플 검증 전 잠정 버전(2026-07-28): 페이히어 엑셀의 정확한 시트/컬럼명을 아직 확보하지
// 못해, 헤더 자동탐지로 유연하게 읽는다. 샘플 확보 즉시 실측 컬럼으로 보정할 것.
//   - 모든 시트를 훑어 날짜 컬럼 + 금액 컬럼이 있는 헤더 행을 찾는다(상위 10행 내).
//   - 컬럼 후보(공백 제거 후 부분일치):
//       날짜: 결제일시/주문일시/거래일시/판매일시/판매일자/영업일자/일자/날짜
//       금액(VAT포함 실매출): 실매출/실판매금액/결제금액/판매금액/총매출/합계금액/금액
//       부가세: 부가세/부가세액/VAT — 없으면 과세 가정 gross×1/11 로 산출
//       카테고리: 카테고리/분류/상품분류/메뉴분류 — 없으면 '기타'
//       수량: 수량/판매수량/개수
//       상태: 결제상태/상태/취소여부 — '취소/환불' 행은 금액이 양수면 음수로 뒤집어 net 합산
//       과세여부: 과세여부/면세여부 — '면세'면 부가세 0
//   - 집계 결과 형태는 토스 파서(PosParseResult)와 동일 → pos_sales 파이프라인 공유.
import * as officeCrypto from 'officecrypto-tool';
import * as XLSX from 'xlsx';
import type { PosParseResult, PosDailyCat, PosCategoryAgg } from './pos';

const DATE_HEADERS = ['결제일시', '주문일시', '거래일시', '판매일시', '판매일자', '영업일자', '일자', '날짜'];
const AMOUNT_HEADERS = ['실매출', '실판매금액', '결제금액', '판매금액', '총매출', '합계금액', '금액'];
const VAT_HEADERS = ['부가세액', '부가세', 'VAT'];
const CAT_HEADERS = ['카테고리', '상품분류', '메뉴분류', '분류'];
const QTY_HEADERS = ['판매수량', '수량', '개수'];
const STATE_HEADERS = ['결제상태', '취소여부', '상태'];
const TAXABLE_HEADERS = ['과세여부', '면세여부'];

const isGiftCategory = (c: string) => /금액권|선불권|상품권/.test(c);

const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 엑셀 serial(1900 date system) 또는 문자열('2026-07-01', '2026.07.01 13:02') → 'YYYY-MM-DD'
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

interface ColumnMap {
  hdr: number;
  date: number;
  amount: number;
  vat: number;
  category: number;
  qty: number;
  state: number;
  taxable: number;
}

// 헤더 행 탐색 — 날짜 후보 + 금액 후보가 같은 행에 있으면 채택.
function locateColumns(rows: unknown[][]): ColumnMap | null {
  const findIdx = (norm: string[], cands: string[]) => {
    for (const c of cands) {
      const i = norm.findIndex((h) => h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const norm = (rows[i] ?? []).map((x) => String(x ?? '').replace(/\s+/g, ''));
    const date = findIdx(norm, DATE_HEADERS);
    const amount = findIdx(norm, AMOUNT_HEADERS);
    if (date >= 0 && amount >= 0) {
      return {
        hdr: i,
        date,
        amount,
        vat: findIdx(norm, VAT_HEADERS),
        category: findIdx(norm, CAT_HEADERS),
        qty: findIdx(norm, QTY_HEADERS),
        state: findIdx(norm, STATE_HEADERS),
        taxable: findIdx(norm, TAXABLE_HEADERS),
      };
    }
  }
  return null;
}

export interface PayhereParseResult extends PosParseResult {
  // 자동탐지가 실제로 어떤 컬럼을 잡았는지 — 샘플 검증 전이라 미리보기에서 확인용
  mapping: { sheet: string; header: Record<string, string> };
}

export function parsePayhereRows(rows: unknown[][], sheetName: string): PayhereParseResult | null {
  const loc = locateColumns(rows);
  if (!loc) return null;

  const hdrRow = (rows[loc.hdr] ?? []).map((x) => String(x ?? '').trim());
  const headerOf = (i: number) => (i >= 0 ? hdrRow[i] ?? '' : '(없음)');

  const daily = new Map<string, PosDailyCat>();
  const excluded = { rows: 0, gross: 0, vat: 0 };
  const ymCount = new Map<string, number>();
  let completed = 0;
  let canceled = 0;
  let dataRows = 0;

  for (let i = loc.hdr + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const saleDate = toYmd(r[loc.date]);
    if (!saleDate) continue; // 합계·설명·빈 행 스킵

    let gross = Math.round(num(r[loc.amount]));
    if (gross === 0) continue;
    dataRows++;

    const state = loc.state >= 0 ? String(r[loc.state] ?? '').trim() : '';
    const isCancel = /취소|환불/.test(state);
    if (isCancel) {
      canceled++;
      // 취소 행이 양수 표기면 음수로 뒤집어 net 합산(토스는 원본이 음수 — 파일별 차이 방어)
      if (gross > 0) gross = -gross;
    } else {
      completed++;
    }

    const category = loc.category >= 0 ? String(r[loc.category] ?? '').trim() || '기타' : '기타';
    if (isGiftCategory(category)) {
      excluded.rows++;
      excluded.gross += gross;
      continue; // 상품권=선수금, 매출 제외(토스와 동일 정책)
    }

    // 부가세: 컬럼이 있으면 그대로, 없으면 과세 가정 1/11 (면세 표기가 있으면 0)
    const taxFlag = loc.taxable >= 0 ? String(r[loc.taxable] ?? '') : '';
    const isTaxFree = /면세/.test(taxFlag) && !/과세/.test(taxFlag);
    let vat: number;
    if (loc.vat >= 0) {
      vat = Math.round(num(r[loc.vat]));
      if (isCancel && vat > 0) vat = -vat;
    } else {
      vat = isTaxFree ? 0 : Math.round(gross - gross / 1.1);
    }

    const ym = saleDate.slice(0, 7);
    ymCount.set(ym, (ymCount.get(ym) ?? 0) + 1);

    const key = `${saleDate}|${category}`;
    const cur = daily.get(key) ?? { ym, saleDate, category, qty: 0, gross: 0, vat: 0, supply: 0 };
    const qty = loc.qty >= 0 ? num(r[loc.qty]) : 1;
    cur.qty += isCancel && qty > 0 ? -qty : qty;
    cur.gross += gross;
    cur.vat += vat;
    cur.supply += gross - vat;
    daily.set(key, cur);
  }

  const out = Array.from(daily.values()).sort(
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
  const yms = Array.from(ymCount.keys()).sort();
  const ym = Array.from(ymCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return {
    ym,
    yms,
    rows: out,
    byCategory,
    totals,
    excluded,
    meta: { sheet: sheetName, dataRows, completed, canceled },
    mapping: {
      sheet: sheetName,
      header: {
        날짜: headerOf(loc.date),
        금액: headerOf(loc.amount),
        부가세: loc.vat >= 0 ? headerOf(loc.vat) : '(없음 — 과세 1/11 산출)',
        카테고리: headerOf(loc.category),
        수량: headerOf(loc.qty),
        상태: headerOf(loc.state),
      },
    },
  };
}

async function decryptIfNeeded(data: Uint8Array | Buffer, password: string): Promise<Buffer> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (officeCrypto.isEncrypted(buf)) {
    return officeCrypto.decrypt(buf, { password });
  }
  return buf;
}

// 진입점: xlsx 버퍼 → 시트 전체를 훑어 가장 매출다운(집계행 많은) 시트 채택.
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
    const r = parsePayhereRows(rows, name);
    if (r && (!best || r.meta.dataRows > best.meta.dataRows)) best = r;
  }
  if (!best || best.rows.length === 0) {
    throw new Error(
      '페이히어 매출 컬럼(날짜·금액)을 찾지 못했어요. 페이히어에서 내려받은 매출 리포트 엑셀인지 확인해주세요. ' +
        '(파일 형식이 다르면 파일을 공유해주세요 — 파서를 맞춰 보정합니다)',
    );
  }
  return best;
}
