// 테이스팅 노트 → 색 매핑 — 카운터컬처(Counter Culture) 플레이버 휠 색을 차용.
// 노트 문자열에서 카테고리 키워드를 찾아 등장 순서대로 색을 뽑고, 카드 헤더 그라데이션에 쓴다.

interface FlavorCategory {
  color: string; // 카테고리 대표색 (hex)
  keywords: string[];
}

const CATEGORIES: FlavorCategory[] = [
  // 플로럴 — 핑크
  { color: '#E17BA4', keywords: ['플로럴', '꽃', '자스민', '재스민', '장미', '라벤더', '엘더플라워', '히비스커스', 'floral', 'jasmine', 'rose'] },
  // 레드베리·체리 — 레드
  { color: '#C94057', keywords: ['딸기', '라즈베리', '크랜베리', '체리', '레드베리', '석류', 'berry', 'cherry'] },
  // 다크베리·포도·자두 — 퍼플
  { color: '#7C4D8F', keywords: ['자두', '플럼', '블루베리', '블랙베리', '카시스', '블랙커런트', '포도', '건포도', '무화과', 'plum', 'grape', 'fig'] },
  // 와인·발효 — 버건디
  { color: '#8E3B54', keywords: ['와인', '와이니', '럼', '위스키', '브랜디', '발효', 'winey', 'wine'] },
  // 시트러스 — 옐로 오렌지
  { color: '#F5A623', keywords: ['시트러스', '레몬', '라임', '오렌지', '자몽', '귤', '유자', '베르가못', 'citrus', 'lemon', 'orange'] },
  // 트로피컬 — 오렌지
  { color: '#F07C3C', keywords: ['트로피컬', '망고', '파인애플', '패션', '리치', '파파야', '구아바', '멜론', 'tropical', 'mango'] },
  // 사과·배·청포도 — 그린 옐로
  { color: '#A3C24B', keywords: ['사과', '청사과', '배', '청포도', '키위', 'apple', 'pear'] },
  // 복숭아·살구 (핵과) — 피치
  { color: '#F49E6D', keywords: ['복숭아', '살구', '천도', '넥타린', 'peach', 'apricot'] },
  // 티라이크·홍차 — 브루드 티 앰버
  { color: '#B4703A', keywords: ['홍차', '티라이크', '얼그레이', '우롱', '루이보스', 'tea'] },
  // 허브·그린 — 그린
  { color: '#6B9E5F', keywords: ['허브', '민트', '그린', '녹차', '세이지', '풀향', 'herb', 'mint'] },
  // 초콜릿·코코아 — 다크 브라운
  { color: '#6F4A2F', keywords: ['초콜릿', '초코', '코코아', '카카오', 'chocolate', 'cocoa'] },
  // 캐러멜·단맛 — 앰버
  { color: '#C98A3D', keywords: ['캐러멜', '카라멜', '흑설탕', '꿀', '메이플', '바닐라', '토피', '당밀', '시럽', '단맛', 'caramel', 'honey', 'vanilla'] },
  // 견과 — 탠
  { color: '#B29B6B', keywords: ['아몬드', '헤이즐넛', '땅콩', '피칸', '호두', '너트', '견과', 'nut'] },
  // 향신료 — 스파이스 브라운
  { color: '#A34A2A', keywords: ['시나몬', '계피', '정향', '넛맥', '생강', '스파이스', 'spice', 'cinnamon'] },
];

// 노트에서 매칭된 카테고리 색을 등장 순서대로 (중복 제거)
export function flavorColors(tasting: string): string[] {
  const t = tasting.normalize('NFC').toLowerCase();
  if (!t.trim()) return [];
  const hits: { color: string; at: number }[] = [];
  for (const cat of CATEGORIES) {
    let at = -1;
    for (const kw of cat.keywords) {
      const i = t.indexOf(kw.toLowerCase());
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at >= 0) hits.push({ color: cat.color, at });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.color);
}

// 헤더 밴드용 그라데이션 — 반투명(알파)로 깔아 muted 배경·텍스트 가독 유지.
// 색 1개면 좌→우로 옅어지는 워시, 여러 개면 노트 순서대로 이어지는 그라데이션.
export function flavorGradient(tasting: string): string | null {
  const cs = flavorColors(tasting);
  if (cs.length === 0) return null;
  const stops = cs.length === 1 ? [`${cs[0]}66`, `${cs[0]}14`] : cs.map((c) => `${c}59`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
