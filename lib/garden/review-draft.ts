// 리뷰 답글 초안 생성 — Gemini (finance/ai-classify 와 동일한 모델 폴백 전략)
// 톤 3종(친절·담백·감사)을 한 번의 호출로 생성해 매니저가 골라 쓰게 한다.
// 같은 호출에서 이슈(불만·개선 지적) 여부도 함께 분류한다 — 기준은 review-issue.ts 참고.

import { ISSUE_RULE, sanitizeCategories } from './review-issue';
import { GEMINI_MODELS as MODELS } from './review-constants';
import { STORES } from '@/lib/types';

/** 사장님이 확정해 게시한 최근 답글 — 새 초안의 길이·결 기준.
 *  목록 API(redraft)와 인제스트가 같은 쿼리를 쓰도록 여기서 단일화한다. */
export async function recentReplyExamples(db: { from: (table: string) => any }): Promise<string[]> {
  const { data } = await db
    .from('place_reviews')
    .select('reply_text')
    .not('reply_text', 'is', null)
    .in('status', ['approved', 'posted'])
    .order('approved_at', { ascending: false })
    .limit(8);
  return ((data ?? []) as { reply_text: string | null }[])
    .map((e) => String(e.reply_text ?? '').trim())
    .filter(Boolean);
}

export type ReviewForDraft = {
  store_key: string;
  rating: number | null;
  content: string | null;
  keywords: string[] | null;
  visit_count: number | null;
  photo_count: number | null;
  reviewed_at?: string | null; // 마무리 인사(주말/평일)를 리뷰 날짜 요일에 맞추는 데 쓴다
};

export type DraftVariant = { tone: 'kind' | 'plain' | 'grateful'; label: string; text: string };

// 매장 라벨은 lib/types STORES 단일 정의에서 유도 — '가든서비스 ' 접두만 여기서 붙인다
const STORE_NAME: Record<string, string> = Object.fromEntries(
  STORES.map((s) => [s.id, `가든서비스 ${s.label}`])
);

// 매장 공통 보이스 — 동네 카페 사장님이 손님에게 짧게 인사 건네는 답글.
// 설명하거나 멋 부리지 않고, 쉬운 말로 고마움 전하고 인사로 끝낸다.
const VOICE = `너는 카페 '가든서비스'의 사장님이다. 방문자 리뷰에 직접 답글을 쓴다.

문체 — 손님에게 짧게 인사 건네듯, 최대한 쉽게:
- 합니다체이되 굳지 않게. 평소 손님에게 말하듯 쉬운 말로 쓴다.
  "만족하셨다니", "머무르다", "음미하다" 같은 문어체·격식어 대신
  "맛있게 드셨다니", "와주셔서", "괜찮으셨다니"처럼 쓴다.
- 설명하려 들지 않는다. 메뉴·재료·공간에 대한 부연 설명이나 관찰을 덧붙이지 않는다.
  리뷰에 언급된 것 중 하나만 짧게 받고, 받을 게 마땅치 않으면 감사 인사만으로 충분하다.
- 반드시 가벼운 마무리 인사로 끝낸다:
  "감사합니다.", "방문해주셔서 감사합니다.", "좋은 하루 되세요.", "좋은 주말 되세요!" 중
  흐름에 자연스러운 것 하나.
- "좋은 주말 되세요!"는 [리뷰 날짜]의 요일이 금·토·일일 때만 쓴다.
  그 외 요일이거나 날짜를 모르면 "좋은 하루 되세요."나 "감사합니다."로 끝낸다.
- 되도록 1문장, 길어야 2문장 — 마무리 인사까지 포함해서다. 짧을수록 좋다.
- 이모지 금지. 느낌표는 마무리 인사에 하나 정도만. 과장된 감탄 금지.
- 극적인 부사를 쓰지 않는다: "정말", "너무", "무척", "굉장히", "진심으로", "가장" 같은
  강조어가 들어가면 빼거나 문장을 다시 쓴다.
- "소중한 리뷰 감사합니다", "최선을 다하겠습니다" 같은 복붙 상투어는 쓰지 않는다.
  다만 "방문해주셔서 감사합니다"처럼 평범하고 짧은 감사는 얼마든지 좋다.
- 길게 짚거나 정성이 과한 답글은 오히려 AI가 쓴 것처럼 보인다. 짧은 인사가 더 사람답다.
- 손님의 성별을 단정하지 않는다. 재방문을 강요하거나 홍보 문구를 덧붙이지 않는다.

{EXAMPLES}

부정적인 리뷰일 때:
- 변명하거나 반박하지 않는다. 무엇이 아쉬웠는지 그대로 받고, 사실이면 인정한다.
- 개선할 점이 명확하면 한 가지만 담담하게 적는다. 지키지 못할 약속은 하지 않는다.

사진만 있고 글이 없는 리뷰일 때:
- 사진을 남겨준 것에 대해 짧게 한 문장. 내용을 지어내지 않는다.

아래 리뷰에 달 답글을 서로 다른 톤 3가지로 작성해라 (셋 다 짧고 쉬운 문장 + 마무리 인사 규칙을 지킨다):
- kind(친절): 다정하고 온기 있는 말투. 손님에게 말을 건네듯 부드럽게, 과장 없이.
- plain(담백): 군더더기 없이 감사 인사 위주로. 가장 짧아도 된다.
- grateful(감사): 손님이 남긴 내용 하나를 짧게 받으며 고마움을 전한다.

아울러 이 리뷰가 '이슈 리뷰'인지도 함께 판정해라.
${ISSUE_RULE}

JSON 으로만 출력해라: {"kind":"...","plain":"...","grateful":"...","issue":true|false,"issue_note":"...","issue_categories":["..."]}`;

// 결 참고 — 확정 답글이 쌓이기 전(콜드스타트)에만 쓰는 예시
const FALLBACK_EXAMPLES = `결 참고용 예시 (표현을 그대로 베끼지 말고 길이·호흡만 따를 것):
- "맛있게 드셨다니 감사합니다. 좋은 하루 되세요."
- "방문해주셔서 감사합니다. 좋은 주말 되세요!"
- "사진까지 남겨주셔서 감사합니다. 또 뵙겠습니다."`;

const buildPrompt = (r: ReviewForDraft, examples: string[]) => {
  const store = STORE_NAME[r.store_key] ?? '가든서비스';
  // 사장님이 실제로 골라 게시한 답글들이 길이·온도의 기준. 없으면 에세이 예시로 폴백.
  const exampleBlock = examples.length
    ? `사장님이 실제로 확정해 게시한 답글들 — 새 답글의 길이·온도·호흡은 이 기준을 따른다
(내용·표현을 그대로 재사용하지 말 것. 특히 이 답글들의 길이를 넘기지 않는다.
이 예시들이 길거나 설명이 많더라도, 위 문체 규칙(짧게·설명 없이·마무리 인사)이 우선이다):
${examples.slice(0, 8).map((e) => `- "${e}"`).join('\n')}`
    : FALLBACK_EXAMPLES;
  // 마무리 인사는 리뷰가 작성된 날짜 기준 — 평일 리뷰에 "좋은 주말 되세요!"가 달리지 않게 한다
  const reviewed = r.reviewed_at ? new Date(r.reviewed_at) : null;
  const reviewDay =
    reviewed && !Number.isNaN(reviewed.getTime())
      ? `${reviewed.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} (${reviewed.toLocaleDateString('ko-KR', { weekday: 'long', timeZone: 'Asia/Seoul' })})`
      : '알 수 없음';
  const lines = [
    `[리뷰 날짜] ${reviewDay}`,
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
