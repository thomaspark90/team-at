// 로우데이터 조회 조건의 URL 표현 — 페이지·행 API·CSV 내보내기가 같은 규칙으로 읽고 쓴다.
// 조건이 URL 에 다 담겨 있어야 화면을 그대로 링크로 공유하고, CSV 도 '보고 있는 그대로' 받는다.

import { isRawSource, monthRange, type RawQuery, type RawSort } from './rawQuery';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;

/** URL 검색 파라미터 → 조회 조건. ym(월 단축)이 있으면 그 달의 기간으로 편다. */
export function parseRawQuery(sp: URLSearchParams): RawQuery {
  const source = sp.get('source');
  const ym = sp.get('ym');
  let from = sp.get('from');
  let to = sp.get('to');
  if (ym && YM_RE.test(ym)) [from, to] = monthRange(ym);

  const sortBy = sp.get('sort');
  const sortCol = Number(sp.get('col'));
  const sort: RawSort = {
    by: sortBy === 'date' || sortBy === 'col' ? sortBy : 'row',
    col: Number.isFinite(sortCol) && sortCol >= 0 ? sortCol : null,
    numeric: sp.get('num') === '1',
    desc: sp.get('desc') === '1',
  };
  // 열 지정 없는 'col' 정렬은 의미가 없다 — 원본 순으로 되돌린다
  if (sort.by === 'col' && sort.col == null) sort.by = 'row';

  const filters: Record<string, string> = {};
  sp.forEach((v, k) => {
    const m = k.match(/^f(\d+)$/);
    if (m && v.trim()) filters[m[1]] = v.trim();
  });

  return {
    source: isRawSource(source) ? source : 'bank',
    brand: sp.get('brand'),
    from: from && DATE_RE.test(from) ? from : null,
    to: to && DATE_RE.test(to) ? to : null,
    q: sp.get('q'),
    filters: Object.keys(filters).length > 0 ? filters : null,
    sort,
  };
}

/** 조회 조건 → URL 검색 파라미터(정렬·필터·기간 유지용) */
export function rawQueryToParams(query: RawQuery, extra?: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams({ source: query.source });
  if (query.brand) p.set('brand', query.brand);
  if (query.from) p.set('from', query.from);
  if (query.to) p.set('to', query.to);
  if (query.q) p.set('q', query.q);
  const s = query.sort;
  if (s && s.by !== 'row') {
    p.set('sort', s.by);
    if (s.by === 'col' && s.col != null) p.set('col', String(s.col));
    if (s.numeric) p.set('num', '1');
  }
  if (s?.desc) p.set('desc', '1');
  Object.entries(query.filters ?? {}).forEach(([k, v]) => v && p.set(`f${k}`, v));
  Object.entries(extra ?? {}).forEach(([k, v]) => p.set(k, v));
  return p;
}
