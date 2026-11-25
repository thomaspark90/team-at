// 푸어링 줄 이름 — 레시피 보드 카드와 추출 화면이 같이 쓴다.
export const BLOOM_SEC = 35; // 매장 기준 뜸 시간 — 전 레시피 공통(2026-10-30 대표 결정), 레시피별 입력은 아직 없음

export const pourName = (label: string | undefined, i: number) => {
  const name = label ?? (i === 0 ? '뜸' : `${i}차`);
  return name === '뜸' ? `뜸(${BLOOM_SEC}s)` : name;
};
