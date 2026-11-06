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
  { name: "Niguse Gemeda Mude", country: "에티오피아", place: "Sidama", altitude: "—", note: "생산자. 2020 Ethiopia Cup of Excellence 1위, 내추럴. 최고 입찰 USD 185.10/lb", src: ["ace-et-2020", "dcn-et-2020"] },
  { name: "Tamiru Tadesse Tesema", country: "에티오피아", place: "Bensa, Sidama", altitude: "—", note: "생산자. 2021 Ethiopia Cup of Excellence 1위 90.60점, 무산소 가공. 최고 입찰 USD 150/lb", src: ["ace-et-2021"] },
  { name: "La Bohemia", country: "콜롬비아", place: "Nariño", altitude: "—", note: "2022 Colombia Cup of Excellence 1위 90.65점, 워시드 Geisha. 최고 입찰 USD 92.30/lb", src: ["ace-co-2022"] },
  { name: "Montreal", country: "콜롬비아", place: "Tolima", altitude: "—", note: "2023 Colombia Cup of Excellence 1위 90.61점, 워시드 Geisha. 최고 입찰 USD 75.10/lb", src: ["ace-co-2023"] },
  { name: "La Gran Manzana", country: "과테말라", place: "Huehuetenango", altitude: "2,000", note: "2025 Guatemala Cup of Excellence 이그조틱 워시드 1위 91.15점. 최고 입찰 USD 143.10/lb", src: ["ace-gt-2025", "ace-gran-manzana"] },
  { name: "El Socorro", country: "과테말라", place: "Palencia", altitude: "—", note: "2025 Guatemala Cup of Excellence 이그조틱 워시드 3위 90.65점. 최고 입찰 USD 80.10/lb", src: ["ace-gt-2025"] },
  { name: "Fazenda Santuário Sul", country: "브라질", place: "Carmo de Minas", altitude: "1,100~1,300", note: "Geisha 내추럴 10kg이 2026 ACE 자선 경매에서 USD 200/lb. 브라질 커피의 ACE 경매 최고가로 보도됨", src: ["agrolink-2026", "forbes-br-2026"] },
  { name: "Fazenda Bom Jardim", country: "브라질", place: "—", altitude: "—", note: "2017 Brazil Cup of Excellence에서 793 lb를 약 USD 100,000에 판매(100,000÷793≈USD 126/lb)", src: ["ace-br-2017"] },
  { name: "Karimikui", country: "케냐", place: "Kirinyaga", altitude: "1,600~1,800", note: "Rung'eto 조합의 수세장 3곳 중 하나. 회원 약 1,400명", src: ["royal-karimikui"] },
  { name: "Kieni", country: "케냐", place: "Nyeri", altitude: "—", note: "Mugaga 조합 소속 수세장. 2014년 Coffee Collective가 50kg당 USD 529(FOB)에 직접 구매(구매자 서술)", src: ["cc-kieni"] },
  { name: "Las Lajas", country: "코스타리카", place: "Sabanilla de Alajuela", altitude: "—", note: "Chacón 부부의 마이크로밀. 2008년 내추럴을 시작해 Perla Negra로 알려짐. 고도 표기는 자료마다 다름", src: ["sprudge-lajas"] },
  { name: "La Cusuka", country: "코스타리카", place: "Pérez Zeledón", altitude: "—", note: "2025 Costa Rica Cup of Excellence 허니·내추럴 1위 91.22점, Geisha 내추럴. 최고 입찰 USD 91/lb", src: ["ace-cr-2025"] },
  { name: "La Salvaje", country: "온두라스", place: "Marcala, La Paz", altitude: "약 1,800", note: "2025 Honduras Cup of Excellence 이그조틱 1위 91.59점, 워시드 Geisha. 최고 입찰 USD 88.40/lb", src: ["ace-hn-2025", "twtc-salvaje"] },
  { name: "Los Pinos", country: "온두라스", place: "Intibucá", altitude: "1,770", note: "2024 Honduras Cup of Excellence 3위 90.71점, 워시드 Geisha. 생산자 Joaquina Montoya Alvarado", src: ["ace-los-pinos"] },
];

export const FARMS_SHOWN = 2;

const COUNTRY_ORDER = ['파나마', '에티오피아', '콜롬비아', '과테말라', '브라질', '케냐', '코스타리카', '온두라스'];

export const FARMS_BY_COUNTRY = COUNTRY_ORDER.map((country) => ({
  country,
  farms: FARMS.filter((f) => f.country === country),
}));
