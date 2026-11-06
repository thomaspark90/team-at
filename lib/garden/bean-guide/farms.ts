// 유명 농장. 메뉴와 이어지는 농장을 먼저 보여준다. 농장 자체 주장과 공개 대회 결과를 구분한다.
export type Farm = { name: string; place: string; altitude: string; note: string; src: string[]; onMenu?: boolean };

export const FARMS: Farm[] = [
  { name: 'Gesha Village', place: '에티오피아 West Omo', altitude: 'Oma 1,931~2,040', note: 'Gesha 1931 등 재배, 자체 경매 Pride of Gesha. 2022년 자체 경매 USD 254/lb', src: ['geshavillage', 'dcn-gesha'], onMenu: true },
  { name: 'El Puente', place: '온두라스 Chinacla, La Paz', altitude: '1,550~1,800', note: 'Marysabel Caballero와 Moisés Herrera의 농장. Stumptown이 2004년 Cup of Excellence로 처음 구매', src: ['stumptown', 'g162'], onMenu: true },
  { name: 'Corazón de Jesús', place: '코스타리카 Chirripó', altitude: '1,500 또는 1,700~1,800', note: 'Alvarado 가족. Cup of Excellence 2021년 5위, 2022년 3위(로스터 서술, 대회 원자료 미확인)', src: ['barn', 'g160'], onMenu: true },
  { name: 'Gatomboya', place: '케냐 Nyeri', altitude: '상세 표기 1,770', note: 'Barichu 조합 소속 수세장. 회원 약 600명', src: ['g145', 'sm-gatomboya'], onMenu: true },
  { name: 'Hacienda La Esmeralda', place: '파나마 Boquete', altitude: '1,650 이상', note: 'Geisha를 구획 분리해 2004 Best of Panama 우승. 2025년 최고가. 고도와 내력은 농장 서술', src: ['esmeralda', 'dcn-2018', 'cm-2025'] },
  { name: 'Elida Estate', place: '파나마 Boquete', altitude: '1,700~2,060', note: 'Lamastus 가족. 2024·2026 Best of Panama 최고가', src: ['dcn-2024', 'np-2026', 'qahwa'] },
  { name: 'Finca Sophia', place: '파나마 Nueva Suiza', altitude: '약 2,000 이상', note: '2020 Best of Panama 최고가', src: ['dcn-2020'] },
  { name: 'Finca Deborah', place: '파나마 Volcán', altitude: '1,700~1,950', note: '효모 접종 내추럴 Interstellar로 알려짐. Best of Panama 기록은 미확인', src: ['archers'] },
  { name: 'Ninety Plus', place: '파나마·에티오피아', altitude: '—', note: '자체 브랜드 라인과 자체 판매가로 유명. 공개 대회 결과는 아님', src: ['ninetyplus'] },
  { name: 'Finca El Injerto', place: '과테말라 Huehuetenango', altitude: '최대 1,920', note: '2026 Guatemala Cup of Excellence USD 449.10/lb(약 USD 990/kg), 과테말라 대회 2001년 이후 최고가', src: ['bloomberg-gt'] },
  { name: 'Daterra', place: '브라질 Cerrado', altitude: 'Laurina 랏 약 1,200', note: 'Classics·Collection·Masterpieces 3계층과 Laurina로 유명', src: ['daterra'] },
  { name: 'Granja La Esperanza', place: '콜롬비아 Trujillo', altitude: '1,752~1,941', note: 'Cerro Azul 농장. 파나마 임차 농장으로 Best of Panama 1위 후 Gesha를 콜롬비아에 도입(거래처 서술)', src: ['equator'] },
];

// Best of Panama 최고가. 파운드 표기는 USD/lb × 2.2046 으로 환산. 소량 랏의 경매 기록이라 떼루아 측정치가 아니다.
export const BOP_RECORDS: { year: number; farm: string; usdPerKg: number; original: string; src: string }[] = [
  { year: 2004, farm: 'Hacienda La Esmeralda', usdPerKg: 46, original: 'USD 21/lb', src: 'dcn-2018' },
  { year: 2017, farm: 'Hacienda La Esmeralda', usdPerKg: 1325, original: 'USD 601/lb', src: 'dcn-2018' },
  { year: 2018, farm: 'Lamastus(내추럴)', usdPerKg: 1770, original: 'USD 803/lb', src: 'dcn-2018' },
  { year: 2020, farm: 'Finca Sophia(워시드)', usdPerKg: 2867, original: 'USD 1,300.50/lb', src: 'dcn-2020' },
  { year: 2023, farm: 'Carmen Estates', usdPerKg: 10005, original: 'USD 10,005/kg', src: 'stir-2023' },
  { year: 2024, farm: 'Elida(내추럴)', usdPerKg: 10013, original: 'USD 4,542/lb', src: 'dcn-2024' },
  { year: 2025, farm: 'Hacienda La Esmeralda(워시드)', usdPerKg: 30204, original: 'USD 30,204/kg', src: 'cm-2025' },
  { year: 2026, farm: 'Elida Geisha Torre', usdPerKg: 18004, original: 'USD 18,004/kg', src: 'np-2026' },
];
