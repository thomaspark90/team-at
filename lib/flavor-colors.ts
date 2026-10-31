// 테이스팅 노트 → 색 매핑 — 카운터컬처(Counter Culture) 플레이버 휠 색을 차용.
// 노트 문자열에서 카테고리 키워드를 찾아 등장 순서대로 색을 뽑고, 카드 헤더 그라데이션에 쓴다.

interface FlavorCategory {
  color: string; // 카테고리 대표색 (hex)
  keywords: string[];
}

const CATEGORIES: FlavorCategory[] = [
  // 플로럴 — 핑크
  { color: '#E17BA4', keywords: ['플로럴', '꽃', '블라썸', '블로썸', '백합', '릴리', '자스민', '재스민', '장미', '라벤더', '엘더플라워', '히비스커스', 'floral', 'jasmine', 'rose'] },
  // 레드베리·체리 — 레드
  { color: '#C94057', keywords: ['딸기', '라즈베리', '크랜베리', '크렌베리', '체리', '레드베리', '석류', 'berry', 'cherry'] },
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
  { color: '#F49E6D', keywords: ['복숭아', '백도', '황도', '살구', '천도', '넥타린', 'peach', 'apricot'] },
  // 티라이크·홍차 — 브루드 티 앰버
  { color: '#B4703A', keywords: ['홍차', '티라이크', '얼그레이', '우롱', '루이보스', 'tea'] },
  // 허브·그린 — 그린
  { color: '#6B9E5F', keywords: ['허브', '민트', '그린', '녹차', '세이지', '풀향', '레몬그라스', '타임', '로즈마리', '바질', 'herb', 'mint', 'thyme'] },
  // 초콜릿·코코아 — 다크 브라운
  { color: '#6F4A2F', keywords: ['초콜릿', '초코', '코코아', '카카오', 'chocolate', 'cocoa'] },
  // 캐러멜·단맛 — 앰버
  { color: '#C98A3D', keywords: ['캐러멜', '카라멜', '흑설탕', '꿀', '메이플', '바닐라', '토피', '당밀', '시럽', '단맛', 'caramel', 'honey', 'vanilla'] },
  // 견과 — 탠
  { color: '#B29B6B', keywords: ['아몬드', '헤이즐넛', '땅콩', '피칸', '호두', '너트', '견과', 'nut'] },
  // 향신료 — 스파이스 브라운
  { color: '#A34A2A', keywords: ['시나몬', '계피', '정향', '넛맥', '생강', '스파이스', 'spice', 'cinnamon'] },
];

// 노트 하나의 색 — 한국어 복합 노트는 뒤쪽 말이 본체라('오렌지 블라썸'=꽃, '레몬그라스'=허브, '오렌지 시럽'=단맛)
// 매칭된 키워드 중 가장 뒤에서 끝나는 것을, 같으면 더 긴 것을 고른다('청포도' > '포도'). (2026-10-31)
function noteColor(note: string): string | null {
  const n = note.normalize('NFC').toLowerCase();
  let best: { color: string; end: number; len: number } | null = null;
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      const k = kw.toLowerCase();
      const i = n.lastIndexOf(k);
      if (i < 0) continue;
      const end = i + k.length;
      if (!best || end > best.end || (end === best.end && k.length > best.len)) best = { color: cat.color, end, len: k.length };
    }
  }
  return best?.color ?? null;
}

// 노트 목록(쉼표 구분) → 노트 순서대로 색 (중복 제거)
export function flavorColors(tasting: string): string[] {
  const out: string[] = [];
  for (const note of tasting.split(/[,，·]/).map((x) => x.trim()).filter(Boolean)) {
    const c = noteColor(note);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// 같은 계열 이웃 색 — 색상환에서 살짝 돌리고 조금 밝게. 대표색 한 장도 단색으로 보이지 않게 그라데이션을 만든다.
function neighbor(hex: string, hueShift = 28, lightUp = 8): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360 + hueShift) % 360;
  return `hsl(${Math.round(h)} ${Math.round(sat * 100)}% ${Math.min(90, Math.round(l * 100) + lightUp)}%`;
}

// 색에 쓰는 노트 수 — 앞 노트 3개만(2026-10-31 대표 지시). 노트가 많을수록 색이 섞여
// 카드마다 비슷한 탁한 무지개가 되던 문제.
const GRADIENT_NOTES = 3;

// 헤더 배경 — B안 '대표색 한 장 + 포인트'(2026-10-31 대표 선택). 1번째 노트 색을 헤더 전체에 깔고,
// 2·3번째 색은 모서리(오른쪽 위·아래)의 은은한 빛 번짐으로만 얹는다 — 카드 한 장 = 대표색 하나로 구분되게.
// 반환값은 backgroundImage 여러 겹(위 레이어가 먼저). 알파 0x80(50%)·0x8C(55%)는 글자 가독 기준.
export function flavorGradient(tasting: string): string | null {
  const head = tasting.split(/[,，·]/).map((x) => x.trim()).filter(Boolean).slice(0, GRADIENT_NOTES).join(', ');
  const cs = flavorColors(head);
  if (cs.length === 0) return null;
  // 대표색 → 같은 계열 이웃 색으로 흐르는 그라데이션(단색 금지, 2026-10-31 대표 지시)
  const base = `linear-gradient(120deg, ${cs[0]}8C 0%, ${neighbor(cs[0])} / 0.45) 100%)`;
  const glowAt = ['100% 0%', '70% 120%'];
  const glows = cs.slice(1).map((c, i) => `radial-gradient(circle at ${glowAt[i]}, ${c}8C 0%, ${c}00 55%)`);
  return [...glows, base].join(', ');
}
