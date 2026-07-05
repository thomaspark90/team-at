// 토스(토스플레이스) POS 매출리포트 파서 — '상품 주문 상세내역' 시트를 발생주의 매출로 집계.
// 실측 컬럼(헤더행 index 0, 설명행 index 1, 데이터 index 2~):
//   주문기준일자(엑셀 serial) · 결제상태(완료/취소) · 주문시작시각 · 주문채널(포스) · 주문번호 ·
//   상품명 · 상품코드 · 카테고리(COFFEE/BAKERY/…) · 옵션 · … · 수량 · … ·
//   실판매금액(할인,옵션 포함=VAT포함) · 과세여부 · 부가세액
// 규칙:
//   - 파일 암호화(비번 0000) → officecrypto-tool로 복호화(무암호 파일이면 그대로 사용)
//   - 취소행은 값이 이미 음수 → 그대로 합산하면 net
//   - 상품권(카테고리 금액권별/선불권/상품권)은 선수금 → 매출 제외(실사용은 품목행에 이미 잡힘)
//   - 공급가액 = 실판매금액 − 부가세액 (면세=부가세 0)
//   - (주문기준일자, 카테고리) 단위 집계 → finance.pos_sales
import * as officeCrypto from 'officecrypto-tool';
import * as XLSX from 'xlsx';

export interface PosDailyCat {
  ym: string; // '2026-06'
  saleDate: string; // '2026-06-02'
  category: string; // COFFEE / BAKERY / …
  qty: number;
  gross: number; // 실판매금액 합(VAT 포함)
  vat: number; // 부가세액 합
  supply: number; // 공급가액 = gross − vat
}

export interface PosCategoryAgg {
  category: string;
  qty: number;
  gross: number;
  vat: number;
  supply: number;
}

export interface PosParseResult {
  ym: string; // 대표 월(가장 많은 행이 속한 월)
  yms: string[]; // 파일에 존재하는 모든 월(보통 1개)
  rows: PosDailyCat[]; // (일 × 카테고리) 집계 — pos_sales 삽입용
  byCategory: PosCategoryAgg[]; // 월 카테고리 요약
  totals: { qty: number; gross: number; vat: number; supply: number };
  excluded: { rows: number; gross: number; vat: number }; // 제외된 상품권
  meta: { sheet: string; dataRows: number; completed: number; canceled: number };
}

const SHEET_NAME = '상품 주문 상세내역';
const isGiftCategory = (c: string) => /금액권|선불권|상품권/.test(c);

// 엑셀 serial(1900 date system) → 'YYYY-MM-DD'
function serialToYmd(serial: number): string {
  // 1899-12-30을 기준일로(엑셀 1900 윤년 버그 보정). 시각 소수부는 버림.
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 헤더행을 찾아 컬럼 위치를 매핑(순서 변화·공백/개행에 강건).
function locateColumns(rows: unknown[][]): { hdr: number; ci: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const norm = (rows[i] ?? []).map((x) => String(x ?? '').replace(/\s+/g, ''));
    if (norm.includes('주문기준일자') && norm.includes('카테고리') && norm.some((h) => h.includes('실판매금액'))) {
      return {
        hdr: i,
        ci: {
          date: norm.indexOf('주문기준일자'),
          state: norm.indexOf('결제상태'),
          channel: norm.indexOf('주문채널'),
          name: norm.indexOf('상품명'),
          category: norm.indexOf('카테고리'),
          qty: norm.indexOf('수량'),
          amount: norm.findIndex((h) => h.includes('실판매금액')),
          taxable: norm.indexOf('과세여부'),
          vat: norm.indexOf('부가세액'),
        },
      };
    }
  }
  return null;
}

// rows = 시트 전체(헤더 포함). 상품권 제외 + (일×카테고리) 집계.
export function parsePosRows(rows: unknown[][]): PosParseResult {
  const loc = locateColumns(rows);
  if (!loc) {
    return {
      ym: '',
      yms: [],
      rows: [],
      byCategory: [],
      totals: { qty: 0, gross: 0, vat: 0, supply: 0 },
      excluded: { rows: 0, gross: 0, vat: 0 },
      meta: { sheet: SHEET_NAME, dataRows: 0, completed: 0, canceled: 0 },
    };
  }
  const { ci } = loc;
  const daily = new Map<string, PosDailyCat>(); // key = saleDate|category
  const excluded = { rows: 0, gross: 0, vat: 0 };
  const ymCount = new Map<string, number>();
  let completed = 0;
  let canceled = 0;
  let dataRows = 0;

  for (let i = loc.hdr + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rawDate = r[ci.date];
    if (typeof rawDate !== 'number' || rawDate <= 0) continue; // 설명행·빈행·합계행 스킵
    dataRows++;

    const gross = Math.round(num(r[ci.amount]));
    const vat = Math.round(num(r[ci.vat]));
    const category = String(r[ci.category] ?? '').trim() || '기타';

    if (isGiftCategory(category)) {
      excluded.rows++;
      excluded.gross += gross;
      excluded.vat += vat;
      continue; // 상품권=선수금, 매출 제외
    }

    if (String(r[ci.state] ?? '').trim() === '취소') canceled++;
    else completed++;

    const saleDate = serialToYmd(rawDate);
    const ym = saleDate.slice(0, 7);
    ymCount.set(ym, (ymCount.get(ym) ?? 0) + 1);

    const key = `${saleDate}|${category}`;
    const cur =
      daily.get(key) ?? { ym, saleDate, category, qty: 0, gross: 0, vat: 0, supply: 0 };
    cur.qty += num(r[ci.qty]);
    cur.gross += gross;
    cur.vat += vat;
    cur.supply += gross - vat;
    daily.set(key, cur);
  }

  const out = Array.from(daily.values()).sort(
    (a, b) => a.saleDate.localeCompare(b.saleDate) || a.category.localeCompare(b.category),
  );

  // 카테고리 요약
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
    meta: { sheet: SHEET_NAME, dataRows, completed, canceled },
  };
}

// 암호화 xlsx면 복호화, 아니면 원본 그대로.
async function decryptIfNeeded(data: Uint8Array | Buffer, password: string): Promise<Buffer> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (officeCrypto.isEncrypted(buf)) {
    return officeCrypto.decrypt(buf, { password });
  }
  return buf;
}

// 진입점: (암호화)xlsx 버퍼 + 비번 → 파싱 결과.
export async function parsePosXlsx(
  data: Uint8Array | ArrayBuffer | Buffer,
  password = '0000',
): Promise<PosParseResult> {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array | Buffer);
  const decrypted = await decryptIfNeeded(bytes, password);
  const wb = XLSX.read(decrypted, { type: 'buffer' });
  const ws = wb.Sheets[SHEET_NAME] ?? wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
  if (!ws) throw new Error(`'${SHEET_NAME}' 시트를 찾을 수 없어요.`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
  return parsePosRows(rows);
}
