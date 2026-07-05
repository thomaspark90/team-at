// 신한카드 이용내역(엑셀) 파서 — 사업자카드 사용내역을 거래로 변환.
// 실측 파일 컬럼: 거래일 · 카드구분 · 이용카드 · 가맹점명 · 업종 · 승인번호 · 금액 ·
//   매입구분 · 이용구분 · 거래통화 · 최초결제일자 · 해외이용금액 · 취소상태
// 규칙: 마지막 '총 N건' 합계행(거래일 빈칸)은 스킵. 음수 금액(부분취소)은 카드 크레딧(입금).
import { createHash } from 'crypto';
import * as XLSX from 'xlsx';
import type { ParsedTransaction, ParseResult } from './types';
import { normalizeKey } from './normalize';

const hash = (...parts: (string | number)[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);

// "2026.06.30 21:08" (또는 Date) → { iso, ym }. 합계행 등 파싱 실패 시 null.
function parseCardDate(v: unknown): { iso: string; ym: string } | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0');
    const iso = `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
    return { iso, ym: iso.slice(0, 7) };
  }
  const m = /^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v).trim());
  if (!m) return null;
  const [, Y, Mo, D, H = '00', Mi = '00', Se = '00'] = m;
  return { iso: `${Y}-${Mo}-${D}T${H}:${Mi}:${Se}`, ym: `${Y}-${Mo}` };
}

// 헤더명으로 컬럼 위치를 잡아 순서 변화에 강건. rows = 시트 전체(헤더 포함).
export function parseCardRows(rows: unknown[][], issuer = '신한'): ParsedTransaction[] {
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = (rows[i] ?? []).map((x) => String(x ?? '').trim());
    if (r.includes('거래일') && r.includes('가맹점명') && r.includes('금액')) {
      h = i;
      break;
    }
  }
  if (h < 0) return [];
  const hdr = rows[h].map((x) => String(x ?? '').trim());
  const ci = {
    date: hdr.indexOf('거래일'),
    merchant: hdr.indexOf('가맹점명'),
    amount: hdr.indexOf('금액'),
    approval: hdr.indexOf('승인번호'),
    use: hdr.indexOf('이용구분'),
  };

  const out: ParsedTransaction[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const dt = parseCardDate(r[ci.date]);
    if (!dt) continue; // 합계('총 N건')·빈 행 스킵
    const merchant = String(r[ci.merchant] ?? '').trim();
    const raw = r[ci.amount];
    const amt = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[,\s원]/g, '')) || 0;
    if (amt === 0 && !merchant) continue;
    const use = String(r[ci.use] ?? '').trim();
    const approval = String(r[ci.approval] ?? '').trim();
    const amountOut = amt >= 0 ? Math.round(amt) : 0;
    const amountIn = amt < 0 ? Math.round(-amt) : 0; // 부분취소=카드 크레딧
    out.push({
      bank: 'shinhan', // enum 유지용(발급사 은행). 구분은 source
      source: 'card',
      cardIssuer: issuer,
      isInstallment: /할부/.test(use),
      approvalNo: approval || undefined,
      txAt: dt.iso,
      ym: dt.ym,
      channel: use, // 일시불/할부/해외일시불 — 분류엔 안 씀
      memo: merchant,
      amountOut,
      amountIn,
      balance: 0, // 카드는 잔액 없음
      branch: null,
      dedupHash: hash('card', issuer, approval, dt.iso, amt, merchant),
      normalizedKey: normalizeKey(merchant),
    });
  }
  return out;
}

export function parseCardXlsx(data: Uint8Array | ArrayBuffer, issuer = '신한'): ParseResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
  const transactions = parseCardRows(rows, issuer);
  return {
    bank: 'shinhan',
    transactions,
    totalRows: transactions.length,
    sumIn: transactions.reduce((s, t) => s + t.amountIn, 0),
    sumOut: transactions.reduce((s, t) => s + t.amountOut, 0),
  };
}
