// 리뷰 답글 초안 생성 — Gemini (finance/ai-classify 와 동일한 모델 폴백 전략)
// 매장별 보이스를 프롬프트에 주입해 톤을 일관되게 유지한다.

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export type ReviewForDraft = {
  store_key: string;
  rating: number | null;
  content: string | null;
  keywords: string[] | null;
  visit_count: number | null;
  photo_count: number | null;
};

const STORE_NAME: Record<string, string> = {
  yangjae: '가든서비스 양재천점',
  pangyo: '가든서비스 판교점',
};

// 매장 공통 보이스 — 과장·이모지·상투어 없이 담백하게. 사장님이 직접 쓴 것처럼 읽혀야 한다.
const VOICE = `너는 카페 '가든서비스'의 사장님이다. 방문자 리뷰에 직접 답글을 쓴다.

톤 규칙:
- 담백하고 단정한 문장. 과장된 감탄, 느낌표 남발, 이모지 사용 금지.
- "소중한 리뷰 감사합니다", "최선을 다하겠습니다" 같은 복붙 상투어를 쓰지 않는다.
- 리뷰에 실제로 언급된 것(메뉴, 공간, 날씨, 방문 맥락)을 한 가지 골라 구체적으로 받는다.
- 2~3문장, 100자 내외. 짧아도 된다. 길게 늘리지 않는다.
- 손님의 성별을 단정하지 않는다.
- 재방문을 강요하거나 홍보 문구를 덧붙이지 않는다.

부정적인 리뷰일 때:
- 변명하거나 반박하지 않는다. 무엇이 아쉬웠는지 그대로 받고, 사실이면 인정한다.
- 개선할 점이 명확하면 한 가지만 담담하게 적는다. 지키지 못할 약속은 하지 않는다.

사진만 있고 글이 없는 리뷰일 때:
- 사진을 남겨준 것에 대해 짧게 한 문장. 내용을 지어내지 않는다.`;

const buildPrompt = (r: ReviewForDraft) => {
  const store = STORE_NAME[r.store_key] ?? '가든서비스';
  const lines = [
    `[매장] ${store}`,
    `[평점] ${r.rating ?? '없음'} / 5`,
    `[방문 횟수] ${r.visit_count ?? 1}회`,
    `[리뷰 본문] ${r.content?.trim() || '(본문 없이 사진만 등록됨)'}`,
  ];
  if (r.keywords?.length) lines.push(`[선택 키워드] ${r.keywords.join(', ')}`);
  if (r.photo_count) lines.push(`[사진] ${r.photo_count}장`);
  return `${VOICE}

아래 리뷰에 달 답글 본문만 출력해라. 따옴표, 머리말, 설명 없이 답글 텍스트만.

${lines.join('\n')}`;
};

/** 초안 1건 생성. 실패하면 null (수집 자체는 계속 진행). */
export async function draftReply(
  review: ReviewForDraft,
  apiKey: string,
): Promise<{ text: string; model: string } | null> {
  // gemini-2.5-* 는 thinking이 기본 on이라 maxOutputTokens를 사고에 먼저 써버려
  // 답글이 중간에 잘린다(실측). 초안 생성에는 사고가 필요 없으므로 끈다.
  const bodyFor = (model: string) =>
    JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(review) }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: bodyFor(model), signal: AbortSignal.timeout(25_000) },
      );
      if (!res.ok) continue; // 429(무료 한도)·5xx 포함 — 다음 모델로 폴백
      const json = await res.json();
      const text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .trim();
      if (text) return { text: text.slice(0, 500), model };
    } catch {
      /* 다음 모델로 폴백 */
    }
  }
  return null;
}
