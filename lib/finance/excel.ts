// 회계자료 엑셀(.xlsx/.xls/.csv) → 거래 배열.
// 양식이 제각각이라 열 배치는 Gemini 가 판정(헤더+샘플만 전송)하고, 변환은 전 행 로컬에서 한다.
// 같은 파일의 미리보기/저장이 어긋나지 않도록 판정된 매핑(mapping)을 클라이언트가 저장 요청에 되돌려준다.

import * as XLSX from 'xlsx';
import type { ParsedTransaction, ParseResult } from './types';
import { normalizeKey } from './normalize';
import { hash } from './dedup';

// Gemini 가 판정하는 열 매핑 — 인덱스는 0-base 열 번호
export interface ExcelMapping {
  header_row: number | null; // 컬럼 제목 행(0-base). 없으면 null(첫 행부터 데이터)
  date: number;
  time: number | null;
  memo: number;
  channel: number | null;
  amount_in: number | null;
  amount_out: number | null;
  amount_signed: number | null; // 입출금이 한 열일 때(부호로 구분)
  signed_out_positive: boolean | null; // amount_signed 에서 양수가 '지출'이면 true
  balance: number | null;
}

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const PROMPT = `아래는 한국 소상공인의 회계자료 엑셀 시트 앞부분이야(행 배열, 0-base 인덱스). 은행/카드/정산 거래내역일 가능성이 높아. 각 거래 행에서 어떤 열이 무엇인지 판정해 아래 JSON 스키마로만 답해.

{
  "header_row": number|null,        // 컬럼 제목(날짜·내용·금액 등)이 적힌 행 인덱스. 제목 행이 없으면 null
  "date": number,                   // 거래일자 열 인덱스
  "time": number|null,              // 거래시각 열(따로 있을 때만)
  "memo": number,                   // 거래 내용·가맹점·상대방 열 (분류 단서가 되는 텍스트)
  "channel": number|null,           // 적요·거래구분 열(있을 때만)
  "amount_in": number|null,         // 입금(수입) 금액 열
  "amount_out": number|null,        // 출금(지출) 금액 열
  "amount_signed": number|null,     // 입출금이 한 열에 부호/한쪽만 기재될 때 그 열
  "signed_out_positive": boolean|null, // amount_signed 열에서 양수가 '지출'이면 true, 양수가 '수입'이면 false
  "balance": number|null            // 잔액 열(있을 때만)
}

규칙: amount_in/amount_out 이 따로 있으면 amount_signed 는 null. 합계·소계 행은 무시하고 판정. JSON 외 다른 텍스트 금지.`;

// 시트 앞부분(최대 20행 × 20열)을 Gemini 에 보내 열 매핑 판정
export async function inferMapping(rows: string[][], apiKey: string): Promise<ExcelMapping> {
  const sample = rows.slice(0, 20).map((r) => r.slice(0, 20));
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `${PROMPT}\n\n시트 데이터:\n${JSON.stringify(sample)}` }] }],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let text: string | undefined;
  let lastError = '';
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );
    if (res.status === 429 || res.status === 503) {
      lastError = `${model}: ${res.status}`;
      continue;
    }
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini 호출 실패(${res.status}): ${errBody.slice(0, 200)}`);
    }
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) break;
    lastError = `${model}: 빈 응답`;
  }
  if (!text) throw new Error(`AI 사용량 한도에 걸렸어요. 잠시 후 다시 시도해주세요. (${lastError})`);

  const raw = JSON.parse(text) as Record<string, unknown>;
  const idx = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
  const mapping: ExcelMapping = {
    header_row: idx(raw.header_row),
    date: idx(raw.date) ?? -1,
    time: idx(raw.time),
    memo: idx(raw.memo) ?? -1,
    channel: idx(raw.channel),
    amount_in: idx(raw.amount_in),
    amount_out: idx(raw.amount_out),
    amount_signed: idx(raw.amount_signed),
    signed_out_positive: typeof raw.signed_out_positive === 'boolean' ? raw.signed_out_positive : null,
    balance: idx(raw.balance),
  };
  if (mapping.date < 0 || mapping.memo < 0) {
    throw new Error('엑셀에서 거래일자/내용 열을 찾지 못했어요. 거래내역 형태의 시트인지 확인해주세요.');
  }
  if (mapping.amount_in == null && mapping.amount_out == null && mapping.amount_signed == null) {
    throw new Error('엑셀에서 금액 열을 찾지 못했어요.');
  }
  return mapping;
}

// 업로드 파일 → 행 배열(가장 데이터가 많은 시트). raw:false 로 표시 문자열 기준.
export function fileToRows(data: Uint8Array): string[][] {
  const wb = XLSX.read(data, { type: 'array', codepage: 949 });
  let best: string[][] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as unknown as string[][];
    const filled = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
    if (filled.length > best.length) best = filled.map((r) => r.map((c) => String(c ?? '')));
  }
  return best;
}

// '2026-07-01' / '2026.07.01' / '2026/07/01' / '20260701' / '7/1/26' / '2026-07-01 13:22:05' → ISO 날짜(+시각)
function parseDate(s: string): { date: string; time: string | null } | null {
  const t = s.trim();
  if (!t) return null;
  const timeM = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  const time = timeM
    ? `${timeM[1].padStart(2, '0')}:${timeM[2]}:${(timeM[3] ?? '00').padStart(2, '0')}`
    : null;
  let m = /^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/.exec(t);
  if (m) return { date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, time };
  m = /^(20\d{2})(\d{2})(\d{2})(?!\d)/.exec(t); // YYYYMMDD
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time };
  // xlsx raw:false 미국식 폴백: M/D/YY 또는 M/D/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return { date: `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, time };
  }
  return null;
}

const toNum = (s: string): number => {
  const n = Number(String(s).replace(/[,원\s₩]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 은행 내역의 잔액 연속성 — "이전 잔액 + 입금 − 출금 = 현재 잔액"이 이어지는지.
// 기간 커버리지로 못 잡는 '중간 행 누락'을 잡는다(끊긴 곳 = 그 사이 거래가 빠졌다는 증거).
// 파일의 행 순서를 신뢰하되(은행 내려받기 기본 정렬), 내림차순 파일은 뒤집어 검사한다.
export interface ContinuityReport {
  checked: number; // 검사한 연결 수
  breaks: number; // 끊긴 곳 수
  firstBreak: { date: string; memo: string } | null;
  reliable: boolean; // 끊김이 아주 많으면(5곳 이상 & 절반 초과) 다계좌 혼합·정렬 문제로 보고 판정 불가 처리
}

export function checkBalanceContinuity(txns: ParsedTransaction[]): ContinuityReport | null {
  if (txns.length < 3) return null;
  const asc = txns[0].txAt <= txns[txns.length - 1].txAt ? txns : [...txns].reverse();
  let checked = 0;
  let breaks = 0;
  let firstBreak: ContinuityReport['firstBreak'] = null;
  let prev: ParsedTransaction | null = null;
  let balanceRows = 0;
  for (const cur of asc) {
    if (cur.balance === 0) {
      // 잔액 미기재(0) 행은 판정 불가 — 체인 리셋(이 행을 가로지르는 검사는 하지 않음)
      prev = null;
      continue;
    }
    balanceRows++;
    if (prev) {
      checked++;
      const expected = prev.balance + cur.amountIn - cur.amountOut;
      if (Math.abs(expected - cur.balance) > 0.5) {
        breaks++;
        if (!firstBreak) firstBreak = { date: cur.txAt.slice(0, 10), memo: cur.memo };
      }
    }
    prev = cur;
  }
  // 잔액 열이 사실상 없는 파일(기재 행 부족)은 검사 안 함
  if (balanceRows < 3 || checked === 0) return null;
  return { checked, breaks, firstBreak, reliable: !(breaks >= 5 && breaks / checked > 0.5) };
}

// 매핑에 따라 전 행을 거래로 변환. 날짜 불가/금액 0 행(제목·합계 등)은 스킵.
export function rowsToTransactions(
  rows: string[][],
  mapping: ExcelMapping
): ParseResult & { skipped: number } {
  const start = mapping.header_row != null ? mapping.header_row + 1 : 0;
  const txns: ParsedTransaction[] = [];
  let skipped = 0;
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    // 원본 파일에서의 절대 행 번호 — raw 레이어(finance.raw_rows.row_index)와 맞춘다
    const rawRowIndex = r;
    const cell = (i: number | null) => (i != null ? String(row?.[i] ?? '').trim() : '');
    const d = parseDate(cell(mapping.date));
    if (!d) {
      skipped++;
      continue;
    }
    let amountIn = 0;
    let amountOut = 0;
    if (mapping.amount_signed != null) {
      const v = toNum(cell(mapping.amount_signed));
      const outPositive = mapping.signed_out_positive !== false; // 기본: 양수=지출
      if ((v > 0) === outPositive) amountOut = Math.abs(v);
      else amountIn = Math.abs(v);
      if (v === 0) amountIn = amountOut = 0;
    } else {
      amountIn = Math.abs(toNum(cell(mapping.amount_in)));
      amountOut = Math.abs(toNum(cell(mapping.amount_out)));
    }
    if (amountIn === 0 && amountOut === 0) {
      skipped++;
      continue;
    }
    const memo = cell(mapping.memo) || '(내용 없음)';
    const time = mapping.time != null ? (parseDate(`2000-01-01 ${cell(mapping.time)}`)?.time ?? d.time) : d.time;
    const txAt = `${d.date}T${time ?? '00:00:00'}`;
    const balance = mapping.balance != null ? toNum(cell(mapping.balance)) : 0;
    txns.push({
      bank: 'excel',
      txAt,
      ym: d.date.slice(0, 7),
      channel: cell(mapping.channel) || '엑셀',
      memo,
      amountOut,
      amountIn,
      balance,
      branch: null,
      dedupHash: hash('excel', txAt, amountOut, amountIn, balance, memo),
      normalizedKey: normalizeKey(memo),
      rawRowIndex,
    });
  }
  return {
    bank: 'excel',
    transactions: txns,
    totalRows: txns.length,
    sumIn: txns.reduce((s, t) => s + t.amountIn, 0),
    sumOut: txns.reduce((s, t) => s + t.amountOut, 0),
    skipped,
  };
}
