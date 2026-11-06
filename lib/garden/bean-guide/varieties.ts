// 품종. 평가값은 World Coffee Research 카탈로그의 잠재력·재배 특성이며 실제 컵의 맛이 아니다.
// quality: 고고도 품질 잠재력 / yieldLevel: 수확량 잠재력 / rust: 녹병 저항성. '—'는 카탈로그에서 확인하지 못한 값.
export type Variety = {
  name: string;
  about: string;
  quality: string;
  yieldLevel: string;
  rust: string;
  src: string[];
  onMenu?: boolean;
};

export const VARIETIES_SHOWN = 3;

export const VARIETY_GROUPS: { group: string; items: Variety[] }[] = [
  {
    group: '에티오피아 재래종 계열',
    items: [
      { name: 'Geisha', about: '1930년대 에티오피아에서 수집되어 1960년대 파나마에 배포됐습니다. 가지가 약해 한동안 널리 심지 않았습니다.', quality: '최상', yieldLevel: '낮음', rust: '중간', src: ['wcr-geisha'], onMenu: true },
      { name: 'Java', about: '에티오피아 재래 집단에서 선발됐습니다. 19세기 초 Java로 옮겨졌고 1991년 코스타리카에 도입됐습니다.', quality: '매우 좋음', yieldLevel: '중간', rust: '약함', src: ['wcr-java'], onMenu: true },
      { name: '74 시리즈', about: '74110·74112 등은 1974년 Jimma 연구소가 커피열매병 저항을 보고 선발했다고 알려져 있습니다. Heirloom으로 묶여 팔리기도 합니다. 74158의 선발 이력은 확인하지 못했습니다.', quality: '—', yieldLevel: '—', rust: '—', src: ['sucafina-glossary', 'sample-74110'] },
      { name: 'Sidra', about: '고정된 기준 유전자 지문이 없는 판매 이름입니다. 에콰도르 한 농장의 소수 표본 검사에서 Sidra로 팔린 나무 일부는 Batian과 호환되는 결과가 나왔습니다.', quality: '—', yieldLevel: '—', rust: '—', src: ['frontiers-sidra'] },
    ],
  },
  {
    group: 'Bourbon·Typica 계열',
    items: [
      { name: 'Bourbon', about: '18세기 초 예멘에서 Bourbon섬(현 레위니옹)으로 옮겨졌고, 1860년경 브라질에 도달했습니다.', quality: '매우 좋음', yieldLevel: '중간', rust: '약함', src: ['wcr-bourbon'] },
      { name: 'Typica', about: '예멘, 인도, Java를 거쳐 1706년 암스테르담으로 옮겨졌고, 식민지 무역로를 따라 아메리카로 퍼졌습니다.', quality: '매우 좋음', yieldLevel: '낮음', rust: '약함', src: ['wcr-typica'] },
      { name: 'Catuaí', about: 'Mundo Novo와 Caturra의 교배종입니다. 브라질 IAC가 육종해 1972년 공개했고, 키가 작습니다.', quality: '좋음', yieldLevel: '중간', rust: '약함', src: ['wcr-catuai'], onMenu: true },
      { name: 'Caturra', about: 'Bourbon의 자연 변이입니다. 1915~1918년 브라질 Minas Gerais에서 발견됐고, 키가 작습니다.', quality: '좋음', yieldLevel: '중간', rust: '약함', src: ['wcr-caturra'] },
      { name: 'SL28', about: '1935년 케냐 Scott 연구소가 Tanganyika 집단의 나무 한 그루에서 선발했습니다. 유전적으로 Bourbon과 가깝습니다.', quality: '최상', yieldLevel: '낮음', rust: '약함', src: ['wcr-sl28'], onMenu: true },
      { name: 'SL34', about: '1930년대 말 케냐 Scott 연구소가 선발했습니다. 유전 검사로는 Typica와 가깝습니다.', quality: '최상', yieldLevel: '중간', rust: '약함', src: ['wcr-sl34'], onMenu: true },
      { name: 'Pacamara', about: 'Pacas와 Maragogipe의 교배종입니다. 엘살바도르 ISIC가 육종했고, 콩이 매우 크며 다음 세대에서 형질이 고르지 않습니다.', quality: '최상', yieldLevel: '낮음', rust: '약함', src: ['wcr-pacamara'] },
    ],
  },
  {
    group: '병 저항 교배 계열',
    items: [
      { name: 'Arara', about: '브라질 품종입니다. Obatã와 Catuaí Amarelo의 자연 교배로 소개됩니다. 녹병 저항 서술은 대부분 2차 자료입니다.', quality: '—', yieldLevel: '—', rust: '—', src: ['aegro-arara'], onMenu: true },
      { name: 'Paraíso', about: '브라질 품종입니다. Minas Gerais 농가 조사에서 Catuaí와 수확량 차이가 없었고 녹병 저항이 장점이었습니다. 계보는 확인하지 못했습니다.', quality: '—', yieldLevel: '—', rust: '—', src: ['ufpb-paraiso'], onMenu: true },
      { name: 'Castillo', about: '콜롬비아 Cenicafé가 2005년 공개했습니다. Caturra와 Timor Hybrid 교배 계통을 섞은 품종으로, 녹병 저항을 목표로 했습니다.', quality: '—', yieldLevel: '—', rust: '—', src: ['cenicafe-castillo'] },
      { name: 'Parainema', about: '온두라스 IHCAFE가 T5296에서 선발해 2004년 공개했습니다.', quality: '좋음', yieldLevel: '매우 높음', rust: '강함', src: ['wcr-parainema'] },
      { name: 'Ruiru 11', about: '1968년 케냐 커피열매병 유행을 계기로 육종해 1985년 공개한 F1 교배종입니다. 손으로 수분해 종자를 만듭니다.', quality: '좋음', yieldLevel: '매우 높음', rust: '강함', src: ['wcr-ruiru'] },
    ],
  },
];
