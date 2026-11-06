// 페이지에 나오는 용어 풀이. 일반적인 뜻만 적고 수치 근거는 각 표의 출처를 따른다.
export const GLOSSARY: { group: string; terms: { term: string; meaning: string }[] }[] = [
  {
    group: '대회·거래',
    terms: [
      { term: 'Cup of Excellence', meaning: '나라별로 열리는 커피 대회입니다. 심사를 통과한 랏을 온라인 경매로 판매합니다.' },
      { term: 'ACE', meaning: 'Alliance for Coffee Excellence. Cup of Excellence를 운영하는 단체입니다.' },
      { term: 'Best of Panama', meaning: '파나마 스페셜티 커피 협회가 여는 대회이자 경매입니다.' },
      { term: '랏(Lot)', meaning: '따로 구분해 판매하는 커피 한 묶음입니다.' },
      { term: '최고 입찰', meaning: '경매에서 그 랏에 제시된 가장 높은 가격입니다.' },
      { term: '이그조틱', meaning: '대회 부문 이름입니다. Geisha 같은 희소 품종이 주로 들어갑니다.' },
      { term: 'lb', meaning: '파운드입니다. 1 lb는 약 0.4536 kg입니다.' },
      { term: 'FOB', meaning: '수출항에서 배에 싣는 데까지의 비용을 포함한 가격 조건입니다.' },
    ],
  },
  {
    group: '생산',
    terms: [
      { term: '떼루아', meaning: '재배지의 기후, 토양, 지형을 함께 이르는 말입니다.' },
      { term: '수세장', meaning: '주변 농가의 체리를 모아 가공하는 시설입니다. 케냐에서는 factory라고 부릅니다.' },
      { term: '마이크로밀', meaning: '농가나 가족이 소규모로 직접 운영하는 가공 시설입니다.' },
      { term: '결점두', meaning: '깨지거나 벌레 먹은 생두처럼 결함이 있는 콩입니다.' },
      { term: 'Q1', meaning: '에티오피아 생두 품질 등급의 상위 구간입니다.' },
    ],
  },
  {
    group: '측정',
    terms: [
      { term: '관능', meaning: '사람이 향과 맛을 직접 평가한 결과입니다.' },
      { term: '100립중', meaning: '생두 100알의 무게입니다.' },
      { term: '자당', meaning: '생두의 주요 당입니다. 로스팅 중 대부분 분해되며 향미 형성에 관여합니다.' },
      { term: '트리고넬린', meaning: '생두에 있는 쓴맛 성분입니다. 로스팅 중 분해됩니다.' },
      { term: '클로로겐산', meaning: '생두에 많은 폴리페놀입니다. 로스팅 중 줄어들며 쓴맛, 떫은맛과 관련됩니다.' },
    ],
  },
];
