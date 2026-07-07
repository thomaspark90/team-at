// 재무 화면 공용 포맷터 — 컴포넌트마다 흩어진 won(₩/무₩ 2종)·fmtYm 중복 제거.
// 무₩ 컴포넌트는 `import { wonNum as won }` 로 별칭해 호출부를 그대로 둔다.

export const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR'); // ₩ 붙는 금액
export const wonNum = (n: number) => n.toLocaleString('ko-KR'); // 숫자만(₩ 없음) — 기존 무₩ won과 동일 동작

// 'YYYY-MM' → 'YYYY년 M월'. null/빈값은 ''(카드 정산 등 nullable 대응).
export const fmtYm = (ym?: string | null): string => {
  if (!ym) return '';
  const [y, mo] = ym.split('-');
  return `${y}년 ${Number(mo)}월`;
};
