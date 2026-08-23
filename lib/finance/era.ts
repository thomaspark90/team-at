// 브랜드 시대 보정 — 가든서비스의 이전 브랜드 '이스트파크' (2026-08-23 대표 지시).
// 가든 두 지점(판교 2025-10, 양재천 그 이후) 운영 전의 지출은 같은 자리에서 운영하던
// 이스트파크 귀속이다. 수집기의 배송지 판정은 주소→현재 브랜드(garden)로만 읽으므로,
// 서버 적재 시점에 거래 월(ym)로 시대를 보정한다. 컷오프는 2025-09 이전(< '2025-09').
export const GARDEN_OPEN_YM = '2025-09';

// 가든 판정(명시·기본값·가맹점 사전 모두)에만 적용 — 스탭밀·개인은 시대와 무관.
export const gardenEraBrand = (brand: string, ym: string): string =>
  brand === 'garden' && ym < GARDEN_OPEN_YM ? 'eastpark' : brand;
