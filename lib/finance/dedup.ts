import { createHash } from 'crypto';

// 재업로드 중복 차단용 지문 — 여러 필드를 이어붙여 sha256 앞 32자.
// 은행/카드/영수증 파서·라우트가 공통으로 사용한다.
export const hash = (...parts: (string | number)[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
