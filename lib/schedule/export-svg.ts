import { fmtSegment } from './time';
import type { Shift, Staff } from './types';
import { fmtMd } from '@/lib/teaching/kst';

// 주간 근무표 → SVG 문자열(순수). 카톡에 붙일 PNG 는 클라이언트에서 canvas 로 변환한다.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function weekSvg(opts: { title: string; days: string[]; rows: Staff[]; shifts: Shift[]; store: string }): string {
  const { title, days, rows, shifts, store } = opts;
  const nameW = 96;
  const colW = 118;
  const rowH = 34;
  const headH = 64;
  const w = nameW + colW * 7 + 24;
  const h = headH + rowH * Math.max(rows.length, 1) + 24;
  const font = "font-family='Pretendard, -apple-system, Apple SD Gothic Neo, Malgun Gothic, sans-serif'";
  const cell = (id: number, d: string) => {
    const mine = shifts.filter((s) => s.staffId === id && s.date === d && s.store === store);
    if (mine.some((s) => s.isOff)) return '쉼';
    return mine.filter((s) => s.start != null && s.end != null).map((s) => fmtSegment({ start: s.start!, end: s.end! })).join(', ');
  };
  const parts: string[] = [];
  parts.push(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' ${font}>`);
  parts.push(`<rect width='${w}' height='${h}' fill='#ffffff'/>`);
  parts.push(`<text x='12' y='28' font-size='18' font-weight='600' fill='#111'>${esc(title)}</text>`);
  days.forEach((d, i) => parts.push(`<text x='${nameW + 12 + colW * i}' y='${headH - 14}' font-size='13' fill='#666'>${esc(fmtMd(d))}</text>`));
  parts.push(`<line x1='12' y1='${headH - 4}' x2='${w - 12}' y2='${headH - 4}' stroke='#ddd'/>`);
  rows.forEach((p, r) => {
    const y = headH + rowH * r + 22;
    parts.push(`<text x='12' y='${y}' font-size='14' fill='#111'>${esc(p.name)}</text>`);
    days.forEach((d, i) => parts.push(`<text x='${nameW + 12 + colW * i}' y='${y}' font-size='14' fill='#111'>${esc(cell(p.id, d))}</text>`));
    parts.push(`<line x1='12' y1='${headH + rowH * (r + 1)}' x2='${w - 12}' y2='${headH + rowH * (r + 1)}' stroke='#eee'/>`);
  });
  parts.push('</svg>');
  return parts.join('');
}
