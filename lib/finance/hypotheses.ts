// 가설 — 현장 체감·통념을 우리 데이터로 검증하는 카드들 (2026-08-31 대표 지시로 신설).
//
// 왜 별도 화면인가: 지표는 "무슨 일이 있었나"를 보여주고, 여기는 **"우리가 믿는 게 사실인가"**를
// 다룬다. 2026-08 검증에서 '비 오면 매출이 준다'·'좋은 날씨면 상방'·'공휴일 앞뒤로 오른다'가
// 셋 다 데이터에서 무너졌고, 심지어 첫 검증 방법(로그 회귀)이 이상치에 끌려가 결론이 한 번 더
// 뒤집혔다. 그런 일이 또 생겨도 **화면이 알아서 다시 계산해 결론을 갱신**하는 게 이 페이지의 목적이다.
//
// 원칙 셋:
//  1. 판정(verdict)은 사람이 적지 않는다 — 아래 함수가 그때그때 숫자에서 만든다.
//  2. 한계(limit)를 항상 같이 낸다 — 표본 4일짜리를 확신처럼 쓰는 걸 막는 장치.
//  3. 숫자는 '같은 달·같은 요일 중앙값 대비'(simpleImpact)를 쓴다 — 계절·요일·성장세가 빠진 값.

import type { SimpleImpact } from '@/lib/garden/weatherSales';

export type Verdict = 'confirmed' | 'refuted' | 'mixed' | 'insufficient';

export const VERDICT_LABEL: Record<Verdict, string> = {
  confirmed: '확인됨',
  refuted: '뒤집힘',
  mixed: '반반',
  insufficient: '표본 부족',
};

export interface HypothesisCard {
  id: string;
  /** 검증 대상이 된 통념 — 문장으로 쓴다 */
  claim: string;
  /** 어디서 나온 말인지(현장 체감·대표 관찰 등) */
  origin: string;
  verdict: Verdict;
  /** 데이터에서 만든 한 줄 결론 */
  headline: string;
  numbers: { label: string; value: string }[];
  /** 그래서 뭘 하면 되는가 */
  rule?: string;
  /** 이 결론을 믿으면 안 되는 지점 */
  limit?: string;
  method: string;
}

const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
const won = (v: number) => `${Math.round(v).toLocaleString()}원`;
const find = (arr: { label: string; n: number; pct: number }[], label: string) => arr.find((b) => b.label === label);

const METHOD = '그날 매출 ÷ 같은 달·같은 요일 매출의 중앙값 (밴드 대표값도 중앙값)';

/** ① 비가 오면 매출이 준다 */
export function rainHypothesis(imp: SimpleImpact | null): HypothesisCard | null {
  if (!imp) return null;
  const light = [find(imp.rain, '비 1–5mm'), find(imp.rain, '비 5–20mm')].filter(Boolean) as { label: string; n: number; pct: number }[];
  const heavy = find(imp.rain, '폭우 20mm+');
  const loss = imp.heavyRainLoss;
  const lightMax = light.length ? Math.max(...light.map((b) => Math.abs(b.pct))) : 0;

  // 판정: 잔비가 무효과(±5%p 이내)이고 폭우 손실이 총매출의 3% 미만이면 통념은 뒤집힌 것.
  const verdict: Verdict =
    light.length === 0 ? 'insufficient' : lightMax < 5 && loss.pctOfTotal < 3 ? 'refuted' : loss.pctOfTotal >= 5 ? 'confirmed' : 'mixed';

  return {
    id: 'rain',
    claim: '비가 오면 매출이 준다',
    origin: '현장 체감 · 발주 판단에 쓰이던 전제',
    verdict,
    headline:
      verdict === 'refuted'
        ? `20mm 미만 비는 평소와 차이가 없어요. 폭우만 ${heavy ? pct(heavy.pct) : '—'}이고, 금액으로는 기간 총매출의 ${loss.pctOfTotal}%예요.`
        : `폭우 손실이 총매출의 ${loss.pctOfTotal}%로 무시하기 어려워요.`,
    numbers: [
      ...imp.rain.map((b) => ({ label: `${b.label} (${b.n}일)`, value: pct(b.pct) })),
      { label: `폭우로 잃은 매출 (${loss.days}일)`, value: `${won(loss.won)} · 총매출의 ${loss.pctOfTotal}%` },
    ],
    rule:
      verdict === 'refuted'
        ? '잔비 예보에는 발주·인력을 건드리지 않아요. 20mm+ 예보일 때만 소폭 조정하세요.'
        : '폭우 예보일에는 발주를 줄이세요.',
    limit: `폭우 표본은 ${loss.days}일뿐이라 한두 날에 흔들려요. 같은 달·같은 요일에 비교할 날이 없으면 효과가 지워지는 방법이라, 장마처럼 한 달에 몰린 해는 과소평가될 수 있어요.`,
    method: METHOD,
  };
}

/** ② 날씨가 좋으면(쾌적 기온·맑음) 매출 상방이 열린다 */
export function niceWeatherHypothesis(imp: SimpleImpact | null): HypothesisCard | null {
  if (!imp) return null;
  const usable = imp.temp.filter((b) => b.n >= 10);
  if (usable.length < 2) return null;
  const best = usable.reduce((a, b) => (b.pct > a.pct ? b : a));
  const worst = usable.reduce((a, b) => (b.pct < a.pct ? b : a));

  // 판정: 어떤 기온대도 +5%p를 못 넘으면 '상방 없음'.
  const verdict: Verdict = best.pct >= 10 ? 'confirmed' : best.pct >= 5 ? 'mixed' : 'refuted';

  return {
    id: 'nice-weather',
    claim: '날씨가 좋으면(적당한 기온·맑음) 매출 상방이 열린다',
    origin: '현장 체감 — 해 나면 손님이 는다',
    verdict,
    headline:
      verdict === 'refuted'
        ? `같은 달 안에서 보면 기온으로 벌리는 폭이 없어요. 가장 좋은 구간도 ${best.label} ${pct(best.pct)}예요.`
        : `${best.label}에서 ${pct(best.pct)}로 상방이 보여요.`,
    numbers: usable.map((b) => ({ label: `${b.label} (${b.n}일)`, value: pct(b.pct) })),
    rule:
      verdict === 'refuted'
        ? '“오늘 날씨 좋으니 많이 준비하자”는 근거가 약해요. 계절(월 팩터)과 요일로 잡으세요.'
        : `${best.label} 예보일에는 준비량을 올려보세요.`,
    limit: `계절이 이미 빠진 숫자예요 — “겨울이라 매출이 낮다”는 여기 안 잡히고 월 팩터에서 봐야 해요. 가장 나쁜 구간(${worst.label} ${pct(worst.pct)})도 표본이 ${worst.n}일이라 단정하기 이릅니다.`,
    method: METHOD,
  };
}

/** ③ 공휴일 앞뒤로 매출이 오른다 */
export function holidayHypothesis(imp: SimpleImpact | null): HypothesisCard | null {
  if (!imp) return null;
  const before = find(imp.calendar, '공휴일 전날');
  const on = find(imp.calendar, '공휴일 당일');
  const after = find(imp.calendar, '공휴일 다음날');
  const seen = [before, on, after].filter(Boolean) as { label: string; n: number; pct: number }[];
  if (seen.length === 0) return null;
  const minN = Math.min(...seen.map((b) => b.n));
  const up = seen.filter((b) => b.pct >= 5).length;
  const down = seen.filter((b) => b.pct <= -5).length;

  const verdict: Verdict = minN < 5 ? 'insufficient' : down > up ? 'refuted' : up > down ? 'confirmed' : 'mixed';

  return {
    id: 'holiday',
    claim: '공휴일 앞뒤로 매출이 오른다',
    origin: '대표 관찰(2026-08-31)',
    verdict,
    headline:
      verdict === 'refuted'
        ? '오히려 빠져요. 연휴에 상권이 비는 쪽 영향이 더 큽니다.'
        : verdict === 'insufficient'
        ? `아직 판단할 수 없어요 — 가장 적은 구간이 ${minN}일치예요.`
        : '공휴일 주변에 매출이 올라요.',
    numbers: seen.map((b) => ({ label: `${b.label} (${b.n}일)`, value: pct(b.pct) })),
    rule:
      verdict === 'refuted'
        ? '연휴 전후에는 발주를 늘리지 말고 오히려 줄여 잡으세요.'
        : verdict === 'insufficient'
        ? '추석·연말을 지나 표본이 쌓이면 다시 봅니다.'
        : '연휴 전날 준비량을 올려보세요.',
    limit:
      '“크리스마스 이브처럼 뜨는 하루”가 밴드를 만들지 못하도록 중앙값을 쓰고 있어요. 이벤트성 하루는 이 카드가 아니라 개별 날짜로 봐야 해요.',
    method: METHOD,
  };
}

export interface SeasonInput {
  factors: (number | null)[]; // 1~12월 팩터 (1.0 = 연 일평균)
  monthly: { ym: string; days: number; supplyPerDay: number }[];
}

/** ④ 계절이 매출을 가른다 */
export function seasonHypothesis(input: SeasonInput | null): HypothesisCard | null {
  if (!input) return null;
  const seen = input.factors
    .map((f, i) => ({ month: i + 1, f }))
    .filter((x): x is { month: number; f: number } => x.f != null);
  if (seen.length < 4) return null;
  const hi = seen.reduce((a, b) => (b.f > a.f ? b : a));
  const lo = seen.reduce((a, b) => (b.f < a.f ? b : a));
  const spread = lo.f > 0 ? hi.f / lo.f : 0;

  const verdict: Verdict = spread >= 1.5 ? 'confirmed' : spread >= 1.2 ? 'mixed' : 'refuted';

  return {
    id: 'season',
    claim: '계절이 매출을 가른다 (날씨보다 계절이 크다)',
    origin: '날씨 검증에서 파생 — 일별 날씨 효과가 0에 가까웠다',
    verdict,
    headline:
      verdict === 'confirmed'
        ? `가장 센 달과 약한 달이 ${spread.toFixed(1)}배 차이예요. 일별 날씨(±0~15%)와는 급이 다릅니다.`
        : `달 사이 편차가 ${spread.toFixed(1)}배로 크지 않아요.`,
    numbers: [
      { label: `가장 센 달`, value: `${hi.month}월 ${hi.f.toFixed(2)}` },
      { label: `가장 약한 달`, value: `${lo.month}월 ${lo.f.toFixed(2)}` },
      { label: '격차', value: `${spread.toFixed(1)}배` },
      ...input.monthly.slice(-4).map((m) => ({ label: `${m.ym} 일평균`, value: `${won(m.supplyPerDay)} (${m.days}일)` })),
    ],
    rule: '발주·인력 계획의 1순위 변수는 월 팩터예요. 날씨는 극단값(폭우·폭염)일 때만 얹으세요.',
    limit:
      '성장 추세가 섞여 있어요 — 개점 직후 달이 낮고 최근 달이 높게 나옵니다. 1년치가 두 바퀴 돌기 전엔 계절과 성장을 완전히 못 가릅니다.',
    method: '월 일평균 매출 ÷ 전체 일평균 매출 (영업 10일 미만인 달 제외)',
  };
}

export interface ProductInput {
  product: string;
  ym: string;
  productGross: number;
  totalGross: number;
  /** 직전 달들의 매장 일평균 매출 — 도입이 순증인지 잠식인지 가르는 값 */
  storeDailyBefore: number;
  storeDailyAfter: number;
}

/** ⑤ 특정 상품이 손익에서 큰 몫을 한다 */
export function productShareHypothesis(input: ProductInput | null): HypothesisCard | null {
  if (!input || input.totalGross <= 0) return null;
  const share = (input.productGross / input.totalGross) * 100;
  const lift = input.storeDailyBefore > 0 ? (input.storeDailyAfter / input.storeDailyBefore - 1) * 100 : 0;
  const verdict: Verdict = share >= 15 ? 'confirmed' : share >= 8 ? 'mixed' : 'refuted';

  return {
    id: 'product-share',
    claim: `${input.product}가 손익에서 큰 몫을 한다`,
    origin: '대표 판단 — 도입 시점부터의 가설',
    verdict,
    headline: `${input.ym} 매출의 ${share.toFixed(1)}%예요. 같은 기간 매장 일평균 매출은 ${pct(lift)}.`,
    numbers: [
      { label: `${input.product} 매출 (${input.ym})`, value: won(input.productGross) },
      { label: '매장 전체 매출', value: won(input.totalGross) },
      { label: '비중', value: `${share.toFixed(1)}%` },
      { label: '도입 전후 매장 일평균', value: `${won(input.storeDailyBefore)} → ${won(input.storeDailyAfter)} (${pct(lift)})` },
    ],
    rule:
      lift > 0
        ? '매장 매출이 함께 올랐으니 순증에 가까워요 — 다른 메뉴를 뺏은 게 아니라 손님을 더 받은 쪽입니다.'
        : '매장 매출이 안 늘었어요 — 기존 메뉴를 대체했을 가능성을 봐야 해요.',
    limit: '도입과 성수기·성장세가 겹쳐 있어요. 순증 판단은 계절이 한 바퀴 돌아야 확실해집니다.',
    method: '해당 월 상품 매출 ÷ 매장 매출(부가세 포함) · 도입 전후 일평균 비교',
  };
}

export interface CannibalInput {
  product: string;
  /** 도입 전/후 커피 일평균 잔수 */
  cupsBefore: number;
  cupsAfter: number;
  /** 도입 전/후 매장 일평균 매출 */
  salesBefore: number;
  salesAfter: number;
}

/** ⑥ 신메뉴가 기존 주력(커피)을 잠식한다 */
export function cannibalHypothesis(input: CannibalInput | null): HypothesisCard | null {
  if (!input || input.cupsBefore <= 0) return null;
  const cups = (input.cupsAfter / input.cupsBefore - 1) * 100;
  const sales = input.salesBefore > 0 ? (input.salesAfter / input.salesBefore - 1) * 100 : 0;
  const verdict: Verdict = cups <= -5 && sales > 0 ? 'mixed' : cups <= -5 ? 'confirmed' : 'refuted';

  return {
    id: 'cannibalization',
    claim: `${input.product}가 커피 판매를 잠식한다`,
    origin: '검증 중 발견 — 커피 잔수 추세가 매출과 반대로 움직였다',
    verdict,
    headline:
      verdict === 'mixed'
        ? `커피 잔수는 ${pct(cups)}인데 매장 매출은 ${pct(sales)}예요 — 잔수는 뺏겼지만 돈은 늘었어요.`
        : verdict === 'confirmed'
        ? `커피 잔수 ${pct(cups)}, 매출도 ${pct(sales)} — 대체가 일어나고 있어요.`
        : `커피 잔수가 ${pct(cups)}로 줄지 않았어요.`,
    numbers: [
      { label: '커피 일평균 잔수 (도입 전 → 후)', value: `${input.cupsBefore.toFixed(0)} → ${input.cupsAfter.toFixed(0)} (${pct(cups)})` },
      { label: '매장 일평균 매출 (도입 전 → 후)', value: `${won(input.salesBefore)} → ${won(input.salesAfter)} (${pct(sales)})` },
    ],
    rule:
      verdict === 'mixed'
        ? '객단가가 오르는 구조라 당장은 이득이에요. 다만 커피 잔수는 원두 발주의 기준이니 발주량을 따로 낮춰 잡으세요.'
        : '지켜보세요.',
    limit: '도입 전 기간이 짧고 계절(여름 음료 성수기)이 겹쳐 있어요. 잔수 감소가 브런치바 때문인지 날씨·계절 때문인지는 아직 못 가릅니다.',
    method: '도입 전후 일평균 비교 (커피 카테고리 수량 · 매장 매출)',
  };
}
