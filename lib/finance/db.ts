// Supabase 조회 결과를 풀되, 에러면 던져서 app/finance/error.tsx 가 잡게 한다.
// 목적: '조회 에러'와 '데이터 없음(빈 배열)'을 구분 — 에러가 빈 화면으로 위장되던 문제 방지.
// 빈 데이터(null/[])는 정상 통과시켜 각 페이지의 빈 상태 UI가 그대로 동작한다.
export function unwrap<T>(res: { data: T; error: { message: string } | null }, label = '데이터'): T {
  if (res.error) throw new Error(`${label}를 불러오지 못했어요: ${res.error.message}`);
  return res.data;
}
