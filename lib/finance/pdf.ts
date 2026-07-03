// 은행 PDF(바이트) → pdftotext -layout 유사의 "열 정렬 텍스트".
// parse.ts 의 정규식이 기대하는 열정렬을 pdfjs 텍스트 좌표로 재구성한다.
// 서버(node) 전용 — 이 함수를 쓰는 route handler 는 `export const runtime = 'nodejs'`.
// 신한/우리 실측 PDF로 검증: 각각 100 / 138 건 재현(파이썬 pdftotext 기준값과 일치).

import { getDocumentProxy } from 'unpdf';

const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

interface Item {
  str: string;
  width: number;
  transform: number[]; // [a,b,c,d,x,y]
}

export async function pdfToLayoutText(data: Uint8Array, password?: string): Promise<string> {
  const doc = await getDocumentProxy(data, { password, verbosity: 0 });
  const out: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as unknown as Item[]).filter((i) => i.str && i.str.trim() !== '');
    if (!items.length) continue;

    const minX = Math.min(...items.map((i) => i.transform[4]));
    const charW =
      median(items.map((i) => i.width / Math.max(i.str.length, 1)).filter((w) => w > 0)) || 5;

    // y 좌표로 행 그룹핑(근접 병합)
    const rows: { y: number; items: Item[] }[] = [];
    for (const it of items) {
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y); // 위 → 아래

    for (const row of rows) {
      row.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let line = '';
      let prevEndX: number | null = null;
      for (const it of row.items) {
        const x = it.transform[4];
        if (prevEndX === null) {
          const col = Math.round((x - minX) / charW);
          if (line.length < col) line += ' '.repeat(col - line.length);
        } else if (x - prevEndX > charW * 0.3) {
          // 의미있는 컬럼 간격 → 절대열 정렬, 최소 1칸 보장(숫자·내용 붙음 방지)
          const col = Math.round((x - minX) / charW);
          line += ' '.repeat(Math.max(col - line.length, 1));
        } // else: 밀착 = 같은 단어의 연속 item → 공백 없이 이어붙임
        line += it.str;
        prevEndX = x + (it.width || 0);
      }
      out.push(line);
    }
  }

  return out.join('\n');
}
