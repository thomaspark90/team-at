// 드립 레시피 프리셋 — 매장 기준(ICE/HOT), 양재천점.
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
  grindMesh: number | null; // 분쇄도 수치 (EK43 양재천 기준, 0.1 단위)
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
    tempC: 92, // 기본 92°C — 에티오피아·케냐·페루·게이샤는 93으로 조정 (extra 안내)
    grindMesh: 6.5, // 권장 6.0~7.0의 가운데
    totalTime: '3:30',
    steps: [
      // 3차까지 · 총 190g (2026-10-31 대표 지정 — 이전 4차 35/45/45/40/35)
      { at: '', water: 35, label: '뜸' },
      { at: '', water: 55, label: '1차' },
      { at: '', water: 55, label: '2차' },
      { at: '', water: 45, label: '3차' },
    ],
    extra: () =>
      '분쇄도(EK43 양재천) 권장 6.0~7.0.\n물온도 — 과테말라·브라질·콜롬비아·온두라스 92°C / 에티오피아·케냐·페루·게이샤 93°C.',
  },
  {
    id: 'house-hot',
    name: 'HOT 필터커피',
    source: '매장 기준',
    dripper: '',
    defaultDoseG: 18,
    tempC: 92, // 기본 92°C — 에티오피아·케냐·페루·게이샤는 93으로 조정 (extra 안내)
    grindMesh: 7, // 권장 6.5~7.5의 가운데
    totalTime: '3:30',
    steps: [
      // 3차까지 · 총 230g — 뜸 35 + 65 + 65 + 65 (2026-10-31 대표 지정 — 이전 4차 30/50/50/60/60)
      { at: '', water: 35, label: '뜸' },
      { at: '', water: 65, label: '1차' },
      { at: '', water: 65, label: '2차' },
      { at: '', water: 65, label: '3차' },
    ],
    extra: () =>
      '분쇄도(EK43 양재천) 권장 6.5~7.5.\n물온도 — 과테말라·브라질·콜롬비아·온두라스 92°C / 에티오피아·케냐·페루·게이샤 93°C.',
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
    grindMesh: p.grindMesh,
    totalTime: p.totalTime,
    pours,
    notes: [...actionLines, extra].filter(Boolean).join('\n'),
  };
}
