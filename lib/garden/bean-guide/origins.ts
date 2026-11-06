// 원산지별 떼루아. 값은 조사 보고서의 범위를 옮긴 것이고, '—'는 신뢰할 값을 찾지 못했다는 뜻이다.
// flavor 는 측정값이 아니라 자주 쓰이는 묘사다.
export type OriginRow = {
  name: string;
  altitude: string; // m
  climate: string;
  harvest: string;
  variety: string;
  process: string;
  flavor: string;
  grade: string; // 사용한 출처의 등급
  src: string[];
};
export type OriginGroup = { key: string; label: string; rows: OriginRow[] };

export const ORIGIN_GROUPS: OriginGroup[] = [
  {
    key: 'africa',
    label: '아프리카',
    rows: [
      { name: '에티오피아 Yirgacheffe', altitude: '1,700~2,200', climate: '점토질 화산토·흑색토로 서술', harvest: '10~1월 또는 11~2월, 수세장 10~12월', variety: 'Heirloom(Kudhome, Gesha 등)', process: 'Washed, Natural', flavor: '자스민, 베르가못, 레몬', grade: 'B·C', src: ['beanshub', 'ci-ethiopia'] },
      { name: '에티오피아 Sidama', altitude: '1,500~2,200', climate: '질소가 풍부한 양토로 서술', harvest: '10~1월 또는 11~2월', variety: 'Heirloom', process: 'Washed, Natural', flavor: '오렌지, 베리, 꿀', grade: 'C', src: ['beanshub'] },
      { name: '에티오피아 Guji', altitude: '1,400~2,100 또는 2,000 이상', climate: '광물이 풍부한 화산토로 서술', harvest: '10~1월 또는 11~2월', variety: 'Heirloom', process: 'Natural, Washed, 최근 Anaerobic', flavor: '복숭아, 살구, 망고', grade: 'B·C', src: ['beanshub', 'ci-ethiopia', 'royal-ethiopia'] },
      { name: '에티오피아 Harrar', altitude: '1,510~2,120', climate: '건조, 사질토로 서술', harvest: '10월에 먼저 끝남', variety: 'Longberry로 서술', process: '거의 Natural', flavor: '블루베리, 다크초콜릿, 향신료', grade: 'B·C', src: ['beanshub', 'royal-ethiopia'] },
      { name: '에티오피아 Bench Maji', altitude: '랏 약 1,900~2,060', climate: '—', harvest: '—', variety: 'Gesha 1931 등', process: 'Natural 다수', flavor: '—', grade: 'B', src: ['geshavillage', 'g69'] },
      { name: '에티오피아 Jimma(Mana 실측)', altitude: 'Mana 1,470~2,610', climate: '연평균 20.5°C, 연 1,523 mm, Nitosol, pH 4.5~5.5', harvest: '—', variety: 'Heirloom, 74110·74112', process: 'Washed, Natural', flavor: '—', grade: 'A', src: ['tolessa'] },
      { name: '케냐 공통', altitude: '1,400~2,000', climate: '우기 2회. Chuka(1,450 m) 연 1,500~2,400 mm, 화산 기원 Nitisol', harvest: 'Main 8~1월, Fly 4~7월', variety: 'SL28, SL34, Ruiru 11, Batian', process: '24~48시간 발효, 세척, 일부 추가 침지, 건조대 7~10일', flavor: '블랙커런트, 자몽, 토마토, 타마린드', grade: 'A·B', src: ['ci-kenya', 'fibl', 'wcr-sl28'] },
      { name: '케냐 Nyeri', altitude: '1,600~2,000', climate: '연 900~1,200 mm', harvest: '10~12월', variety: 'SL28, SL34 등', process: 'Fully Washed', flavor: '쥬시, 산뜻함', grade: 'B·C', src: ['1z-kenya', 'ci-kenya'] },
      { name: '케냐 Kirinyaga', altitude: '1,300~1,900', climate: '연 1,100~1,500 mm', harvest: '10~1월', variety: 'SL28, SL34 등', process: 'Fully Washed', flavor: '꽃향', grade: 'B·C', src: ['1z-kenya', 'ci-kenya'] },
      { name: '르완다', altitude: '1,900 미만', climate: '6~8월 건기, 9월 첫 비 후 개화', harvest: '2월 말~3월, 북부 일부 8월까지', variety: 'Bourbon 계통', process: 'Washed, Natural, Honey, Anaerobic', flavor: '꽃향, 쥬시, 시트러스', grade: 'A·B', src: ['naeb', 'ci-rwanda'] },
      { name: '부룬디', altitude: 'Kayanza 1,700~2,000, Kirundo 1,400~1,700', climate: '전국 약 1,200 mm', harvest: '3~7월', variety: 'Bourbon, Jackson, Mibirizi', process: 'Washed, 2회 침지', flavor: '설탕에 조린 과일, 무화과잼, 꽃향', grade: 'B', src: ['pdg-burundi', 'ci-burundi'] },
      { name: '탄자니아', altitude: '1,000~2,500', climate: 'Kilimanjaro 화산토', harvest: '남북 수확기 출처 상충', variety: 'Arusha, Bourbon, Blue Mountain, Kent', process: 'Washed', flavor: '—', grade: 'B', src: ['ci-tanzania'] },
      { name: '우간다 Arabica', altitude: '1,300~2,200, Mt. Elgon 1,500~2,300', climate: '—', harvest: '10~2월 또는 9~2월', variety: 'Typica, SL14, SL28, Kent', process: 'Natural, Fully Washed', flavor: '—', grade: 'B', src: ['ecg-uganda'] },
    ],
  },
  {
    key: 'latam',
    label: '중남미',
    rows: [
      { name: '콜롬비아 Huila', altitude: '1,200~2,000 또는 1,200~2,200', climate: '화산재, 연 1,300~1,650 mm', harvest: '11~1월, 또는 북부 9~12월·남부 4~6월', variety: 'Caturra, Típica, Bourbon, Castillo', process: 'Washed, 발효·효모 실험 증가', flavor: '부드러움, 단맛, 시트러스', grade: 'B·C', src: ['ci-colombia', 'su-colombia', 'wtc-colombia'] },
      { name: '콜롬비아 Nariño', altitude: '1,600~2,300', climate: '연 1,500~2,000 mm, 적도 인접', harvest: 'Main 5~7월, Mitaca 11~1월', variety: 'Caturra, Típica, Castillo', process: 'Washed', flavor: '높은 산미, 시트러스, 꿀', grade: 'B·C', src: ['ci-colombia', 'wtc-colombia'] },
      { name: '콜롬비아 Cauca', altitude: '지역값 없음(Juan Martin 2,050)', climate: '—', harvest: 'Main 5~7월, Mitaca 11~1월', variety: 'Caturra, Típica, Castillo', process: 'Washed', flavor: '—', grade: 'B', src: ['ci-colombia', 'g136'] },
      { name: '콜롬비아 Tolima', altitude: '1,000~2,000(법적 범위)', climate: '화산재 비중 큼, 20~21°C', harvest: '약 75% 지역 3~6월, 약 25% 지역 9~12월', variety: 'Caturra, Típica, Tabi, Castillo', process: 'Washed', flavor: '산미, 시트러스·과일', grade: 'A', src: ['tolima', 'colombia-uk'] },
      { name: '브라질 Cerrado Mineiro', altitude: '800~1,300', climate: '덥고 습한 여름, 건조한 겨울', harvest: '5~9월', variety: 'Catuaí, Mundo Novo, Topázio, Bourbon', process: 'Natural 주류, Honey·Pulped Natural, 기계 수확 위주', flavor: '낮은 산미, 캐러멜, 초콜릿, 아몬드', grade: 'B', src: ['cerrado-dc', 'su-brazil'] },
      { name: '브라질 Sul de Minas', altitude: '800~1,400, Mantiqueira 1,000~1,400', climate: '온화', harvest: '4~9월', variety: 'Catuaí, Mundo Novo 등', process: 'Natural, Pulped Natural', flavor: '—', grade: 'B', src: ['stonex-br', 'su-brazil'] },
      { name: '브라질 Chapada Diamantina', altitude: 'Piatã 평균 1,280', climate: '겨울 22°C 미만(Köppen Cwb)', harvest: '—', variety: '—', process: 'Natural, Pulped Natural', flavor: '—', grade: 'A', src: ['uesb'] },
      { name: '코스타리카 Tarrazú', altitude: '1,200 초과(DO 조건), 분포 1,200~1,900', climate: '연 3,400 mm, 18°C, 약산성 퇴적토', harvest: '11~3월', variety: 'Typica, Caturra, Catuai, Villa Sarchi', process: '마이크로밀, Honey·Natural 흔함', flavor: '밝고 쥬시한 산미', grade: 'B·C', src: ['tarrazu-ln', 'su-costarica', 'pdg-cr', '1z-cr'] },
      { name: '코스타리카 West Valley', altitude: '700~1,600', climate: '연 2,500 mm, 21.5°C, 화산토', harvest: '10~2월', variety: 'Caturra, Catuai, Villa Sarchi', process: '마이크로밀, Honey·Natural', flavor: '오렌지, 만다린(생산자 발언)', grade: 'B·C', src: ['1z-cr', 'pdg-cr'] },
      { name: '파나마 Boquete', altitude: '계곡 약 1,000~1,600', climate: '화산토, 안개비 Bajareque', harvest: '12~3월 또는 11~4월', variety: 'Typica, Caturra, Catuai, Geisha', process: 'Washed 주류, Natural·Honey·Anaerobic', flavor: 'Geisha의 꽃·과일(산지보다 품종 설명)', grade: 'B·C', src: ['su-panama', 'wtc-boquete'] },
      { name: '과테말라 Antigua', altitude: '1,524~1,707', climate: '화산재·부석, 연 813~1,219 mm, 서늘한 밤', harvest: '1~3월 중순', variety: 'Bourbon, Caturra, Catuai, Typica', process: '거의 Washed, 대부분 차광', flavor: '—', grade: 'B·C', src: ['mercanta-gt', 'su-guatemala', '1z-gt'] },
      { name: '과테말라 Huehuetenango', altitude: '1,524~2,000', climate: '연 1,219~1,422 mm', harvest: '1~4월', variety: 'Bourbon, Caturra, Catuai', process: 'Washed', flavor: '—', grade: 'B·C', src: ['mercanta-gt', '1z-gt'] },
      { name: '온두라스 Marcala·Montecillos', altitude: '1,200~1,600', climate: '습해 건조가 어려움', harvest: '12~4월', variety: 'Bourbon, Catuai, Caturra, Pacas', process: 'Washed 중심', flavor: '오렌지, 복숭아, 강한 산미', grade: 'A·B', src: ['honduras-pr', 'mercanta-hn'] },
      { name: '온두라스 Copán·Opalaca', altitude: 'Copán 1,000~1,500, Opalaca 1,100~1,600', climate: '—', harvest: '11~4월', variety: 'Bourbon, Caturra, Catuai, Typica', process: 'Washed 중심', flavor: 'Copán 초콜릿, Opalaca 열대과일·베리', grade: 'A·B', src: ['honduras-pr', 'su-honduras'] },
      { name: '엘살바도르', altitude: 'Apaneca-Ilamatepec 500~2,365', climate: '전량 차광', harvest: '10~3월', variety: 'Bourbon 62%, Pacas 31%, Pacamara 2%(2015/16)', process: 'Washed, Natural, Honey', flavor: '—', grade: 'A·B', src: ['ico-sv', 'su-sv'] },
      { name: '니카라과', altitude: '1,100~1,600', climate: '화산토, 대부분 차광', harvest: '12~3월', variety: 'Caturra, Bourbon, Maracaturra, Pacamara', process: '농장 내 가공, 파티오 건조', flavor: 'Nueva Segovia 단맛·꽃향', grade: 'B', src: ['su-nicaragua'] },
      { name: '페루', altitude: 'Villa Rica 1,000~2,000, Cajamarca 랏 약 1,550~2,000', climate: '—', harvest: '3~9월', variety: 'Typica, Bourbon, Caturra, Catimor, Geisha', process: 'Fully Washed 중심, 협동조합', flavor: 'Villa Rica 균형, 단맛', grade: 'A·B', src: ['su-peru', 'villarica', 'g134'] },
      { name: '멕시코', altitude: 'Veracruz 330~1,600', climate: '—', harvest: '11~3월', variety: 'Bourbon, Typica, Marsellesa, Catimor', process: 'Washed', flavor: '—', grade: 'B', src: ['su-mexico'] },
      { name: '볼리비아', altitude: '1,200~2,000, Caranavi 1,400~1,600', climate: '—', harvest: '4~8월', variety: 'Catuaí, Caturra, Typica', process: 'Fully Washed, 온실 건조', flavor: '—', grade: 'B', src: ['mercanta-bo'] },
    ],
  },
  {
    key: 'asia',
    label: '아시아·태평양·아라비아',
    rows: [
      { name: '수마트라 Gayo', altitude: '조사구 1,022~1,600', climate: '연 2,617~2,633 mm(실측), Andisol 조사구', harvest: '출처별 불일치', variety: 'Ateng 계통, P 88, Timtim', process: 'Giling Basah', flavor: '낮은 산미, 강한 바디, 허브, 흙내음', grade: 'A', src: ['iieta'] },
      { name: '자바 Ijen·Preanger', altitude: 'Ijen 1,100~1,600, Preanger 1,200~1,600', climate: '화산성으로 서술', harvest: '4~8월', variety: 'Typica, USDA, Kartika', process: '주로 Full Washed', flavor: '—', grade: 'B', src: ['isc-java'] },
      { name: '술라웨시 Toraja', altitude: 'Sapan 약 1,400~2,100', climate: '화산성으로 서술', harvest: '약 5~9월', variety: 'Typica, S795', process: 'Giling Basah 일반적, Full Washed', flavor: '—', grade: 'B', src: ['isc-toraja'] },
      { name: '발리 Kintamani', altitude: 'GI 900 이상, 대부분 약 1,100~1,400', climate: 'Entisol·Inceptisol, 뚜렷한 건기', harvest: '—', variety: '—', process: 'GI 사양 Full Washed', flavor: '시트러스(감귤 혼작이 옮겨온다는 설명은 출처가 부정)', grade: 'B', src: ['isc-bali'] },
      { name: '플로레스 Bajawa', altitude: '1,200~1,800', climate: '화산토, 건조 기후', harvest: '5~9월', variety: 'S 795 43%, HdT 34%, Juria 13%(2009)', process: 'Full Washed, Wet Hulled, Pulped Natural', flavor: '—', grade: 'A·B', src: ['mawardi', 'isc-flores'] },
      { name: '예멘', altitude: '판매자 값 약 1,800~2,400 이상', climate: '연 400 mm 미만', harvest: '판매자 값 불일치', variety: 'New-Yemen 67%, Typica/Bourbon 19%, SL34 14%(88그루)', process: '건조 Natural 중심', flavor: '꽃, 검은 베리, 초콜릿, 삼나무', grade: 'A·B', src: ['montagnon', 'cr-yemen'] },
      { name: '인도 Chikmagalur', altitude: '700~1,200', climate: '연 1,000~4,500 mm', harvest: '—', variety: 'S.795, Sln.9, Cauvery', process: 'Washed, Natural, Monsooned Malabar', flavor: 'Monsooned는 묵직하고 밋밋함', grade: 'A', src: ['coffeeboard'] },
      { name: '인도 Coorg', altitude: '750~1,100', climate: '연 1,000~2,500 mm', harvest: '—', variety: 'S.795, Sln.9, Cauvery', process: 'Washed, Natural', flavor: '—', grade: 'A', src: ['coffeeboard'] },
      { name: '인도 Bababudangiris', altitude: '1,000~1,500', climate: '연 1,750~2,200 mm', harvest: '—', variety: 'S.795, Sln.9, Cauvery', process: 'Washed, Natural', flavor: '—', grade: 'A', src: ['coffeeboard'] },
      { name: '파푸아뉴기니', altitude: '랏 1,700~1,850', climate: '낮 따뜻, 밤 서늘', harvest: '5~9월, Fly 1~2월', variety: 'Blue Mountain, Arusha, Catimor', process: 'Washed', flavor: '낮은 산미, 파인애플, 꽃(2009 샘플)', grade: 'B', src: ['su-png', 'cr-png'] },
      { name: '동티모르', altitude: '약 1,000~1,900', climate: '불규칙한 강수', harvest: '5~9월', variety: 'Híbrido de Timor', process: '공정 편차 큼', flavor: '—', grade: 'B', src: ['boell'] },
      { name: '베트남 Da Lat', altitude: 'Cau Dat 약 1,500', climate: '현무암토로 서술', harvest: '출처 충돌', variety: 'Catimor, 전국은 로부스타 97%', process: '—', flavor: '—', grade: 'A·B', src: ['cand', 'treasury-fr'] },
      { name: '중국 Yunnan', altitude: '800~1,800, 대부분 1,000~1,500', climate: "Pu'er 우기 고습", harvest: '10~3월 또는 12~3월', variety: 'Catimor 95% 이상', process: '90% 이상 Full Washed', flavor: '—', grade: 'B', src: ['su-china', 'chinadaily'] },
      { name: '태국 Doi Chaang', altitude: '1,000~1,700', climate: '배수 양호', harvest: '—', variety: 'Arabica', process: '—', flavor: '—', grade: 'A', src: ['th-gi'] },
      { name: '미얀마 Ywangan', altitude: '1,098~1,534(판매 표기)', climate: '—', harvest: '11~3월', variety: 'Catuai, Caturra, Catimor, SL34', process: 'Washed', flavor: '—', grade: 'C', src: ['wtc-myanmar'] },
      { name: '하와이 Kona', altitude: '약 152~975', climate: '연 약 1,524 mm 이상, 약산성 화산토', harvest: '8~1월', variety: 'Guatemala 품종 접목', process: 'Washed', flavor: '—', grade: 'A·C', src: ['wiki-kona', 'hawaii'] },
    ],
  },
];
