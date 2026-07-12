// 필터 레시피 추천 — 월드 브루어스컵(WBrC) 챔피언 레시피를 매장 카드 형식으로 정리.
// 월드 바리스타 챔피언십(WBC)은 에스프레소 종목이라 필터 레시피가 없어 브루어스컵 기준.
// 24·25·26년 우승 레시피만 수록 (출처에 공개된 수치 그대로, 없는 값은 표기 생략).

export interface ChampionStep {
  at: string; // 시각 'm:ss'
  water: number; // 물 투입량 g (0 = 동작만)
  label: string;
}

export interface ChampionRecipe {
  year: number;
  event: string;
  location: string;
  champion: string;
  nation: string; // 챔피언 국적
  coffee: string;
  dripper: string;
  filter?: string;
  doseG: number;
  waterG: number;
  ratio: string;
  temp: string; // 단계별로 다르면 화살표 표기
  grind?: string;
  brewWater?: string; // 추출수 TDS 등
  totalTime: string;
  steps: ChampionStep[];
  tips: string[];
  sources: { label: string; url: string }[];
}

export const CHAMPION_RECIPES: ChampionRecipe[] = [
  {
    year: 2026,
    event: '월드 브루어스컵',
    location: '브뤼셀',
    champion: '나스 자파 (Nas Jaafar)',
    nation: '말레이시아',
    coffee: '파나마 핀카 누구오 게이샤 · 애너로빅 내추럴',
    dripper: 'UFO V3 + 하리오 스위치 베이스',
    doseG: 15,
    waterG: 200,
    ratio: '1 : 13.3',
    temp: '92°C',
    grind: '700µm (옵션오 라곰 01 · 사이즈 7 · 580rpm)',
    brewWater: 'TDS 50ppm',
    totalTime: '2:10',
    steps: [
      { at: '0:00', water: 100, label: '푸어 — 스위치 열림 (퍼콜레이션)' },
      { at: '0:58', water: 0, label: '스위치 닫기 — 이머전 시작' },
      { at: '1:00', water: 100, label: '푸어 (총 200g)' },
      { at: '2:00', water: 0, label: '스위치 열기 — 배수' },
      { at: '2:10', water: 0, label: '추출 종료' },
    ],
    tips: [
      '퍼콜레이션(투과)과 이머전(침지)을 한 추출에 결합 — 스위치형 드리퍼가 있어야 재현 가능.',
      '짧은 비율(1:13.3)로 진하게 뽑는 대신 침지 구간으로 과추출을 눌러 균형을 잡는 구조.',
    ],
    sources: [
      { label: 'Coffee Notes — 레시피', url: 'https://www.coffeenotes.fyi/recipe/ufo-v3-nas-jaafar-wbc-2026' },
      { label: 'Roastopedia — 대회 리포트', url: 'https://roastopedia.com/2026-world-brewers-cup/' },
      { label: 'WCC 공식 발표', url: 'https://wcc.coffee/latest-news/wbrc-winners' },
    ],
  },
  {
    year: 2025,
    event: '월드 브루어스컵',
    location: '자카르타',
    champion: '조지 펭 (George Peng)',
    nation: '대만',
    coffee: '파나마 게이샤 · 로스팅 프로파일 3종을 5g씩 블렌드',
    dripper: 'Solo 드리퍼 + Solo 필터',
    doseG: 15,
    waterG: 210,
    ratio: '1 : 14',
    temp: '96°C → 마지막 푸어 80°C',
    grind: 'FM 그라인더 11클릭 (미디엄)',
    brewWater: 'TDS 40ppm',
    totalTime: '1:45',
    steps: [
      { at: '0:00', water: 30, label: '뜸 @96°C — 반시계 3바퀴, 약 6초' },
      { at: '0:30', water: 90, label: '푸어 @96°C — 10초에 걸쳐' },
      { at: '1:10', water: 90, label: '푸어 @80°C — 멜로드립(샤워스크린)' },
      { at: '1:45', water: 0, label: '추출 종료' },
    ],
    tips: [
      '온도 설계가 핵심 — 고온으로 시작해 마지막 푸어만 80°C로 낮춰 플로럴 향의 손상을 막는다.',
      '추출 후 카라페에서 65°C까지 레스팅 → 예열한 잔에 부어 50°C에 서빙 (관능 피크 온도 관리).',
      '주전자 스파우트까지 뜨거운 물로 예열해 첫 푸어 온도 손실을 차단.',
    ],
    sources: [
      { label: 'Slow Pour Supply — 파이널 레시피', url: 'https://www.slowpoursupply.co/blogs/journal/2025-world-brewers-cup-champion-george-pengs-solo-dripper-recipe' },
      { label: 'Sprudge — 챔피언처럼 내리기', url: 'https://sprudge.com/how-to-brew-coffee-like-the-2025-world-brewers-cup-champion-338576.html' },
    ],
  },
  {
    year: 2024,
    event: '월드 브루어스컵',
    location: '시카고',
    champion: '마틴 뵐플 (Martin Wölfl)',
    nation: '오스트리아',
    coffee: '파나마 핀카 마야 게이샤 · 애너로빅 내추럴 (허니듀·로즈힙·체리)',
    dripper: 'OREA V4 (fast bottom)',
    filter: 'Sibarist FAST',
    doseG: 17,
    waterG: 270,
    ratio: '1 : 15.9',
    temp: '93°C',
    grind: '490µm (코만단테 C40 21~25클릭)',
    totalTime: '2:20~2:25',
    steps: [
      { at: '0:00', water: 60, label: '뜸' },
      { at: '0:40', water: 60, label: '1차 (누적 120ml)' },
      { at: '1:20', water: 50, label: '2차 (누적 170ml)' },
      { at: '2:00', water: 100, label: '3차 (누적 270ml)' },
      { at: '2:20', water: 0, label: '드로다운 완료 목표 (~2:25)' },
    ],
    tips: [
      '빠른 추출 지향 — fast 드리퍼·filter로 2분대 초반에 끝내 클린함과 단맛을 남긴다.',
      '멜로드립(샤워스크린)으로 난류를 줄이고, 니들 디스트리뷰터로 커피 베드를 풀어 고른 적심.',
      '무대에서도 즉석 분쇄 — 갓 간 원두의 향이 승부처였다고 본인이 언급.',
    ],
    sources: [
      { label: 'European Coffee Trip — 우승 레시피', url: 'https://europeancoffeetrip.com/winning-pour-over-recipe-martin-woelfl/' },
      { label: 'ECT 유튜브 — 레시피 영상', url: 'https://www.youtube.com/watch?v=3SIFFaT1MFU' },
    ],
  },
];
