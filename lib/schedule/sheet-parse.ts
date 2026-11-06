import type { Segment } from './types';

// 구글 시트 '양재천점 근무 스케줄' CSV 해석 — 이관 스크립트 전용 순수 함수.
// 근무표: 하루 1행, A=메모, B=날짜, C~R=6~22시 1시간 칸(쉼표로 이름 나열), V~Z=손 계산 보조표.

const FIRST_HOUR = 6;
const HOUR_COLS = 16;

/** 시트에서 줄여 쓴 이름 → 명부 이름. 비슷한 이름(이우혁/이우아 등)은 다른 사람이라 합치지 않는다. */
export const NAME_ALIASES: Record<string, string> = { 승효: '홍승효' };

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export const namesInCell = (cell: string): string[] =>
  Array.from(
    new Set(
      cell
        .split(/[,\n]/)
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => NAME_ALIASES[n] ?? n),
    ),
  );

/** 이름별로 칸을 이어 붙여 근무 구간으로. 끊기면 구간이 둘이 된다. */
export function segmentsByName(hourCells: string[]): Map<string, Segment[]> {
  const out = new Map<string, Segment[]>();
  hourCells.forEach((cell, i) => {
    const start = (FIRST_HOUR + i) * 60;
    for (const name of namesInCell(cell)) {
      const segs = out.get(name) ?? [];
      const last = segs[segs.length - 1];
      if (last && last.end === start) last.end = start + 60;
      else segs.push({ start, end: start + 60 });
      out.set(name, segs);
    }
  });
  return out;
}

export interface SheetDay {
  date: string;
  memo: string;
  shifts: Map<string, Segment[]>;
}

export interface ParsedGrid {
  days: SheetDay[];
  /** 보조표 원문: 5월 단기 인력(V~Z열)·6월 시간표(X~Y열) */
  mayTable: string[];
  juneTable: string[];
}

const DATE_RE = /^(\d{4})\. (\d{2})\. (\d{2})/;

export function parseGrid(csv: string): ParsedGrid {
  const days: SheetDay[] = [];
  const mayTable: string[] = [];
  const juneTable: string[] = [];
  for (const r of parseCsv(csv)) {
    const m = DATE_RE.exec((r[1] ?? '').trim());
    if (!m) continue;
    days.push({
      date: `${m[1]}-${m[2]}-${m[3]}`,
      memo: (r[0] ?? '').trim(),
      shifts: segmentsByName(Array.from({ length: HOUR_COLS }, (_, i) => r[2 + i] ?? '')),
    });
    const flat = (from: number, to: number) =>
      r
        .slice(from, to)
        .map((c) => c.replace(/\s*\n\s*/g, ' / ').trim())
        .filter(Boolean)
        .join(' · ');
    if ((r[21] ?? '').trim() || (r[22] ?? '').trim()) mayTable.push(flat(21, 26));
    else if ((r[23] ?? '').trim() || (r[24] ?? '').trim()) juneTable.push(flat(23, 25));
  }
  return { days, mayTable, juneTable };
}

export interface SheetLeave {
  name: string;
  joinedOn: string | null;
  total: number | null;
  used: { date: string; note: string }[];
  remaining: number | null;
}

export const parseJoined = (s: string): string | null => {
  const m = /(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(s);
  return m ? `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
};

const count = (s: string | undefined): number | null => {
  const m = /(\d+(?:\.\d+)?)\s*개/.exec(s ?? '');
  return m ? Number(m[1]) : null;
};

/** 연차 탭: 1행 입사일, 2행 이름, 3행 총개수, 4행~ 사용 날짜, '남은 연차 갯수' 행. 2열부터 사람. */
export function parseLeave(csv: string): SheetLeave[] {
  const rows = parseCsv(csv);
  const names = rows[1] ?? [];
  const remainingRow = rows.find((r) => (r[0] ?? '').startsWith('남은'));
  const remainingAt = remainingRow ? rows.indexOf(remainingRow) : rows.length;
  const out: SheetLeave[] = [];
  for (let c = 1; c < names.length; c++) {
    const name = names[c]?.trim();
    if (!name) continue;
    const used: SheetLeave['used'] = [];
    for (let r = 3; r < remainingAt; r++) {
      const m = /^(\d{2})\.(\d{2})\.(\d{2})\s*(?:\((.*)\))?/.exec((rows[r]?.[c] ?? '').trim());
      if (m) used.push({ date: `20${m[1]}-${m[2]}-${m[3]}`, note: m[4] ?? '' });
    }
    out.push({
      name,
      joinedOn: parseJoined(rows[0]?.[c] ?? ''),
      total: count(rows[2]?.[c]),
      used,
      remaining: count(remainingRow?.[c]),
    });
  }
  return out;
}
