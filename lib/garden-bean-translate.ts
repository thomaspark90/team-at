// 한글 원두명 → 영문 표기 변환 — 원두카드 인쇄용. 원두봉투 스캔과 동일한 모델 폴백·JSON 강제 패턴.

const PROMPT_PREFIX = `너는 스페셜티 커피 표기 전문가야. 아래 한글 원두명을 업계 표준 영문 표기로 변환해.
- 산지 국가·농장/지역·품종·가공방식·랏 표기를 스페셜티 커피 업계에서 통용되는 공식 로마자 표기로 (예: "과테말라 인헤르또" → "Guatemala El Injerto", "게이샤" → "Geisha", "워시드" → "Washed", "옥션랏" → "Auction Lot")
- 각 단어 첫 글자 대문자(Title Case), 연도 등 숫자는 그대로
- 로스팅사 이름이 섞여 있으면 제외
아래 JSON 스키마로만 답해:
{"bean_name_en": string}

한글 원두명: `;

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export async function translateBeanName(korean: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT_PREFIX + korean }] }],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let text: string | undefined;
  let lastError = '';
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );
    if (res.status === 429 || res.status === 503) {
      lastError = `${model}: ${res.status}`;
      continue;
    }
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini 호출 실패(${res.status}): ${errBody.slice(0, 200)}`);
    }
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) break;
    lastError = `${model}: 빈 응답`;
  }
  if (!text) {
    throw new Error(`AI 사용량 한도에 걸렸어요. 잠시 후 다시 시도해주세요. (${lastError})`);
  }

  const raw = JSON.parse(text) as { bean_name_en?: unknown };
  const out = typeof raw.bean_name_en === 'string' ? raw.bean_name_en.trim() : '';
  if (!out) throw new Error('영문 변환 결과가 비어 있어요. 원두명을 확인해주세요.');
  return out;
}
