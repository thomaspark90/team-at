// 가공 방식. 시간·온도는 표준이 아니라 사례다. flavor 는 측정값이 아니라 자주 쓰이는 묘사다.
export type Process = {
  name: string;
  steps: string[];
  flavor: string;
  note: string;
  menu?: string; // 메뉴 이름 기준으로 이어지는 원두
  src: string[];
};
export type ProcessGroup = { key: string; label: string; desc: string; items: Process[] };

export const PROCESS_GROUPS: ProcessGroup[] = [
  {
    key: 'base',
    label: '기본 가공',
    desc: '과육과 점액질을 언제 제거하느냐로 나뉩니다.',
    items: [
      {
        name: 'Washed',
        steps: ['과육 제거', '발효로 점액질 분해', '세척', '파치먼트 상태로 건조'],
        flavor: '깨끗함, 밝은 산미',
        note: '케냐 공정 자료는 발효 1~4일, 건조 약 14일, 수분 55% → 11%입니다. 파티오 기준 6~7일이라는 자료도 있습니다.',
        menu: '후안 마르틴, 엘 푸엔테, 시다마, 가톰보야',
        src: ['fao-kenya', 'coffeeresearch', 'maxa-2026'],
      },
      {
        name: 'Natural',
        steps: ['체리째 건조', '수분 약 11%까지 뒤집으며 말림', '과육과 파치먼트를 한 번에 탈곡'],
        flavor: '단맛, 열대과일, 복합적인 향',
        note: '파티오 기준 12~14일 서술이 있고 기후에 따라 달라집니다. ‘과육의 당이 콩으로 옮겨가 달다’는 설명은 확인하지 못했습니다.',
        menu: '코라손 데 헤수스, 게샤빌리지, 세하도 부리티',
        src: ['fao-kenya', 'coffeeresearch', 'maxa-2026', 'knopp'],
      },
      {
        name: 'Honey (Pulped Natural)',
        steps: ['과육 제거', '점액질을 남긴 채 건조', '파치먼트 탈곡'],
        flavor: '단맛, 또렷한 바디',
        note: '꿀을 넣는 공정이 아닙니다. 점액질이 많을수록 Natural에, 적을수록 Washed에 가깝다고 설명합니다.',
        src: ['pdg-honey', 'coffeeresearch'],
      },
      {
        name: 'Wet-hulled (Giling Basah)',
        steps: ['과육 제거', '12~24시간 발효·세척', '1~2일 부분 건조', '수분 30~40%에서 탈각', '수분 약 12%까지 건조'],
        flavor: '묵직한 바디, 낮은 산미, 흙, 허브, 삼나무',
        note: '인도네시아의 대표 공정입니다. 이 맛이 공정 때문이라는 통제 연구는 찾지 못했고, Flores 시험에서는 품종에 따라 효과가 달랐습니다.',
        src: ['isc-wethull', 'mawardi'],
      },
      {
        name: 'Double Washed',
        steps: ['과육 제거', '24~48시간 발효', '세척', '추가 침지', '건조대에서 7~10일'],
        flavor: '깨끗함, 선명한 과일 산미',
        note: '케냐식 공정으로 알려져 있습니다. ‘72시간’은 표준이 아니라 12~72시간 범위의 상한이고, 깨끗함을 높인다는 통제 실험은 찾지 못했습니다.',
        src: ['ci-kenya', 'fao-kenya'],
      },
    ],
  },
  {
    key: 'controlled',
    label: '발효를 조절하는 가공',
    desc: '산소, 온도, 미생물을 조절합니다. 기본 가공과 함께 쓰입니다.',
    items: [
      {
        name: 'Anaerobic',
        steps: ['체리 또는 과육 제거한 콩을 밀폐', '저산소 상태로 발효', '세척 또는 그대로 건조'],
        flavor: '진한 과일, 발효 향',
        note: '산소 조건을 뜻할 뿐 정해진 레시피가 아닙니다. Yunnan 시험(7일 밀봉)에서는 일반 가공보다 점수가 높았지만 한 품종, 한 해의 결과입니다.',
        src: ['ozone-cm', 'maxa-2026', 'klatch', 'cs2023'],
      },
      {
        name: 'Carbonic Maceration',
        steps: ['온전한 체리 선별', '밀폐 탱크에 넣기', 'CO₂ 주입으로 산소 밀어내기', '발효 후 건조'],
        flavor: '선명하고 과일 향이 강함',
        note: 'Anaerobic의 한 종류로 와인 양조에서 왔습니다. 과육을 제거한 ‘washed carbonic’도 같은 이름으로 팔릴 만큼 느슨하게 쓰입니다.',
        src: ['ozone-cm'],
      },
      {
        name: '효모·젖산균 접종',
        steps: ['선택한 균주 준비', '발효 전이나 도중에 투입', '발효', '세척 또는 건조'],
        flavor: '균주와 공정에 따라 다름',
        note: '미생물만 넣고 새 당은 넣지 않습니다. 한 시험은 생두 생존력에는 영향이 있었지만 음료 관능에는 영향이 없었다고 결론 냈습니다.',
        menu: '엘 엔칸토(이름에 효모발효 표기)',
        src: ['pdg-coferment', 'jimenez', 'elhalis'],
      },
      {
        name: 'Thermal Shock',
        steps: ['발효', '온수로 세척', '곧바로 냉수로 세척', '건조'],
        flavor: '단맛을 강조한다는 판매자 설명',
        note: '온도는 판매자마다 다릅니다(40°C → 12°C, 또는 60~70도). 통제 연구는 찾지 못했고 발효 공정으로 볼지도 의견이 갈립니다.',
        menu: '엘 엔칸토 유사 상품',
        src: ['leaf-thermo', 'bw-thermal', 'g76'],
      },
    ],
  },
  {
    key: 'added',
    label: '재료를 넣는 가공',
    desc: '공식 정의는 없고, 두 이름이 섞여 쓰입니다.',
    items: [
      {
        name: 'Co-fermented',
        steps: ['체리 또는 과육 제거한 콩을 탱크에 넣기', '과일, 홉, 향신료, 과즙 등 첨가', '함께 발효', '건조'],
        flavor: '넣은 재료의 향이 함께 드러남',
        note: '새 재료와 당을 넣는다는 점이 접종과 다릅니다. 향이 미생물에서 왔는지 재료에서 왔는지는 더 연구가 필요합니다.',
        src: ['royal-coferment', 'pdg-coferment'],
      },
      {
        name: 'Infused',
        steps: ['커피를 따로 발효·가공', '향료나 첨가물로 향 입히기', '건조 또는 보관'],
        flavor: '넣은 향이 그대로 드러남',
        note: '재료가 발효에 관여하지 않고 향을 직접 더한다는 설명이 많습니다. 산지나 품종의 향이라고 설명하면 안 됩니다.',
        src: ['pdg-coferment', 'pdg-infused'],
      },
    ],
  },
];

// Honey 색 구분. 대표값이며 생산자마다 기준이 다르다.
export const HONEY_LEVELS = [
  { name: 'White', mucilage: '약 10%', near: 'Washed에 가까움' },
  { name: 'Yellow', mucilage: '약 25%', near: '' },
  { name: 'Red', mucilage: '약 50%', near: '' },
  { name: 'Black', mucilage: '75~100%', near: 'Natural에 가까움' },
];

export const PROCESS_RULES: { title: string; text: string; src: string[] }[] = [
  { title: '세계 대회', text: 'WBC 2026 규정은 생두 단계 이후의 첨가를 금지합니다. 향료, 액체, 가루도 포함합니다. 그 전 단계 첨가는 이 조항으로 막지 않습니다.', src: ['wbc-2026', 'pdg-wbc'] },
  { title: 'Best of Panama', text: '2024년 Infused로 판단한 커피 4건을 제외하고 별도 분류를 요구했습니다. 판별 방법은 기사에 나오지 않습니다.', src: ['dcn-infused'] },
  { title: '표시', text: '미국 기준으로 공동발효 재료 표기 의무가 없다는 서술이 있습니다. 한국 기준은 이번에 확인하지 못했습니다.', src: ['royal-coferment'] },
  { title: '스탭 설명', text: '첨가 여부를 모르면 단정하지 말고 로스터에게 확인합니다. 업계도 공정 공개를 투명성의 핵심으로 봅니다.', src: ['pdg-infused', 'pdg-coferment'] },
];
