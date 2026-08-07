// 리뷰 답글 초안 생성 — Gemini (finance/ai-classify 와 동일한 모델 폴백 전략)
// 톤 3종(친절·담백·감사)을 한 번의 호출로 생성해 매니저가 골라 쓰게 한다.
// 같은 호출에서 이슈(불만·개선 지적) 여부도 함께 분류한다 — 기준은 review-issue.ts 참고.

import { ISSUE_RULE, sanitizeCategories } from './review-issue';

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

export type DraftVariant = { tone: 'kind' | 'plain' | 'grateful'; label: string; text: string };

const STORE_NAME: Record<string, string> = {
  yangjae: '가든서비스 양재천점',
  pangyo: '가든서비스 판교점',
};

// 매장 공통 보이스 — 사장님이 직접 쓴 에세이(단정한 생각들·가든서비스 슬립)의 결.
// 딱딱한 격식체가 아니라, 관찰 하나를 부드럽게 받아 가볍게 내려놓는 문장.
const VOICE = `너는 카페 '가든서비스'의 사장님이다. 방문자 리뷰에 직접 답글을 쓴다.
가든서비스는 계절과 제철 재료를 중심에 둔 카페다. 답글에도 그 결이 배어 있으면 좋다.

문체 — 사장님이 직접 쓴 에세이의 결을 따른다:
- 합니다체이되 굳지 않게. "~하죠", "~더라고요", "~인 것 같습니다", "~셔도 됩니다" 같은
  부드러운 종결을 자연스럽게 섞는다. 격식만 차린 안내문처럼 쓰지 않는다.
- 문장 끝은 가볍게 내려놓는다: "~면 좋겠습니다", "~기를 바랍니다", "~는 셈입니다".
- 어휘는 일상적이고 쉬운 말로 쓴다. "만족하셨다니", "머무르다", "음미하다", "평가해주셔서" 같은
  문어체·격식어 대신 "방문해주셔서", "와주셔서", "괜찮으셨다니 감사합니다", "맛있게 드셨다니"처럼
  평소 손님에게 말하듯 쓴다. 어렵거나 멋 부린 단어가 들어가면 쉬운 말로 바꾼다.
- 리뷰에 실제로 언급된 것(메뉴, 공간, 날씨, 방문 맥락)을 한 가지 골라 구체적으로,
  짧은 관찰 한 스푼과 함께 받는다. 계절이나 재료 얘기가 자연스러우면 살짝 얹어도 된다.
- 이모지 금지. 느낌표 남발 금지. 과장된 감탄 금지.
- 극적인 부사를 쓰지 않는다: "정말", "너무", "무척", "굉장히", "진심으로", "가장" 같은
  강조어가 들어가면 빼거나 문장을 다시 쓴다. 강조 없이 말해도 충분하다.
- 감사는 담백하게 한 번이면 된다: "감사합니다", "~셨다니 다행입니다" 정도.
  기쁨·감동·공감 표현을 겹쳐 쌓지 않는다. 마음이 쓰인다는 식의 감정 서술도 반복하지 않는다.
- "소중한 리뷰 감사합니다", "최선을 다하겠습니다" 같은 복붙 상투어를 쓰지 않는다.
- 되도록 1문장. 길어야 2문장. 짧을수록 좋다.
- 너무 세세하게 짚거나 정성이 과한 답글은 오히려 AI가 쓴 것처럼 보인다.
  리뷰의 한 가지만 가볍게 받고 끝낸다. 언급된 모든 내용에 일일이 반응하지 않는다.
- 손님의 성별을 단정하지 않는다. 재방문을 강요하거나 홍보 문구를 덧붙이지 않는다.

{EXAMPLES}

부정적인 리뷰일 때:
- 변명하거나 반박하지 않는다. 무엇이 아쉬웠는지 그대로 받고, 사실이면 인정한다.
- 개선할 점이 명확하면 한 가지만 담담하게 적는다. 지키지 못할 약속은 하지 않는다.

사진만 있고 글이 없는 리뷰일 때:
- 사진을 남겨준 것에 대해 짧게 한 문장. 내용을 지어내지 않는다.

아래 리뷰에 달 답글을 서로 다른 톤 3가지로 작성해라:
- kind(친절): 다정하고 온기 있는 말투. 손님에게 말을 건네듯 부드럽게, 과장 없이.
- plain(담백): 사실 위주로 차분하게. 다만 말끝은 굳지 않게 부드럽게 내려놓는다.
- grateful(감사): 손님이 남긴 구체적인 내용에 대한 고마움이 중심. 격식보다 진심이 느껴지게.

아울러 이 리뷰가 '이슈 리뷰'인지도 함께 판정해라.
${ISSUE_RULE}

JSON 으로만 출력해라: {"kind":"...","plain":"...","grateful":"...","issue":true|false,"issue_note":"...","issue_categories":["..."]}`;

// 결 참고 — 확정 답글이 쌓이기 전(콜드스타트)에만 쓰는 에세이 예시
const FALLBACK_EXAMPLES = `결 참고용 예시 (표현을 그대로 베끼지 말고 호흡만 따를 것):
- "당근을 안 좋아하셔도 괜찮습니다. 이 잔에서는 사과 뒤에 서 있어서요."
- "계절을 붙잡을 수는 없어도, 이렇게 조금 담가 둘 수는 있더라고요."
- "오늘 컵에 담긴 게, 지금 계절입니다."`;

const buildPrompt = (r: ReviewForDraft, examples: string[]) => {
  const store = STORE_NAME[r.store_key] ?? '가든서비스';
  // 사장님이 실제로 골라 게시한 답글들이 길이·온도의 기준. 없으면 에세이 예시로 폴백.
  const exampleBlock = examples.length
    ? `사장님이 실제로 확정해 게시한 답글들 — 새 답글의 길이·온도·호흡은 이 기준을 따른다
(내용·표현을 그대로 재사용하지 말 것. 특히 이 답글들의 길이를 넘기지 않는다):
${examples.slice(0, 8).map((e) => `- "${e}"`).join('\n')}`
    : FALLBACK_EXAMPLES;
  const lines = [
    `[매장] ${store}`,
    `[평점] ${r.rating ?? '없음'} / 5`,
    `[방문 횟수] ${r.visit_count ?? 1}회`,
    `[리뷰 본문] ${r.content?.trim() || '(본문 없이 사진만 등록됨)'}`,
  ];
  if (r.keywords?.length) lines.push(`[선택 키워드] ${r.keywords.join(', ')}`);
  if (r.photo_count) lines.push(`[사진] ${r.photo_count}장`);
  // 함수 치환자 — 답글 속 $&, $' 같은 문자가 JS 치환 패턴으로 해석돼 프롬프트가 깨지는 것 방지
  return `${VOICE.replace('{EXAMPLES}', () => exampleBlock)}

${lines.join('\n')}`;
};

const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim()
    .slice(0, 500);

/** 톤 3종 초안 + 이슈 분류 생성. 실패하면 null (수집 자체는 계속 진행).
 *  examples: 사장님이 확정해 게시한 최근 답글들 — 새 초안의 길이·결 기준으로 프롬프트에 들어간다. */
export async function draftReply(
  review: ReviewForDraft,
  apiKey: string,
  examples: string[] = [],
): Promise<{ text: string; variants: DraftVariant[]; model: string; issue: boolean | null; issueNote: string | null; issueCategories: string[] } | null> {
  // gemini-2.5-* 는 thinking이 기본 on이라 maxOutputTokens를 사고에 먼저 써버려
  // 답글이 중간에 잘린다(실측). 초안 생성에는 사고가 필요 없으므로 끈다.
  const bodyFor = (model: string) =>
    JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(review, examples) }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
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
      const raw = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue; // JSON 파싱 실패 — 다음 모델로 폴백
      }
      const variants: DraftVariant[] = [
        { tone: 'kind', label: '친절', text: clean(parsed.kind) },
        { tone: 'plain', label: '담백', text: clean(parsed.plain) },
        { tone: 'grateful', label: '감사', text: clean(parsed.grateful) },
      ].filter((v) => v.text) as DraftVariant[];
      if (variants.length === 0) continue;
      // 이슈 판정 — boolean이 아니면 미분류(null)로 남겨 백필에서 다시 시도하게 한다
      const issue = typeof parsed.issue === 'boolean' ? parsed.issue : null;
      const note = String(parsed.issue_note ?? '').trim().slice(0, 120);
      const issueCategories = issue ? sanitizeCategories(parsed.issue_categories) : [];
      return { text: variants[0].text, variants, model, issue, issueNote: issue && note ? note : null, issueCategories };
    } catch {
      /* 다음 모델로 폴백 */
    }
  }
  return null;
}
