// 원두봉투 사진 → Gemini 비전 추출 — 가격 세팅의 원두 정보(원두명·로스팅사·용량 등) 자동 기입용.
// 송금 영수증 인식(lib/finance/transfer.ts)과 동일한 모델 폴백·JSON 강제 패턴.

export interface BeanScanExtraction {
  beanName: string | null; // 산지/품종 포함 원두명 (예: 에티오피아 게뎁 워시드)
  roastery: string | null; // 로스팅사/브랜드
  weightG: number | null; // 봉투 표기 용량(g)
  roastLevel: string | null; // 배전도 표기 (라이트/미디엄/다크 등)
  tastingNotes: string | null; // 테이스팅 노트 (쉼표 구분)
}

const PROMPT = `이 이미지는 커피 원두 봉투(패키지) 사진이야. 라벨이 기울거나 일부만 보일 수 있어.
봉투에 인쇄된 정보만 읽어서 아래 JSON 스키마로만 답해. 보이지 않는 항목은 null.
- bean_name: 산지 국가·지역·품종·가공방식을 포함한 원두 이름 (한국어로, 예: "에티오피아 게뎁 워시드"). 로스팅사 이름은 제외.
- roastery: 로스팅사/브랜드 이름 (예: "언스페셜티", "프릳츠")
- weight_g: 봉투에 표기된 용량을 그램 숫자로 (예: 200, 1000. "1kg"→1000)
- roast_level: 배전도 표기가 있으면 그대로 (예: "라이트", "미디엄 다크")
- tasting_notes: 테이스팅/컵 노트가 있으면 쉼표로 이어서 (예: "자스민, 청포도, 얼그레이")
{"bean_name": string|null, "roastery": string|null, "weight_g": number|null, "roast_level": string|null, "tasting_notes": string|null}`;

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export async function extractBeanBagInfo(
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<BeanScanExtraction> {
  const body = JSON.stringify({
    contents: [
      { parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: PROMPT }] },
    ],
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

  const raw = JSON.parse(text) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  return {
    beanName: str(raw.bean_name),
    roastery: str(raw.roastery),
    weightG: num(raw.weight_g),
    roastLevel: str(raw.roast_level),
    tastingNotes: str(raw.tasting_notes),
  };
}
