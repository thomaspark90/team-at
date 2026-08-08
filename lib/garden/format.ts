// 가든 공통 날짜 표기 (YY.MM.DD) — 컴포넌트마다 사본이 생겨 화면별 표기(ISO·M/D)가 갈리던 것을 단일화
export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};
