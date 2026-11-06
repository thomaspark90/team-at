// 메뉴 이름 해독. 괄호 값은 이름에 없고 로스터 자료에서 확인한 내용이다.
export type MenuName = {
  menu: string;
  country: string;
  region: string;
  unit: string;
  variety: string;
  process: string;
  label: string;
  src: string[];
};

export const MENU_NAMES: MenuName[] = [
  { menu: '콜롬비아 후안 마르틴 아라라 워시드', country: '콜롬비아', region: '(Cauca)', unit: '후안 마르틴(농장)', variety: '아라라', process: '워시드', label: '', src: ['g136'] },
  { menu: '코스타리카 코라손 데 헤수스 자바 내추럴', country: '코스타리카', region: '(Chirripó)', unit: '코라손 데 헤수스(농장)', variety: '자바', process: '내추럴', label: '', src: ['g160', 'wcr-java'] },
  { menu: '온두라스 엘 푸엔테 라 라구나 카투아이 워시드', country: '온두라스', region: '(La Paz)', unit: '엘 푸엔테(농장)', variety: '카투아이', process: '워시드', label: '', src: ['g162'] },
  { menu: '에티오피아 게샤빌리지 게샤1391 수르마 내추럴', country: '에티오피아', region: '(West Omo 또는 Bench Maji)', unit: '게샤빌리지(농장), 수르마(구역)', variety: '게샤', process: '내추럴', label: '', src: ['geshavillage', 'g69', 'wcr-geisha'] },
  { menu: '콜롬비아 엘 엔칸토 게이샤 이그조틱 무산소발효 워시드 (효모발효)', country: '콜롬비아', region: '(유사 상품 기준 Huila)', unit: '엘 엔칸토(농장)', variety: '게이샤', process: '워시드, 효모발효', label: '', src: ['g76'] },
  { menu: '케냐 니에리 가톰보야 AA TOP [2026 뉴크롭]', country: '케냐', region: '니에리', unit: '가톰보야(수세장)', variety: '(SL28·SL34)', process: '(Fully Washed)', label: 'AA, TOP, 2026 뉴크롭', src: ['g145', 'ci-grades'] },
  { menu: '브라질 세하도 파젠다 부리티 파라이소 내추럴 에센시아 옥션랏', country: '브라질', region: '세하도', unit: '파젠다 (판타노) 부리티(농장)', variety: '파라이소', process: '내추럴', label: '에센시아 옥션랏', src: ['g140'] },
  { menu: '페루 게이샤', country: '페루', region: '', unit: '', variety: '게이샤', process: '', label: '', src: ['g134', 'g135', 'g150'] },
  { menu: '에티오피아 시다마 워시드', country: '에티오피아', region: '시다마', unit: '', variety: '', process: '워시드', label: '', src: ['g126'] },
  { menu: '에티오피아 게뎁', country: '에티오피아', region: '게뎁', unit: '', variety: '', process: '', label: '', src: ['g141'] },
];

// 이름 구조를 보여주는 예시
export const NAME_ANATOMY: { part: string; role: string }[][] = [
  [
    { part: '콜롬비아', role: '국가' },
    { part: '후안 마르틴', role: '농장' },
    { part: '아라라', role: '품종' },
    { part: '워시드', role: '가공' },
  ],
  [
    { part: '케냐', role: '국가' },
    { part: '니에리', role: '지역' },
    { part: '가톰보야', role: '수세장' },
    { part: 'AA TOP', role: '등급·라벨' },
    { part: '2026 뉴크롭', role: '수확' },
  ],
];

export const READING_STEPS = [
  '국가를 찾습니다.',
  '아는 품종과 가공 단어를 먼저 분리합니다.',
  '남은 단어가 지명인지 농장인지 로스터 표로 확인합니다.',
  '등급과 라벨을 맛 보증으로 설명하지 않습니다.',
];

// 이름에 자주 나오는 단어
export const NAME_TERMS: { term: string; meaning: string; src: string[] }[] = [
  { term: 'Finca, Fazenda, Hacienda, Estate', meaning: '농장을 부르는 호칭입니다. 이름에서 생략되기도 합니다.', src: ['g136', 'g140'] },
  { term: '케냐 Factory', meaning: '공장이 아니라 수세장입니다. 소농이 체리를 납품하고 협동조합이 소유합니다.', src: ['ci-kenya'] },
  { term: '에티오피아 수세장', meaning: '보통 수세장까지 추적됩니다. 여러 농가의 체리가 섞일 수 있습니다.', src: ['ci-ethiopia'] },
  { term: '케냐 AA·AB·PB', meaning: '생두 크기 등급입니다. 맛 등급이 아닙니다.', src: ['ci-grades'] },
  { term: '에티오피아 G1·G2', meaning: '결점과 예비 컵 점수에 따른 등급입니다. 현행 공식표는 확인하지 못했습니다.', src: ['tolessa', 'ci-ethiopia'] },
  { term: 'Supremo·Excelso', meaning: '콜롬비아의 생두 크기 표기입니다.', src: ['colombia-uk'] },
  { term: 'SHB·SHG', meaning: '중미의 재배 고도 표기입니다. 기준은 나라와 출처마다 다릅니다.', src: ['ci-grades', 'su-guatemala'] },
  { term: 'Geisha·Gesha', meaning: '품종 이름입니다. 지명과 농장 이름에도 쓰이고, 유전적으로 다른 커피에 붙기도 합니다.', src: ['wcr-geisha'] },
  { term: '옥션랏', meaning: '출품, 낙찰, 우승은 서로 다릅니다. 공개 대회와 농장 자체 경매도 구분합니다.', src: ['ace-peru', 'geshavillage'] },
  { term: 'TOP·뉴크롭', meaning: '공식 정의를 찾지 못한 판매 표기입니다. 수확 연도와 수확기를 함께 봅니다.', src: ['ci-kenya'] },
];
