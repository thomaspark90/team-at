import type { BeanMeta, PurchaseRecord } from '@/lib/types';
import { normalize } from '@/lib/pricing';

// 원두명에서 국가 추출 — 필터 레시피·태블릿 보드의 국가별 정렬용 (구 GardenRecipes에서 이식)
const COUNTRIES = [
  '에티오피아', '케냐', '콜롬비아', '브라질', '과테말라', '온두라스', '파나마', '페루',
  '코스타리카', '엘살바도르', '니카라과', '볼리비아', '에콰도르', '르완다', '부룬디',
  '인도네시아', '예멘', '멕시코', '인도', '베트남', '탄자니아', '우간다', '파푸아뉴기니', '중국',
];
export const ETC = '기타';
export const countryOf = (bean: string) => {
  const b = normalize(bean);
  return COUNTRIES.find((c) => b.includes(normalize(c))) ?? ETC;
};

// 보관 여부 — 보관 이후 같은 원두 발주가 새로 들어왔으면 자동 해제로 본다
export const isBeanArchived = (meta: BeanMeta | undefined, latest: Pick<PurchaseRecord, 'createdAt'> | undefined) => {
  const at = meta?.archivedAt;
  if (!at) return false;
  return !(latest && latest.createdAt.localeCompare(at) > 0);
};
