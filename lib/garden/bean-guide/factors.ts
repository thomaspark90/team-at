// 고도와 기타 요소. 측정된 것과 통념을 구분한다.
export const ALTITUDE_CHAIN = ['높은 고도', '서늘한 기온', '더 오래 익음', '좋은 컵의 확률 상승'];

export const ALTITUDE_FINDINGS: { text: string; src: string[] }[] = [
  { text: '문헌고찰에서 고도와 관능을 측정한 13편 중 12편은 상승, 1편은 하락이었습니다.', src: ['ahmed'] },
  { text: 'Honduras 52개 구획, Costa Rica 두 지역에서도 고도와 좋은 평가가 함께 움직였습니다.', src: ['decazy', 'avelino'] },
  { text: 'Réunion 16개 구획에서는 종자가 자라는 시기의 평균 기온이 관능을 크게 좌우했습니다.', src: ['bertrand'] },
  { text: 'Burundi 155농가 연구에서는 고도가 생두 크기를 키웠지만 관능에 직접 효과는 없었습니다.', src: ['kagisye'] },
];

// 고도와 함께 측정된 항목. 지역 비교가 많아 품종·가공·관리 차이가 섞일 수 있다.
export const ALTITUDE_MEASURES: { item: string; result: string; caution: string; src: string[] }[] = [
  { item: '기온', result: '에티오피아 약 1,600 m대와 약 2,000 m대의 연평균 기온 차이는 3.2°C였습니다.', caution: '지점이 달라 일반적인 고도당 기온 공식으로 쓰면 안 됩니다.', src: ['tolessa'] },
  { item: '성숙 기간', result: 'Mozambique에서 650 m → 935 m로 오르면 성숙이 4주 늘고 크기, 균일도, 밀도도 커졌습니다.', caution: '컵 평가는 없었습니다.', src: ['gorongosa'] },
  { item: '생두 무게', result: '에티오피아 20개 표본(1,025~2,775 m)에서 고도가 높을수록 100립중이 무거웠습니다.', caution: '커핑 결과는 확인하지 못했습니다.', src: ['urugo'] },
  { item: '결점두', result: 'Gayo에서 저고도 14.30%, 중고도 10.19%, 고고도 8.50%였습니다.', caution: '중·고고도 차이는 유의하지 않았고, 양품 무게는 중고도가 가장 컸습니다. 컵 평가는 없었습니다.', src: ['iieta'] },
  { item: '산미', result: '남서부 에티오피아에서 그늘이 있을 때만 100 m당 0.22점 올랐습니다.', caution: '그늘이 없으면 유의하지 않았습니다.', src: ['worku'] },
  { item: '자당·트리고넬린', result: '에티오피아 20개 표본에서 고도와 함께 늘었습니다.', caution: '자당은 낮은 고도에서 더 높았다는 연구도 있습니다.', src: ['urugo'] },
  { item: '클로로겐산', result: '에티오피아 연구들에서는 고도가 높을수록 줄었습니다.', caution: 'Bertrand 2006의 전통 품종에서는 반대로 늘었습니다.', src: ['urugo', 'worku', 'bertrand-2006'] },
  { item: '카페인', result: '에티오피아 20개 표본에서는 고도와 유의한 관계가 없었습니다.', caution: '남서부 에티오피아 연구는 100 m당 0.12 g/kg 감소를 보고했습니다.', src: ['urugo', 'worku'] },
  { item: '관능 항목', result: "Pu'er 930~1,520 m 비교에서 향과 풍미 외 항목은 차이가 작았습니다.", caution: '고도별 5개 표본이고 고도가 오를수록 계속 오르는 형태는 아니었습니다.', src: ['hu-2024'] },
];

// Ahmed 2021 문헌고찰. 관능을 잰 연구의 방향만 센 것이며 효과 크기가 아니다.
export const REVIEW_COUNTS = [
  { factor: '고도가 높을수록', papers: 18, up: '12편', down: '1편' },
  { factor: '빛이 많을수록', papers: 19, up: '4편', down: '8편' },
  { factor: '기온 변화', papers: 9, up: '4편', down: '3편' },
  { factor: '물 스트레스', papers: 9, up: '2편', down: '0편' },
];

// World Coffee Research 카탈로그의 재배 적합 고도(m). 기온이 같다는 측정값은 아니다.
export const LATITUDE_BANDS = [
  { latitude: '5°N~5°S', low: '1,000~1,200', medium: '1,200~1,600', high: '1,600 초과' },
  { latitude: '5~15°N 또는 S', low: '700~900', medium: '900~1,300', high: '1,300 초과' },
  { latitude: '15°N 또는 S 초과', low: '400~700', medium: '700~1,000', high: '1,000 초과' },
];

export const QUALITY_FACTORS: { name: string; finding: string; say: string; src: string[] }[] = [
  { name: '품종', finding: '점수에 영향을 주지만 크기는 집단과 환경에 따라 다릅니다. 판매된 Sidra가 Batian과 일치한 사례처럼 이름표가 틀리기도 합니다.', say: '맛의 잠재력입니다.', src: ['wcr-core', 'moreira', 'frontiers-sidra'] },
  { name: '그늘', finding: 'Costa Rica에서 45% 그늘이 성숙을 늦추고 품질을 높였지만 생산성은 18% 줄었습니다. Colombia의 높은 지역에서는 점수를 낮췄습니다.', say: '조건에 따라 다릅니다.', src: ['vaast', 'bosselmann', 'ahmed'] },
  { name: '토양·양분', finding: '측정된 것은 향미가 아니라 영양 조건입니다. 화산토가 특정 향미를 만든다는 직접 증거는 찾지 못했습니다.', say: '나무의 건강과 수확에 영향을 줍니다.', src: ['bote', 'kagisye', 'fibl', 'tolessa'] },
  { name: '강수', finding: 'Honduras는 연 1,500 mm 미만이 유리했고, Ethiopia에서는 유의한 관계가 거의 없었습니다.', say: '지역마다 결과가 다릅니다.', src: ['decazy', 'urugo'] },
  { name: '수확 숙도', finding: 'Jimma에서 조기 수확이 후기 수확보다 Q1 비율이 높았습니다(73%, 27%). 덜 익은 체리를 섞을 때의 점수 임계값은 찾지 못했습니다.', say: '잘 익은 체리를 고르는 일이 중요합니다.', src: ['tolessa'] },
  { name: '가공', finding: '건식이 과당·포도당은 높았지만 자당은 차이가 없었습니다. 점수는 연구마다 방향이 다릅니다.', say: '맛을 바꿉니다. 어느 가공이 항상 더 좋지는 않습니다.', src: ['knopp', 'cs2023', 'hailemichael'] },
  { name: '저장', finding: '탈각 생두는 1년 뒤 flat한 향으로 묘사된 사례가 있습니다. 개월별 점수 곡선은 찾지 못했습니다.', say: '시간이 지나면 향이 무뎌질 수 있습니다.', src: ['selmar'] },
  { name: '기후변화', finding: '2050년 Arabica 최고 적합지가 50% 이상 줄어든다는 모델이 있습니다. 컵 점수 예측은 아닙니다.', say: '재배지가 바뀔 수 있습니다.', src: ['gruter'] },
];

// 통념 점검. 판정은 조사 근거를 종합한 판단이다.
export const MYTH_CHECKS: { claim: string; verdict: string; src: string[] }[] = [
  { claim: '높을수록 항상 좋다', verdict: '근거 없음. 상한이 측정되지 않았습니다.', src: ['ahmed', 'worku'] },
  { claim: '1,500 m 이상이면 스페셜티다', verdict: '뒷받침하는 통제 연구를 찾지 못했습니다. 위도에 따라 같은 고도의 의미도 달라집니다.', src: ['wcr-bourbon'] },
  { claim: '화산토가 밝은 산미를 만든다', verdict: '직접 증거를 찾지 못했습니다.', src: ['fibl', 'tolessa'] },
  { claim: '함께 심은 과일 향이 커피로 옮겨간다', verdict: 'Bali 자료는 감귤 혼작의 직접 전이를 부정합니다.', src: ['isc-bali'] },
  { claim: 'Udaini는 예멘의 품종이다', verdict: '현지 이름입니다. 유전 계통과 유의한 연관이 없었습니다.', src: ['montagnon'] },
  { claim: 'SL28이 케냐 커피 산미의 원인이다', verdict: '품종 자료는 케냐 커피의 맛을 측정한 값이 아닙니다.', src: ['wcr-sl28'] },
  { claim: '무산소·효모 발효는 품질을 올린다', verdict: '맛을 바꿉니다. 일부 시험에서만 점수가 올랐습니다.', src: ['cs2023'] },
  { claim: '이 산지의 맛은 이렇다', verdict: '일반화입니다. 품종, 가공, 로스팅, 연도가 함께 작용합니다.', src: ['williams', 'kim2025'] },
];
