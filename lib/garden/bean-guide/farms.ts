// 유명 농장. 국가별로 묶어 FARMS_SHOWN 곳까지 먼저 보여준다. 농장 자체 주장과 공개 대회 결과를 구분한다.
export type Farm = { name: string; country: string; place: string; altitude: string; note: string; src: string[]; onMenu?: boolean };

export const FARMS: Farm[] = [
  { name: 'Gesha Village', country: '에티오피아', place: 'West Omo', altitude: 'Oma 1,931~2,040', note: 'Gesha 1931 등 재배, 자체 경매 Pride of Gesha. 2022년 자체 경매 USD 254/lb', src: ['geshavillage', 'dcn-gesha'], onMenu: true },
  { name: 'El Puente', country: '온두라스', place: 'Chinacla, La Paz', altitude: '1,550~1,800', note: 'Marysabel Caballero와 Moisés Herrera의 농장. Stumptown이 2004년 Cup of Excellence로 처음 구매', src: ['stumptown', 'g162'], onMenu: true },
  { name: 'Corazón de Jesús', country: '코스타리카', place: 'Chirripó', altitude: '1,500 또는 1,700~1,800', note: 'Alvarado 가족. Cup of Excellence 2021년 5위, 2022년 3위(로스터 서술, 대회 원자료 미확인)', src: ['barn', 'g160'], onMenu: true },
  { name: 'Gatomboya', country: '케냐', place: 'Nyeri', altitude: '상세 표기 1,770', note: 'Barichu 조합 소속 수세장. 회원 약 600명', src: ['g145', 'sm-gatomboya'], onMenu: true },
  { name: 'Hacienda La Esmeralda', country: '파나마', place: 'Boquete', altitude: '1,650 이상', note: 'Geisha를 구획 분리해 2004 Best of Panama 우승. 2025년 최고가. 고도와 내력은 농장 서술', src: ['esmeralda', 'dcn-2018', 'cm-2025'] },
  { name: 'Elida Estate', country: '파나마', place: 'Boquete', altitude: '1,700~2,060', note: 'Lamastus 가족. 2024·2026 Best of Panama 최고가', src: ['dcn-2024', 'np-2026', 'qahwa'] },
  { name: 'Finca Sophia', country: '파나마', place: 'Nueva Suiza', altitude: '약 2,000 이상', note: '2020 Best of Panama 최고가', src: ['dcn-2020'] },
  { name: 'Finca Deborah', country: '파나마', place: 'Volcán', altitude: '1,700~1,950', note: '효모 접종 내추럴 Interstellar로 알려짐. Best of Panama 기록은 미확인', src: ['archers'] },
  { name: 'Ninety Plus', country: '파나마', place: '파나마·에티오피아', altitude: '—', note: '자체 브랜드 라인과 자체 판매가로 유명. 공개 대회 결과는 아님', src: ['ninetyplus'] },
  { name: 'Finca El Injerto', country: '과테말라', place: 'Huehuetenango', altitude: '최대 1,920', note: '2026 Guatemala Cup of Excellence USD 449.10/lb(약 USD 990/kg), 과테말라 대회 2001년 이후 최고가', src: ['bloomberg-gt'] },
  { name: 'Daterra', country: '브라질', place: 'Cerrado', altitude: 'Laurina 랏 약 1,200', note: 'Classics·Collection·Masterpieces 3계층과 Laurina로 유명', src: ['daterra'] },
  { name: 'Granja La Esperanza', country: '콜롬비아', place: 'Trujillo', altitude: '1,752~1,941', note: 'Cerro Azul 농장. 파나마 임차 농장으로 Best of Panama 1위 후 Gesha를 콜롬비아에 도입(거래처 서술)', src: ['equator'] },
];

export const FARMS_SHOWN = 3;

const COUNTRY_ORDER = ['파나마', '에티오피아', '콜롬비아', '과테말라', '브라질', '케냐', '코스타리카', '온두라스'];

export const FARMS_BY_COUNTRY = COUNTRY_ORDER.map((country) => ({
  country,
  farms: FARMS.filter((f) => f.country === country),
}));
