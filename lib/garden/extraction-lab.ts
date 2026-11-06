// 커피 머신 추출 이론 — 분쇄도·온도·수율 지도 데이터 (대표 검토용 /garden/theory-lab).
// 값은 두 층으로 나뉜다. 섞지 말 것.
//   측정: 논문 표·그림 판독·매장 굴절계 수치 (SCHMIEDER_VARIANTS, CAMERON, KHU_GRIND, BATALI_AXIS, TEMP_SWEEPS)
//   해석: 지도 위 조작 화살표, 규칙 판정 (MAP_ARROWS, RulesTable)
// 근거 정리: 옵시디언 '에스프레소 분쇄도·온도 추출 양상 (리서치 2026-11-06)'.
import { THEORY_SOURCES, type TheorySource } from './extraction-theory';

// ── 측정: Schmieder 2023 Table A1 — TDS 적합 c(m)=c0·exp(−m/λ). 상대 농도는 λ만으로 정해진다 ──
// 분쇄 = Exp.3 / 7 / 4 (E65S 1.4 / 1.7 / 2.0 = 273 / 277 / 295 µm), 온도 = Exp.5 / 7 / 6 (실측 79 / 88 / 97 °C)
export type SchmiederVariant = { label: string; lambda: number; cupTdsG: number };
export const SCHMIEDER_VARIANTS: { grind: SchmiederVariant[]; temp: SchmiederVariant[] } = {
  grind: [
    { label: '1.4 (273 µm)', lambda: 16.59, cupTdsG: 3.65 },
    { label: '1.7 (277 µm)', lambda: 17.47, cupTdsG: 3.88 },
    { label: '2.0 (295 µm)', lambda: 17.31, cupTdsG: 3.92 },
  ],
  temp: [
    { label: '79 °C', lambda: 17.98, cupTdsG: 3.96 },
    { label: '88 °C', lambda: 17.47, cupTdsG: 3.88 },
    { label: '97 °C', lambda: 17.31, cupTdsG: 4.01 },
  ],
};
export const LAB_DOSE_G = 20;

// ── 측정·그림 판독: Cameron 2020 Fig — EK43 커피 버, 20 g→40 g, 92 °C, 6 bar, 5반복 (±1 s, ±0.1 %p) ──
export type CameronPoint = { gs: number; timeS: number; ey: number; sd: number };
export const CAMERON: CameronPoint[] = [
  { gs: 1.1, timeS: 37.5, ey: 21.35, sd: 0.3 },
  { gs: 1.3, timeS: 35.5, ey: 21.95, sd: 0.3 },
  { gs: 1.5, timeS: 34, ey: 22.15, sd: 0.3 },
  { gs: 1.7, timeS: 30.5, ey: 23.1, sd: 0.3 },
  { gs: 1.9, timeS: 28.5, ey: 22.5, sd: 0.2 },
  { gs: 2.1, timeS: 26.5, ey: 21.6, sd: 0.1 },
  { gs: 2.3, timeS: 24, ey: 20.7, sd: 0.1 },
];
// 균질 흐름 모델(20 g, 40 g 출력)은 양 끝값만 읽혀 직선으로 잇는다
export const CAMERON_MODEL_20G = { from: { gs: 1.1, ey: 24.6 }, to: { gs: 2.3, ey: 20.5 } };
export const cameronModelEy = (gs: number) => {
  const { from, to } = CAMERON_MODEL_20G;
  return from.ey + ((gs - from.gs) / (to.gs - from.gs)) * (to.ey - from.ey);
};
export const CAMERON_PEAK_GS = 1.7;

// ── 측정: 신우리·최유미·윤혜현 2011 — 강배전 블렌드, 7.5 g→30 mL, 훈련 패널 10명, 15 cm 선척도 ──
export type KhuLevel = 'coarse' | 'fine' | 'very fine';
export const KHU_LEVELS: KhuLevel[] = ['coarse', 'fine', 'very fine'];
export const KHU_MEASURED: { label: string; values: string[] }[] = [
  { label: '샷 시간(초)', values: ['≈10', '25~30', '≈60'] },
  { label: '수율(%, 전도도식)', values: ['14.7', '19.3', '20.4'] },
  { label: '농도(%)', values: ['3.15', '4.12', '4.37'] },
  { label: 'pH', values: ['5.37', '5.44', '5.46'] },
  { label: 'CATA 어휘', values: ['tangy · flowery', 'syrupy · chocolaty', 'earthy'] },
];
export type KhuAttr = { key: string; label: string; values: [number, number, number]; sig: boolean; color: string };
export const KHU_ATTRS: KhuAttr[] = [
  { key: 'acidity', label: '산미', values: [10.8, 7.45, 7.78], sig: true, color: 'var(--chart-cat-1)' },
  { key: 'astringency', label: '떫은맛', values: [5.0, 5.98, 8.73], sig: true, color: 'var(--chart-cat-8)' },
  { key: 'bitterness', label: '쓴맛', values: [6.74, 7.14, 9.2], sig: false, color: 'var(--chart-cat-5)' },
  { key: 'sweetness', label: '단맛', values: [4.25, 5.87, 5.48], sig: false, color: 'var(--chart-cat-3)' },
  { key: 'body', label: '바디', values: [5.73, 5.83, 6.53], sig: false, color: 'var(--chart-cat-4)' },
];

// ── 측정·패널(드립): Batali 2020 Table S5 — 속성 평균(0~100). 온도 열은 모두 LSD 이내라 싣지 않는다 ──
export type BataliRow = { label: string; tds: string; pe: string; tdsNs?: boolean; peNs?: boolean };
export const BATALI_AXIS: BataliRow[] = [
  { label: '신맛', tds: '33 → 46', pe: '45 → 37' },
  { label: '쓴맛', tds: '35 → 44', pe: '39 → 41', peNs: true },
  { label: '떫은맛', tds: '30 → 40', pe: '37 → 34 (약)' },
  { label: '시트러스', tds: '28 → 40', pe: '38 → 31' },
  { label: '홍차', tds: '28 → 25', pe: '24 → 28' },
  { label: '단맛', tds: '23 → 21', pe: '23 → 21', tdsNs: true, peNs: true },
];

// ── 측정·패널(드립)·그림 판독: Guinard 2023 Fig 2·6 — 축 TDS 0.9~1.6% × EY 14~26%. 글자 크기 ∝ Batali 강도 ──
export const MAP_AXIS = { ey: [14, 26] as const, tds: [0.9, 1.6] as const };
export const MAP_STANDARD_BOX = { ey: [18, 22] as const, tds: [1.15, 1.35] as const }; // 저자들의 "Classic Standard"
export type MapLabel = { text: string; ey: number; tds: number; size: number; color: string; strong?: boolean };
export const MAP_LABELS: MapLabel[] = [
  { text: '신맛 · 시트러스', ey: 16, tds: 1.52, size: 20, color: 'var(--chart-cat-1)', strong: true },
  { text: '베리', ey: 15, tds: 1.4, size: 12, color: 'var(--chart-cat-1)' },
  { text: '떫은맛 · 점성(Thick)', ey: 20, tds: 1.53, size: 16, color: 'var(--chart-cat-8)', strong: true },
  { text: '쓴맛 · 로스티', ey: 24, tds: 1.52, size: 20, color: 'var(--chart-cat-5)', strong: true },
  { text: '번트 · 애시', ey: 23.5, tds: 1.4, size: 12, color: 'var(--chart-cat-5)' },
  { text: "'단맛'", ey: 15, tds: 0.95, size: 14, color: 'var(--chart-cat-3)' },
  { text: '묽음(Thin)', ey: 20, tds: 0.97, size: 12, color: 'var(--chart-axis-text)' },
  { text: '홍차', ey: 24, tds: 0.95, size: 14, color: 'var(--chart-cat-4)' },
];
// 해석: 에스프레소 조작이 두 축을 어느 방향으로 미는지. 크기는 임의, 방향만 뜻이 있다.
export type MapArrow = { text: string; from: [number, number]; to: [number, number] }; // [ey, tds]
export const MAP_ARROWS: MapArrow[] = [
  { text: '비율 늘림', from: [20.5, 1.22], to: [22.5, 1.08] },
  { text: '굵게(수율↓·농도↓)', from: [19.5, 1.22], to: [17.3, 1.12] },
  { text: '도징 늘림(추출량 고정)', from: [20, 1.3], to: [18.8, 1.45] },
];

// ── 측정: 매장 굴절계 온도 스윕 — 기기·원두가 달라 한 축에 겹치지 않는다 ──
export type TempSweep = { id: string; title: string; unit: '수율(%)' | '크레마 비율(%)'; note: string; domain: [number, number]; ticks: number[]; points: { c: number; v: number }[]; color: string };
export const TEMP_SWEEPS: TempSweep[] = [
  { id: 'fivesenses', title: 'Five Senses 2015', unit: '수율(%)', note: '22 g → 46~48 g · 온도당 6샷', domain: [17, 22], ticks: [17, 18, 19, 20, 21, 22], color: 'var(--chart-cat-8)', points: [{ c: 92, v: 18.95 }, { c: 94, v: 19.38 }, { c: 96, v: 19.4 }, { c: 98, v: 19.57 }] },
  { id: 'kaffeemacher', title: 'Kaffeemacher 2020', unit: '수율(%)', note: '19 g → 47 g · 약배전 · 온도당 7샷', domain: [17, 22], ticks: [17, 18, 19, 20, 21, 22], color: 'var(--chart-cat-8)', points: [{ c: 88, v: 18.39 }, { c: 93, v: 19.28 }, { c: 96, v: 20.35 }] },
  { id: 'beanbrothers', title: '빈브라더스', unit: '크레마 비율(%)', note: '20 g → 38 g · 온도당 5샷 · 95 °C 이상에서 패널 전원이 쓴맛·거친 촉감', domain: [25, 45], ticks: [25, 30, 35, 40, 45], color: 'var(--chart-cat-3)', points: [{ c: 87, v: 39.81 }, { c: 95, v: 31.11 }] },
];

// ── 출처 — 기존 THEORY_SOURCES 뒤에 이어 번호를 매긴다 ──
export const LAB_SOURCES: TheorySource[] = [
  { id: 'cameron', cite: 'Cameron et al. (2020), Matter 2:631', use: '분쇄 설정별 샷 시간·수율, 균질 흐름 모델', url: 'https://cms.hospitalitynet.org/assets/3772aa4f-535e-4df0-8dbf-26ac175b8a40.pdf', kind: '에스프레소', access: '원문' },
  { id: 'ribes', cite: 'Ribes, Decent Espresso docs (2019–2020)', use: '유량 제어·압력 주도 프로파일별 분쇄 스윕 EY', url: 'https://decentespresso.com/docs/easy_blooming_compared_to_the_default_and_gentlesweet_profiles', kind: '에스프레소', access: '원문' },
  { id: 'mckeon', cite: 'McKeon Aloe (2025), Espresso Volcano — Hedrick 8단계 스윕 재분석', use: '고운 쪽 하락 미재현, 편차 방향', url: 'https://rmckeon.medium.com/espresso-volcano-5f3e9b857322', kind: '에스프레소', access: '원문' },
  { id: 'hoffmann', cite: 'James Hoffmann, Understanding Espresso — Grind Size · Dose · Dial-in', use: '분쇄=교란 변수, 도징 시연, 기본 조정 규칙', url: 'https://www.youtube.com/watch?v=er2voEn8ZDU', kind: '에스프레소', access: '원문' },
  { id: 'hedrick', cite: 'Lance Hedrick, Espresso Variables · Light Roast Dial-in · Masterclass', use: '압력계 판별식, 비율이 수율의 1번 결정자', url: 'https://www.youtube.com/watch?v=j-Hu4hF5PTM', kind: '에스프레소', access: '원문' },
  { id: 'khu', cite: '신우리·최유미·윤혜현 (2011), 한국식품조리과학회지', use: '분쇄 3단계 QDA·수율·농도·pH', url: 'https://koreascience.kr/article/JAKO201116450099163.pdf', kind: '에스프레소', access: '원문' },
  { id: 'batali', cite: 'Batali, Ristenpart, Guinard (2020), Sci Rep 10:16450 + SI Table S5; Guinard et al. (2023), J Food Sci 88:2168', use: '수율–농도 맛 지도, 온도 무효과', url: 'https://www.nature.com/articles/s41598-020-73341-4', kind: '드립', access: '원문' },
  { id: 'smrke', cite: 'Smrke et al. (2024)', use: '분쇄·미분이 바꿔도 EY–시간 점이 한 곡선 위', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10920694/', kind: '에스프레소', access: '원문' },
  { id: 'bang', cite: '방현영(2021 KNBC 챔피언), 안스타 인터뷰 1·2부 · 2022 · 2025 영상', use: '분쇄=산미 직접 연관, 온도 상수, 언더도징', url: 'https://www.youtube.com/watch?v=xntdu6P2RRo', kind: '에스프레소', access: '원문' },
  { id: 'ansta', cite: '안스타 (2024), 분쇄도·도징 영상', use: '곱게=자극적 산미+쓴맛, 도징 반대 처방', url: 'https://www.youtube.com/watch?v=aXH7cqG64Sg', kind: '에스프레소', access: '원문' },
  { id: 'bh', cite: 'Barista Hustle / Perger, Understanding Yield · Analyzing Dose · Espresso Compass', use: '비율=농도·수율 슬라이더, 도징 고정', url: 'https://www.baristahustle.com/blog/espresso-recipes-understanding-yield/', kind: '에스프레소', access: '원문' },
  { id: 'bb-time', cite: '빈브라더스, 추출시간별 전자혀 측정', use: '길게 뽑을수록 신맛↓ 단·쓴맛↑', url: 'https://beanbrothers.co.kr/info/bb_contents_detail?goodsNo=1000000491', kind: '에스프레소', access: '원문' },
  { id: 'klotz', cite: 'Klotz et al. (2020)', use: '80 vs 93 °C 삼각검사 비구별', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7022572/', kind: '에스프레소', access: '원문' },
  { id: 'kwon', cite: '권혁수, 도징량의 비밀 (2025) — 대회 주관 미확인', use: '언더도징 기전, 온도는 마지막', url: 'https://www.youtube.com/watch?v=k6Ldtk1bmAE', kind: '에스프레소', access: '원문' },
  { id: 'socratic', cite: 'Socratic Coffee (2016, 2024)', use: '체질 입자 실험, 고정 분쇄 EY 잡음 바닥', url: 'https://socraticcoffee.com/2024/04/assessing-the-impact-of-rdt-on-espresso-extraction/', kind: '에스프레소', access: '원문' },
  { id: 'ramg', cite: 'Coffee RamG (2022)', use: '같은 시간이어도 굵으면 더 신맛', url: 'https://www.youtube.com/watch?v=gZ8GTjjtuKw', kind: '에스프레소', access: '원문' },
  { id: 'bb-temp', cite: '빈브라더스 온도 실험 (블랙워터이슈 재게시)', use: '온도별 TDS·크레마·패널', url: 'https://bwissue.com/coffeestory/1336337', kind: '에스프레소', access: '원문' },
  { id: 'andueza', cite: 'Andueza et al. (2003), J Sci Food Agric 83:240; JAFC 51:7034', use: '온도 4단계·분쇄 3단계 관능', url: 'https://doi.org/10.1002/jsfa.1304', kind: '에스프레소', access: '초록' },
  { id: 'rao-myths', cite: 'Scott Rao, Extraction Myths · Decent masterclass', use: '"과다추출"의 상당수는 채널링 떫은맛', url: 'https://www.scottrao.com/blog/extraction-myths', kind: '에스프레소', access: '원문' },
  { id: 'explorer', cite: '커피찾는남자 (2018), 도징·비율별 수율', use: '22 g/34 g 17.8% < 20 g/41 g 18.9%', url: 'https://coffeexplorer.com/684', kind: '에스프레소', access: '원문' },
  { id: 'fivesenses', cite: 'Five Senses (2015), Brew temperature and its effects on espresso', use: '온도 4단계 수율·TDS', url: 'https://www.fivesenses.com.au/blog/brew-temperature-and-its-effects-on-espresso/', kind: '에스프레소', access: '원문' },
  { id: 'kaffeemacher', cite: 'Kaffeemacher (2020), Espresso temperature', use: '온도 3단계 수율·TDS', url: 'https://kaffeemacher.de/en/blogs/kaffeewissen/espresso-temperature', kind: '에스프레소', access: '원문' },
];

/** 기존 출처 [1]~[19] 뒤에 이어 붙는 번호 */
export const labSourceNumber = (id: string) => THEORY_SOURCES.length + LAB_SOURCES.findIndex((s) => s.id === id) + 1;
