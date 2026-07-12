// 드립 레시피 프리셋 — 매장 기준(ICE/HOT) + 챔피언 레시피 4종.
// 프리셋 선택 시 값이 그대로 폼에 채워지고, 이후엔 드랍다운으로 자유 조정.

export interface PresetStep {
  at: string; // 시작 시각 'm:ss'
  water: number; // 물량 g (0 = 동작만, 예: 드리퍼 분리)
  label: string;
}

export interface DripPreset {
  id: string;
  name: string;
  source: string; // 출처 표기 (대회·채널)
  dripper: string;
  defaultDoseG: number;
  tempC: number | null; // 출처에 없으면 null
  grind: string;
  totalTime: string; // 드리퍼 분리 시각. 출처에 없으면 ''
  steps: PresetStep[];
  extra?: (scale: (g: number) => number) => string; // 가수 등 추가 안내
}

export const DRIP_PRESETS: DripPreset[] = [
  // ---- 매장 기준 레시피 (양재천점) ----
  {
    id: 'house-ice',
    name: 'ICE 필터커피',
    source: '매장 기준',
    dripper: '',
    defaultDoseG: 22,
    tempC: null, // 원두 배전도에 따라 92/93 선택 — extra 안내 참조
    grind: 'EK43(양재천) 6.0~7.0',
    totalTime: '3:30',
    steps: [
      { at: '', water: 35, label: '뜸' },
      { at: '', water: 45, label: '1차' },
      { at: '', water: 45, label: '2차' },
      { at: '', water: 40, label: '3차' },
      { at: '', water: 35, label: '4차' },
    ],
    extra: () =>
      '물온도 — 과테말라·브라질·콜롬비아·온두라스 92°C / 에티오피아·케냐·페루·게이샤 93°C.\n1~4차를 3차로 줄여 푸어링당 더 많이 부으며 빠르게 끝내기도.',
  },
  {
    id: 'house-hot',
    name: 'HOT 필터커피',
    source: '매장 기준',
    dripper: '',
    defaultDoseG: 18,
    tempC: null,
    grind: 'EK43(양재천) 6.5~7.5',
    totalTime: '3:30',
    steps: [
      { at: '', water: 30, label: '뜸' },
      { at: '', water: 50, label: '1차' },
      { at: '', water: 50, label: '2차' },
      { at: '', water: 60, label: '3차' },
      { at: '', water: 60, label: '4차' },
    ],
    extra: () =>
      '물온도 — 과테말라·브라질·콜롬비아·온두라스 92°C / 에티오피아·케냐·페루·게이샤 93°C.\n1~4차를 3차로 줄여 푸어링당 더 많이 부으며 빠르게 끝내기도.',
  },
  // ---- 챔피언 레시피 ----
  {
    id: 'kasuya-46',
    name: '테츠 카스야 4:6',
    source: '2016 월드 브루어스컵 우승',
    dripper: '하리오 V60',
    defaultDoseG: 20,
    tempC: 93,
    grind: '굵게 (굵은소금)',
    totalTime: '3:30',
    steps: [
      { at: '0:00', water: 60, label: '1차 — 적게 부으면 단맛↑' },
      { at: '0:45', water: 60, label: '2차' },
      { at: '1:30', water: 60, label: '3차' },
      { at: '2:15', water: 60, label: '4차' },
      { at: '3:00', water: 60, label: '5차' },
      { at: '3:30', water: 0, label: '드리퍼 분리' },
    ],
    extra: () => '앞 40%(1·2차)가 단맛·산미, 뒤 60%(3~5차)가 농도 결정. 연하게 마시려면 뒤 60%를 2회로.',
  },
  {
    id: 'jeong-484',
    name: '정인성 40 80 40',
    source: '핸드드립 세계대회 2위 · 언스페셜티',
    dripper: '하리오 V60',
    defaultDoseG: 20,
    tempC: 100,
    grind: '',
    totalTime: '2:40',
    steps: [
      { at: '0:00', water: 40, label: '뜸 — 빠르게 붓기 (도징 1:2)' },
      { at: '1:00', water: 80, label: '가운데 위주로 집중해서' },
      { at: '2:00', water: 40, label: '원을 더 크게 그리며' },
      { at: '2:40', water: 0, label: '드리퍼 분리 (물 남아도 종료)' },
    ],
    extra: (s) =>
      `포트는 계속 가열해 100°C 유지. 추출 후 뜨거운 물 ${s(120)}g 가수, 아이스는 찬물 ${s(80)}g (원액 1:8).`,
  },
  {
    id: 'izaki',
    name: '히데 이자키',
    source: '2014 월드 바리스타 챔피언',
    dripper: '',
    defaultDoseG: 20,
    tempC: 93,
    grind: '굵게',
    totalTime: '',
    steps: [
      { at: '0:00', water: 60, label: '뜸 — 드리퍼 스월링' },
      { at: '1:00', water: 60, label: '1차 — 낮은 낙차' },
      { at: '2:00', water: 180, label: '2차 — 약 3cm 높은 낙차' },
    ],
    extra: () => '낙차 높이로 교반 조절 — 높게 부어 물 안에서 커피가 잘 섞이게.',
  },
  {
    id: 'sestic',
    name: '샤샤 세스틱',
    source: '2015 월드 바리스타 챔피언',
    dripper: '',
    defaultDoseG: 18,
    tempC: null,
    grind: '',
    totalTime: '',
    steps: [
      { at: '0:00', water: 50, label: '뜸' },
      { at: '0:35', water: 70, label: '1차 — 빠르게' },
      { at: '1:10', water: 50, label: '2차' },
      { at: '1:35', water: 50, label: '3차 — 낙차 이용' },
      { at: '2:35', water: 50, label: '4차' },
    ],
    extra: () => '내추럴 커피는 필터 린싱 생략.',
  },
];

export const presetById = (id: string | null | undefined) =>
  DRIP_PRESETS.find((p) => p.id === id) ?? null;

// 프리셋을 레시피 폼 값으로 변환 — 물 붓는 단계는 구조화된 pours로,
// 물량 0 단계(드리퍼 분리 등)와 extra 안내는 메모로 넘긴다.
export function applyPreset(p: DripPreset) {
  const pours = p.steps
    .filter((s) => s.water > 0)
    .map((s) => ({ water: s.water, at: s.at || undefined, label: s.label || undefined }));
  const waterG = pours.reduce((a, s) => a + s.water, 0);
  const actionLines = p.steps.filter((s) => s.water === 0).map((s) => `${s.at} ${s.label}`.trim());
  const extra = p.extra?.((g) => g);
  return {
    doseG: p.defaultDoseG,
    waterG,
    tempC: p.tempC,
    grind: p.grind,
    totalTime: p.totalTime,
    pours,
    notes: [...actionLines, extra].filter(Boolean).join('\n'),
  };
}
