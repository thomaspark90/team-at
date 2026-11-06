// 국가별 요약. origins.ts 의 지역 값을 묶은 것이며 새로운 수치를 넣지 않는다.
import { ORIGIN_GROUPS, type OriginRow } from './origins';

export type CountrySummary = {
  country: string;
  prefixes: string[]; // origins.ts 의 산지 이름 앞부분
  altitude: string; // m, 대략적 범위
  process: string;
  flavor: string;
};

export const COUNTRY_SUMMARIES: Record<string, CountrySummary[]> = {
  africa: [
    { country: '에티오피아', prefixes: ['에티오피아'], altitude: '약 1,400~2,200', process: 'Washed, Natural', flavor: '꽃, 시트러스, 베리, 열대과일' },
    { country: '케냐', prefixes: ['케냐'], altitude: '약 1,300~2,000', process: 'Fully Washed', flavor: '블랙커런트, 자몽, 쥬시한 산미' },
    { country: '르완다', prefixes: ['르완다'], altitude: '1,900 미만', process: 'Washed, Natural, Honey', flavor: '꽃향, 쥬시, 시트러스' },
    { country: '부룬디', prefixes: ['부룬디'], altitude: '약 1,400~2,000', process: 'Washed', flavor: '조린 과일, 무화과잼, 꽃향' },
    { country: '탄자니아', prefixes: ['탄자니아'], altitude: '1,000~2,500', process: 'Washed', flavor: '—' },
    { country: '우간다', prefixes: ['우간다'], altitude: '약 1,300~2,300', process: 'Natural, Fully Washed', flavor: '—' },
  ],
  latam: [
    { country: '콜롬비아', prefixes: ['콜롬비아'], altitude: '약 1,000~2,300', process: 'Washed', flavor: '단맛, 시트러스, 산미' },
    { country: '브라질', prefixes: ['브라질'], altitude: '약 800~1,400', process: 'Natural, Pulped Natural', flavor: '낮은 산미, 캐러멜, 초콜릿, 아몬드' },
    { country: '코스타리카', prefixes: ['코스타리카'], altitude: '약 700~1,900', process: '마이크로밀, Honey, Natural', flavor: '쥬시한 산미, 오렌지' },
    { country: '파나마', prefixes: ['파나마'], altitude: '약 1,000~1,600', process: 'Washed, Natural, Honey', flavor: 'Geisha의 꽃·과일' },
    { country: '과테말라', prefixes: ['과테말라'], altitude: '약 1,500~2,000', process: 'Washed', flavor: '—' },
    { country: '온두라스', prefixes: ['온두라스'], altitude: '약 1,000~1,600', process: 'Washed', flavor: '오렌지, 복숭아, 초콜릿, 열대과일' },
    { country: '엘살바도르', prefixes: ['엘살바도르'], altitude: '500~2,365', process: 'Washed, Natural, Honey', flavor: '—' },
    { country: '니카라과', prefixes: ['니카라과'], altitude: '1,100~1,600', process: '농장 내 가공, 파티오 건조', flavor: '단맛, 꽃향' },
    { country: '페루', prefixes: ['페루'], altitude: '약 1,000~2,000', process: 'Fully Washed', flavor: '균형, 단맛' },
    { country: '멕시코', prefixes: ['멕시코'], altitude: '330~1,600', process: 'Washed', flavor: '—' },
    { country: '볼리비아', prefixes: ['볼리비아'], altitude: '1,200~2,000', process: 'Fully Washed', flavor: '—' },
  ],
  asia: [
    { country: '인도네시아', prefixes: ['수마트라', '자바', '술라웨시', '발리', '플로레스'], altitude: '약 1,000~2,100', process: 'Giling Basah, Full Washed', flavor: '수마트라는 낮은 산미, 강한 바디, 허브' },
    { country: '예멘', prefixes: ['예멘'], altitude: '약 1,800~2,400 이상', process: 'Natural', flavor: '꽃, 검은 베리, 초콜릿, 삼나무' },
    { country: '인도', prefixes: ['인도 '], altitude: '약 700~1,500', process: 'Washed, Natural, Monsooned', flavor: 'Monsooned는 묵직하고 밋밋함' },
    { country: '파푸아뉴기니', prefixes: ['파푸아뉴기니'], altitude: '랏 1,700~1,850', process: 'Washed', flavor: '낮은 산미, 파인애플, 꽃' },
    { country: '동티모르', prefixes: ['동티모르'], altitude: '약 1,000~1,900', process: '공정 편차 큼', flavor: '—' },
    { country: '베트남', prefixes: ['베트남'], altitude: 'Da Lat 약 1,500', process: '—', flavor: '—' },
    { country: '중국', prefixes: ['중국'], altitude: '800~1,800', process: 'Full Washed', flavor: '—' },
    { country: '태국', prefixes: ['태국'], altitude: '1,000~1,700', process: '—', flavor: '—' },
    { country: '미얀마', prefixes: ['미얀마'], altitude: '약 1,100~1,530', process: 'Washed', flavor: '—' },
    { country: '미국 하와이', prefixes: ['하와이'], altitude: '약 152~975', process: 'Washed', flavor: '—' },
  ],
};

export const rowsForCountry = (groupKey: string, c: CountrySummary): OriginRow[] => {
  const rows = ORIGIN_GROUPS.find((g) => g.key === groupKey)?.rows ?? [];
  return rows.filter((r) => c.prefixes.some((p) => r.name.startsWith(p)));
};

// 국가 이름이 산지 이름 앞에 그대로 붙어 있으면 지역명만 남긴다. 나라 전체 값이면 빈 문자열.
export const regionLabel = (c: CountrySummary, row: OriginRow) =>
  row.name.startsWith(c.country) ? row.name.slice(c.country.length).trim() : row.name;
