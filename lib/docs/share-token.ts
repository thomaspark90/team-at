import { createHmac, timingSafeEqual } from 'crypto';

// ⚠️ 서버 전용(crypto·비밀값) — 클라이언트 컴포넌트에서 import 하지 말 것.

// 내부 문서 공유 링크 토큰 — 링크를 가진 사람만 열람.
// 토큰 = HMAC-SHA256(DOCS_SHARE_SECRET, "doc:<slug>:<version>") 의 base64url 앞 32자.
// 토큰은 어디에도 저장하지 않고 매번 계산한다(DB·레포에 남지 않음).
// 링크를 무효화하려면 해당 문서의 version 을 올리거나 비밀값을 교체한다(전체 문서 링크가 함께 바뀜).

const SECRET = process.env.DOCS_SHARE_SECRET;

export function docShareToken(slug: string, version = 1): string | null {
  if (!SECRET) return null; // 비밀값 미설정이면 어떤 링크도 발급·통과시키지 않는다
  return createHmac('sha256', SECRET).update(`doc:${slug}:${version}`).digest('base64url').slice(0, 32);
}

export function tokenMatches(token: string, slug: string, version = 1): boolean {
  const expected = docShareToken(slug, version);
  if (!expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
