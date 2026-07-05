// 은행 거래내역 PDF(레이아웃 텍스트) → 거래 배열.
// 입력은 pdftotext -layout 동등의 "열 정렬이 보존된 텍스트".
// 신한/우리 두 은행 실측 PDF로 검증된 정규식(파이썬 프로토타입과 동일).

import type { BankSource, ParsedTransaction, ParseResult } from './types';
import { normalizeKey } from './normalize';
import { hash } from './dedup';

const toNum = (s: string): number => Number(s.replace(/[,원\s]/g, '')) || 0;

// 신한: 거래일자(8) 거래시간 적요 출금 입금 내용 잔액 거래점
const SHINHAN_RE =
  /^\s*(\d{8})\s+(\d{2}:\d{2}:\d{2})\s+(.+?)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(.*?)\s+([\d,]{4,})\s+\S+\s*$/;

// 우리: 거래일시(YYYY.MM.DD) 거래시간 거래구분 기재내용 출금원 입금원 잔액원
const WOORI_RE =
  /^\s*(\d{4}\.\d{2}\.\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+(.+?)\s+([\d,]+)원\s+([\d,]+)원\s+([\d,]+)원/;

function build(
  bank: BankSource,
  isoDate: string,
  time: string,
  channel: string,
  memo: string,
  out: number,
  inc: number,
  balance: number,
  branch: string | null
): ParsedTransaction {
  const txAt = `${isoDate}T${time}`;
  const cleanMemo = memo.trim();
  return {
    bank,
    txAt,
    ym: isoDate.slice(0, 7),
    channel: channel.trim(),
    memo: cleanMemo,
    amountOut: out,
    amountIn: inc,
    balance,
    branch,
    dedupHash: hash(bank, txAt, out, inc, balance, cleanMemo),
    normalizedKey: normalizeKey(cleanMemo),
  };
}

export function parseShinhan(text: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const line of text.split('\n')) {
    const m = SHINHAN_RE.exec(line);
    if (!m) continue;
    const [, d, time, channel, outStr, incStr, memo, balStr] = m;
    const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    out.push(
      build('shinhan', iso, time, channel, memo, toNum(outStr), toNum(incStr), toNum(balStr), null)
    );
  }
  return out;
}

export function parseWoori(text: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const line of text.split('\n')) {
    const m = WOORI_RE.exec(line);
    if (!m) continue;
    const [, dot, time, channel, memo, outStr, incStr, balStr] = m;
    const iso = dot.replace(/\./g, '-'); // 2026.07.01 → 2026-07-01
    out.push(
      build('woori', iso, time, channel, memo, toNum(outStr), toNum(incStr), toNum(balStr), null)
    );
  }
  return out;
}

export function parseStatement(bank: BankSource, text: string): ParseResult {
  const transactions = bank === 'shinhan' ? parseShinhan(text) : parseWoori(text);
  return {
    bank,
    transactions,
    totalRows: transactions.length,
    sumIn: transactions.reduce((a, t) => a + t.amountIn, 0),
    sumOut: transactions.reduce((a, t) => a + t.amountOut, 0),
  };
}

// dedup: 같은 지문은 한 번만. 기존 해시 집합을 받아 신규만 반환.
export function dedupe(
  incoming: ParsedTransaction[],
  existingHashes: Set<string>
): { fresh: ParsedTransaction[]; duplicates: number } {
  const seen = new Set(existingHashes);
  const fresh: ParsedTransaction[] = [];
  let duplicates = 0;
  for (const tx of incoming) {
    if (seen.has(tx.dedupHash)) {
      duplicates++;
      continue;
    }
    seen.add(tx.dedupHash);
    fresh.push(tx);
  }
  return { fresh, duplicates };
}
