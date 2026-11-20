// 네임택 문구 초안 — 한글 메뉴 이름만 넣으면 영문 이름·설명·카테고리를 기존 네임택 톤으로 제안한다(2026-11-20, 추가 방식 C안).
// 초안은 제안일 뿐이다: 양식에 채워 넣기만 하고 저장은 사람이 고친 뒤에 한다. 원두명 번역과 같은 모델 폴백·JSON 강제 패턴.
import { groupByCategory, oneLine, type NametagCatalog } from './nametags';

export type NametagDraft = { en: string; desc: string; category: string | null };

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const PER_CATEGORY = 3; // 카테고리마다 예시로 보여 줄 기존 메뉴 수 — 톤과 분류 기준을 함께 알려 준다

/** 기존 메뉴를 예시로 넣은 지시문. 순수 함수라 테스트에서 그대로 확인한다. */
export function buildDraftPrompt(ko: string, catalog: NametagCatalog): string {
  const groups = groupByCategory(catalog).filter((g) => g.items.some((i) => i.kind === 'menu'));
  const examples = groups
    .map((g) => {
      const rows = g.items
        .filter((i) => i.kind === 'menu' && i.en && i.desc)
        .slice(0, PER_CATEGORY)
        .map((i) => JSON.stringify({ ko: oneLine(i.ko), en: i.en, desc: i.desc }));
      return `[${g.category.id}] ${g.category.label}\n${rows.join('\n')}`;
    })
    .join('\n\n');
  return `너는 브런치 뷔페 매장의 메뉴 네임택 문구를 쓰는 사람이야. 아래 한글 메뉴 이름에 맞는 영문 이름과 설명 초안을 써.

규칙
- en: 영문 메뉴 이름. 각 단어 첫 글자 대문자(Title Case), 외래 음식 이름은 원어 철자(예: 뇨끼 → Gnocchi). 40자 이내.
- desc: 한국어 설명. 아래 예시와 같은 말투·길이로, 재료나 맛을 짧게. 한 줄은 공백 포함 24자 이내, 길면 줄바꿈(\\n)으로 최대 2줄. 이름에서 알 수 없는 재료를 지어내지 말고, 모르면 짧게 써.
- category: 아래 대괄호 안 id 중 가장 알맞은 것 하나. 맞는 것이 없으면 null.

기존 네임택(카테고리별 예시)
${examples}

아래 JSON 스키마로만 답해:
{"en": string, "desc": string, "category": string | null}

한글 메뉴 이름: ${ko}`;
}

/** 모델 응답을 인쇄 가능한 형태로 다듬는다 — 길이·줄 수 제한, 없는 카테고리는 버림. */
export function cleanDraft(raw: unknown, catalog: NametagCatalog): NametagDraft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const en = str(r.en).replace(/\s+/g, ' ').trim().slice(0, 80);
  const desc = str(r.desc)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n')
    .slice(0, 200);
  const category = catalog.categories.some((c) => c.id === r.category) ? String(r.category) : null;
  return { en, desc, category };
}

export async function draftNametag(ko: string, catalog: NametagCatalog, apiKey: string): Promise<NametagDraft> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildDraftPrompt(ko, catalog) }] }],
    generationConfig: { response_mime_type: 'application/json', temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
  });
  let text: string | undefined;
  let lastError = '';
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.status === 429 || res.status === 503) {
      lastError = `${model}: ${res.status}`;
      continue;
    }
    if (!res.ok) throw new Error(`Gemini 호출 실패(${res.status}): ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) break;
    lastError = `${model}: 빈 응답`;
  }
  if (!text) throw new Error(`AI 사용량 한도에 걸렸어요. 잠시 후 다시 시도해주세요. (${lastError})`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('초안을 읽지 못했어요. 다시 시도해주세요.');
  }
  const draft = cleanDraft(parsed, catalog);
  if (!draft.en && !draft.desc) throw new Error('초안이 비어 있어요. 메뉴 이름을 확인해주세요.');
  return draft;
}
