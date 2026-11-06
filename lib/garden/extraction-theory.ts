// 커피 추출 이론 — 에스프레소 추출 구간별 양상 데이터.
// 값은 두 층으로 나뉜다. 섞지 말 것.
//   측정: 논문 표·보충자료의 수치와 그 계산값 (SCHMIEDER_*, CUP_MASS, VOLATILES)
//   해석: 측정 곡선에 맛을 대응시킨 모식도 (ROAST_AMPLITUDES, flavorAt) — 높이는 상대적이며 측정값이 아니다.
// 근거 정리: 옵시디언 '에스프레소 시간별 향미 추출 양상' 리서치 노트(2026-11-06).

// ── 측정: Schmieder et al. 2023, Foods 12(15):2871, Table A1 Exp.7 (원두 20 g, 약 1.9 mL/s, 88.3 °C) ──
export const DOSE_G = 20;
export const FLOW_G_PER_S = 1.9; // 1 mL ≈ 1 g 가정 — 초 환산 표기에만 사용

export type CompoundKey = 'tds' | 'trigonelline' | 'cqa' | 'caffeine';

// c(m) = c0 · exp(−m/λ). c0 단위 mg/g, λ 단위 g(누적 음료 질량).
export const SCHMIEDER_FIT: Record<CompoundKey, { label: string; c0: number; lambda: number }> = {
  tds: { label: 'TDS(총용존고형물)', c0: 248.27, lambda: 17.47261 },
  trigonelline: { label: '트리고넬린', c0: 6.69949, lambda: 16.08737 },
  cqa: { label: '5-CQA(클로로겐산)', c0: 6.79246, lambda: 20.77137 },
  caffeine: { label: '카페인', c0: 9.70981, lambda: 23.09434 },
};

export const concentrationAt = (key: CompoundKey, massG: number) => {
  const { c0, lambda } = SCHMIEDER_FIT[key];
  return c0 * Math.exp(-massG / lambda);
};

/** 첫 방울 농도(c0)를 100으로 둔 지금 떨어지는 액체의 상대 농도(%) */
export const relativeConcentration = (key: CompoundKey, massG: number) =>
  100 * Math.exp(-massG / SCHMIEDER_FIT[key].lambda);

/** 추출 비율(원두 1 대비 음료) → 첫 방울 이후 대략 초. 프리인퓨전 제외 */
export const ratioToSeconds = (ratio: number) => (ratio * DOSE_G) / FLOW_G_PER_S;

// 측정: 같은 논문 Table 2, 잔에 담긴 질량 (원두 20 g 기준)
export const CUP_MASS = [
  { ratio: 1, massG: 20, trigonellineMg: 75.9, caffeineMg: 129.0, cqaMg: 86.5, tdsG: 2.92 },
  { ratio: 2, massG: 40, trigonellineMg: 98.3, caffeineMg: 183.8, cqaMg: 120.0, tdsG: 3.88 },
  { ratio: 3, massG: 60, trigonellineMg: 104.9, caffeineMg: 207.1, cqaMg: 133.1, tdsG: 4.19 },
] as const;

/** 끊는 지점별 잔 요약. 수율·농도·비중은 Table 2 값으로 계산 */
export const cupSummary = () => {
  const last = CUP_MASS[CUP_MASS.length - 1];
  return CUP_MASS.map((c) => ({
    ratio: c.ratio,
    massG: c.massG,
    seconds: ratioToSeconds(c.ratio),
    yieldPct: (c.tdsG / DOSE_G) * 100,
    cupTdsPct: (c.tdsG / c.massG) * 100,
    trigonellineShare: (c.trigonellineMg / last.trigonellineMg) * 100,
    cqaShare: (c.cqaMg / last.cqaMg) * 100,
    caffeineShare: (c.caffeineMg / last.caffeineMg) * 100,
  }));
};

// ── 측정: Sánchez López et al. 2016, Fig.2 중심 조건 (중배전 95 Pt, 18 g → 31.5 g, 25초, 9 bar, 92 °C) ──
// 그림에서 눈으로 읽은 값(±0.03~0.05). 계열별 자기 최댓값을 1로 정규화한 신호 — 계열끼리 양 비교 불가, 맛 강도 아님.
export const VOLATILE_TIMES = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26] as const;
export type VolatileFamily = 'A' | 'B' | 'C' | 'D' | 'E';
export const VOLATILES: Record<VolatileFamily, readonly number[]> = {
  A: [0, 0.01, 0.08, 0.1, 0.65, 1.0, 0.95, 0.85, 0.79, 0.66, 0.56, 0.45, 0.39, 0.33],
  B: [0, 0.01, 0.08, 0.11, 0.51, 0.91, 0.98, 0.97, 0.99, 0.91, 0.82, 0.72, 0.67, 0.6],
  C: [0, 0.03, 0.32, 0.36, 0.8, 0.97, 0.97, 0.94, 1.0, 0.92, 0.82, 0.72, 0.68, 0.6],
  D: [0, 0.01, 0.04, 0.05, 0.35, 0.71, 0.86, 0.95, 1.0, 0.98, 0.91, 0.84, 0.79, 0.72],
  E: [0, 0, 0.03, 0.03, 0.2, 0.45, 0.62, 0.76, 0.86, 0.93, 0.94, 0.95, 0.93, 0.89],
};

const VOLATILE_FLOW_START_S = 6;
const VOLATILE_FLOW_G_PER_S = 31.5 / (25 - VOLATILE_FLOW_START_S); // 흐름 시작 후 일정 유량 가정
const VOLATILE_DOSE_G = 18;

// 5개 계열 평균. 측정 끝(약 1:1.84) 이후는 마지막 기울기로 연장한 값
const aromaRaw = (ratio: number) => {
  const t = (ratio * VOLATILE_DOSE_G) / VOLATILE_FLOW_G_PER_S + VOLATILE_FLOW_START_S;
  const mean = (i: number) =>
    (Object.values(VOLATILES) as (readonly number[])[]).reduce((sum, row) => sum + row[i], 0) / 5;
  const lastIdx = VOLATILE_TIMES.length - 1;
  if (t >= VOLATILE_TIMES[lastIdx]) {
    const decayPerS = Math.log(mean(lastIdx - 2) / mean(lastIdx)) / (VOLATILE_TIMES[lastIdx] - VOLATILE_TIMES[lastIdx - 2]);
    return mean(lastIdx) * Math.exp(-decayPerS * (t - VOLATILE_TIMES[lastIdx]));
  }
  const i = VOLATILE_TIMES.findIndex((x) => x > t) - 1;
  const span = VOLATILE_TIMES[i + 1] - VOLATILE_TIMES[i];
  return mean(i) + ((mean(i + 1) - mean(i)) * (t - VOLATILE_TIMES[i])) / span;
};

/** 향미 곡선의 모양 — 그림에서 읽은 값의 잔물결이 정밀해 보이지 않도록 앞뒤 구간을 평균한다 */
export const aromaShape = (ratio: number) => {
  const offsets = [-0.2, -0.1, 0, 0.1, 0.2];
  return offsets.reduce((sum, d) => sum + aromaRaw(Math.max(0, ratio + d)), 0) / offsets.length;
};

// ── 해석: 배전도별 맛 모식도 ──
export type RoastKey = 'medium' | 'mediumDark' | 'dark';
export type FlavorKey = 'acidity' | 'aroma' | 'sweetness' | 'body' | 'bitterness' | 'burnt';

// 실선(shapeMeasured): 곡선 모양을 뒷받침하는 측정이 있음. 점선: 화학·전문가 의견에서 끌어낸 해석.
// 높이는 어느 쪽도 측정값이 아니다.
export const FLAVORS: { key: FlavorKey; label: string; color: string; shapeMeasured: boolean }[] = [
  { key: 'acidity', label: '산미', color: 'var(--chart-cat-1)', shapeMeasured: false },
  { key: 'aroma', label: '향미', color: 'var(--chart-cat-2)', shapeMeasured: true },
  { key: 'sweetness', label: '단맛', color: 'var(--chart-cat-3)', shapeMeasured: false },
  { key: 'body', label: '바디', color: 'var(--chart-cat-4)', shapeMeasured: true },
  { key: 'bitterness', label: '쓴맛', color: 'var(--chart-cat-5)', shapeMeasured: false },
  { key: 'burnt', label: '탄내', color: 'var(--chart-cat-6)', shapeMeasured: false },
];

// 8단계 대응은 Kim 2024, 배전 이름 대응은 업계 관행이 엇갈려 하우스 제안값이다(중강배전은 공인 수치 없음).
export const ROASTS: { key: RoastKey; label: string }[] = [
  { key: 'medium', label: '중배전' },
  { key: 'mediumDark', label: '중강배전' },
  { key: 'dark', label: '강배전' },
];

// 중배전↔중강배전 비율만 근거가 있다: Shi 2024 콜드브루 Agtron 62→53 (산 ×0.86, 바디 ×1.36, 쓴맛 ×1.51). 에스프레소 값 아님.
// 강배전 값과 향미·단맛·탄내 높이는 방향만 근거가 있고 크기는 임의로 정한 값이다.
// 강배전 바디는 감소 여부가 미확인이라 중강배전과 같게 둔다.
export const ROAST_AMPLITUDES: Record<
  RoastKey,
  { acidity: number; aroma: number; sweetness: number; body: number; bitterFast: number; bitterHarsh: number; burnt: number }
> = {
  medium: { acidity: 0.81, aroma: 0.95, sweetness: 0.6, body: 0.7, bitterFast: 0.4, bitterHarsh: 0.05, burnt: 0.05 },
  mediumDark: { acidity: 0.7, aroma: 0.85, sweetness: 0.5, body: 0.95, bitterFast: 0.6, bitterHarsh: 0.12, burnt: 0.2 },
  dark: { acidity: 0.55, aroma: 0.65, sweetness: 0.3, body: 0.95, bitterFast: 0.7, bitterHarsh: 0.3, burnt: 0.6 },
};

const decay = (key: CompoundKey, ratio: number) => Math.exp(-(ratio * DOSE_G) / SCHMIEDER_FIT[key].lambda);

/** 배전도·추출 비율에서의 상대 강도(눈금 없는 모식도용). 시간 축의 모양은 배전도와 무관하게 공유한다 — 배전도별 구간 측정이 없다. */
export const flavorAt = (roast: RoastKey, ratio: number): Record<FlavorKey, number> => {
  const a = ROAST_AMPLITUDES[roast];
  return {
    acidity: a.acidity * decay('trigonelline', ratio), // 산의 에스프레소 구간 측정이 없어 가장 빠른 성분을 대용
    aroma: a.aroma * aromaShape(ratio),
    sweetness: a.sweetness * Math.exp(-((ratio - 1.2) ** 2) / (2 * 0.8 ** 2)), // 설탕 곡선이 아니라 지각된 균형
    body: a.body * decay('tds', ratio),
    bitterness:
      a.bitterFast * decay('caffeine', ratio) + // 첫 방울부터 있고 줄어드는 쓴맛
      a.bitterHarsh * (1 - Math.exp(-ratio / 0.5)) * Math.exp(-ratio / 3), // 분쇄 입자에 오래 남는 거친 쓴맛
    burnt: a.burnt * Math.exp(-ratio / 6), // 시간이 아니라 배전도가 높이를 정한다
  };
};

export const RATIO_STEPS = Array.from({ length: 61 }, (_, i) => i * 0.05);

export const formatRatio = (r: number) => (r === 0 ? '첫 방울' : `1:${Number(r.toFixed(2))}`);

// ── 출처 ──
// access: 원문 = 본문 열람 / 초록 = 초록·요약만 열람 / 간접 = 다른 글의 소개로 확인
export type TheorySource = {
  id: string;
  cite: string;
  use: string;
  url: string;
  kind: '에스프레소' | '드립' | '콜드브루' | '침출' | '원두' | '일반';
  access: '원문' | '초록' | '간접';
};

export const THEORY_SOURCES: TheorySource[] = [
  { id: 'schmieder', cite: 'Schmieder, Pannusch, Vannieuwenhuyse, Briesen, Minceva (2023), Foods 12(15):2871', use: '성분별 농도 감소, 잔 질량·수율', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10418593/', kind: '에스프레소', access: '원문' },
  { id: 'sanchez', cite: 'Sánchez López et al. (2016), Int. J. Mass Spectrometry 401:22-30', use: '향 성분 5개 계열의 실시간 신호', url: 'https://pages.uoregon.edu/chendon/coffee_literature/old_literature/2016%20Int.%20J.%20Mass.%20Spec.,%20Extraction%20kinetics%20from%20mass%20spec%20--%20acidified,%20real-time.pdf', kind: '에스프레소', access: '원문' },
  { id: 'ludwig', cite: 'Ludwig et al. (2012), Food Research International 48:57-64', use: '구간별 카페인·클로로겐산·갈색 성분', url: 'https://dadun.unav.edu/handle/10171/35049', kind: '에스프레소', access: '원문' },
  { id: 'gloess', cite: 'Gloess et al. (2013), Eur. Food Res. Technol.', use: '바디와 고형물의 상관, 산미와 pH의 무상관, 잔 단위 패널', url: 'https://digitalcollection.zhaw.ch/bitstream/11475/4251/2/2013_Gloess-etal_Comparison-of-nine-common-coffee-extraction-methods.pdf', kind: '에스프레소', access: '원문' },
  { id: 'colloid', cite: 'Barista Magazine, 초기 분획의 콜로이드 연구 소개 기사', use: '바디 관련 콜로이드가 초기 분획에 집중', url: 'https://www.baristamagazine.com/why-the-first-few-seconds-of-an-espresso-shot-are-arguably-the-most-important/', kind: '에스프레소', access: '간접' },
  { id: 'batali', cite: 'SCA 25 Magazine Issue 11, Batali·Ristenpart 등 UC Davis 드립 분획 연구 소개', use: '쓴맛은 앞, 단맛은 뒤 분획에서 높음', url: 'https://sca.coffee/sca-news/25-magazine/issue-11/less-strong-more-sweet-byd7r', kind: '드립', access: '간접' },
  { id: 'bartelak', cite: 'Bartelak, SCA News, Exploring Alternative Brewing Methods to Drive Sweetness', use: '단맛은 당 농도로 설명되지 않음', url: 'https://sca.coffee/sca-news/community/exploring-alternative-brewing-methods-to-drive-sweetness-y6s4w', kind: '드립', access: '원문' },
  { id: 'blumberg', cite: 'Blumberg, Frank, Hofmann (2010), J. Agric. Food Chem. 58(6):3720', use: '배전이 강해지며 쓴맛 성분의 종류가 바뀌고 일부는 입자에 남음', url: 'https://portal.fis.tum.de/en/publications/quantitative-studies-on-the-influence-of-the-bean-roasting-parame/', kind: '일반', access: '초록' },
  { id: 'frank', cite: 'Frank et al. (2007), J. Agric. Food Chem.', use: '강배전 쓴맛 성분(페닐인단류)', url: 'https://doi.org/10.1021/jf0632280', kind: '원두', access: '초록' },
  { id: 'acs', cite: 'ACS 보도자료(2007), Hofmann 연구 소개, EurekAlert', use: '카페인은 쓴맛의 약 15%', url: 'https://www.eurekalert.org/news-releases/877914', kind: '일반', access: '간접' },
  { id: 'gagne', cite: 'Gagné (2019), The Dynamics of Coffee Extraction, Coffee ad Astra', use: '빠른 성분이 신맛이라는 연결은 추측이라는 단서', url: 'https://www.coffeeadastra.com/2019/01/29/the-dynamics-of-coffee-extraction/', kind: '일반', access: '원문' },
  { id: 'rao-ratio', cite: 'Rao (2017), The 2:1 Ratio', use: '비율을 늘리면 농도·바디를 내주고 향미의 선명함을 얻음', url: 'https://www.scottrao.com/blog/2017/12/17/the-21-ratio', kind: '에스프레소', access: '원문' },
  { id: 'rao-astringency', cite: 'Rao (2020), Managing Astringency in Coffee Brewing', use: '떫은맛과 채널링(전문가 의견)', url: 'https://www.scottrao.com/blog/2020/10/9/managing-astringency-in-coffee-brewing', kind: '일반', access: '원문' },
  { id: 'carcea', cite: 'Carcea et al., Eur. Food Res. Technol., DOI 10.1007/s00217-023-04213-0', use: '배전이 강할수록 산미 감소, 크림·바디 증가', url: 'https://link.springer.com/article/10.1007/s00217-023-04213-0', kind: '에스프레소', access: '초록' },
  { id: 'kucera', cite: 'Kučera et al. (2016), Food Chemistry, PMID 26776030', use: '네 배전도의 에스프레소가 화학적으로 구분됨', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0308814615303587', kind: '에스프레소', access: '초록' },
  { id: 'shi', cite: 'Shi et al. (2024), Foods 13(19):3119', use: 'Agtron 73/62/53의 산·바디·쓴맛 차이(배율의 근거)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11475540/', kind: '콜드브루', access: '원문' },
  { id: 'hu', cite: 'Hu et al. (2020), Food Chemistry 331:127329', use: '향·산미는 중간 배전에서 최고, 바디는 배전 따라 상승, 강배전 당 소실', url: 'https://oww-files-public.sfo3.cdn.digitaloceanspaces.com/f/f4/2020_Effect_of_roasting_degree_of_coffee_beans_on_sensory_evaluation-_Research_from_the_perspective_of_major_chemical_ingredients.pdf', kind: '원두', access: '원문' },
  { id: 'lindsey', cite: 'Lindsey et al. (2024), Scientific Reports 14:29126', use: '배전도와 추출 수율의 관계는 연구마다 엇갈림', url: 'https://www.nature.com/articles/s41598-024-80385-3', kind: '드립', access: '원문' },
  { id: 'coffeereview', cite: 'Coffee Review, Roast Definitions', use: '참고 그래프가 배전도 서술과 맞는다는 비교', url: 'https://www.coffeereview.com/roast-definitions/', kind: '일반', access: '원문' },
  { id: 'gute', cite: '구테로이테 블로그(2026-10-20)', use: '산미·단맛·쓴맛 순서론 비판(국내 업계 의견)', url: 'https://blog.naver.com/gute_leute/224446388272', kind: '일반', access: '원문' },
];

export const sourceNumber = (id: string) => THEORY_SOURCES.findIndex((s) => s.id === id) + 1;
