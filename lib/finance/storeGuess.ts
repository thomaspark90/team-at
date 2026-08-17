// 가맹점명에 지점 이름이 박혀 있으면 지점을 추정 — 분류 화면 '제안' 표시용.
// 자동 확정이 아니라 사람이 클릭해서 확인하는 힌트다(2026-08-17, 미트박스 지점 미지정 사고 처방).
export type StoreCode = 'pangyo' | 'yangjae';

const STORE_NAME_HINTS: [RegExp, StoreCode][] = [
  [/양재/, 'yangjae'],
  [/판교/, 'pangyo'],
];

export function guessStoreFromMemo(memo: string): StoreCode | null {
  for (const [re, store] of STORE_NAME_HINTS) if (re.test(memo)) return store;
  return null;
}
