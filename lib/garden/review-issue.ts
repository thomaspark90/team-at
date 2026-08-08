// 리뷰 이슈(불만·개선 지적) 분류 — Gemini
// 신규 리뷰는 초안 생성(review-draft.ts)에 분류가 동승하고,
// 이 모듈은 기존 리뷰 백필·단독 재분류에 쓰는 분류 전용 호출이다.

import { GEMINI_MODELS as MODELS } from './review-constants';

export type ReviewForIssue = {
  rating: number | null;
  content: string | null;
  keywords: string[] | null;
};

// 이슈 고정 카테고리 — 집계·필터의 축. DB(issue_categories)에는 이 라벨을 그대로 저장한다.
export const ISSUE_CATEGORIES = ['맛·품질', '위생', '소음·환경', '응대', '가격', '대기', '시설'] as const;

// LLM 출력에서 카테고리 배열을 고정 목록에 맞춰 정제 — draft·classify 양쪽에서 사용
export const sanitizeCategories = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const allowed = new Set<string>(ISSUE_CATEGORIES);
  return Array.from(new Set(v.map((c) => String(c).trim()).filter((c) => allowed.has(c))));
};

// 초안 생성 프롬프트(review-draft.ts)와 공유하는 판정 기준 — 한 곳에서만 수정한다.
export const ISSUE_RULE = `'이슈 리뷰' 판정 기준:
- 본문에 불만·지적·개선 요청이 하나라도 담겨 있으면 이슈다. 평점이 높아도 본문 내용으로 판단한다.
- 해당 영역: 맛·품질, 위생, 소음·온도·냄새 등 매장 환경, 응대·서비스, 가격, 대기 시간, 시설·좌석.
- 제외: 칭찬뿐인 리뷰, 단순 인사말("아쉽지만 다음에 또 올게요" 류), 매장이 어쩔 수 없는 외부 요인(날씨, 동네 주차 사정 일반론).
- issue_note: 이슈일 때만, 지적된 내용을 "매장 소음 울림 · 블루베리주스 맛 · 조리 위생" 처럼
  '·'로 구분한 짧은 한국어 구절로 요약한다(40자 이내). 이슈가 아니면 빈 문자열.
- issue_categories: 이슈일 때만, 지적이 속한 카테고리를 다음 목록에서 그대로 골라 배열로 담는다
  (목록 밖 단어 금지, 해당 없으면 빈 배열): ${ISSUE_CATEGORIES.join(', ')}. 이슈가 아니면 빈 배열.`;

const buildPrompt = (r: ReviewForIssue) => {
  const lines = [
    `[평점] ${r.rating ?? '없음'} / 5`,
    `[리뷰 본문] ${r.content?.trim() || '(본문 없음)'}`,
  ];
  if (r.keywords?.length) lines.push(`[선택 키워드] ${r.keywords.join(', ')}`);
  return `카페 방문자 리뷰가 '이슈 리뷰'인지 판정해라.

${ISSUE_RULE}

${lines.join('\n')}

JSON 으로만 출력해라: {"issue":true|false,"issue_note":"...","issue_categories":["..."]}`;
};

/** 이슈 여부 분류. 실패하면 null (호출측에서 미분류로 남긴다). */
export async function classifyIssue(
  review: ReviewForIssue,
  apiKey: string,
): Promise<{ issue: boolean; note: string | null; categories: string[]; model: string } | null> {
  const bodyFor = (model: string) =>
    JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(review) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
        ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: bodyFor(model), signal: AbortSignal.timeout(20_000) },
      );
      if (!res.ok) continue; // 429·5xx — 다음 모델로 폴백
      const json = await res.json();
      const raw = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
      let parsed: { issue?: unknown; issue_note?: unknown; issue_categories?: unknown };
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (typeof parsed.issue !== 'boolean') continue;
      const note = String(parsed.issue_note ?? '').trim().slice(0, 120);
      const categories = parsed.issue ? sanitizeCategories(parsed.issue_categories) : [];
      return { issue: parsed.issue, note: parsed.issue && note ? note : null, categories, model };
    } catch {
      /* 다음 모델로 폴백 */
    }
  }
  return null;
}
