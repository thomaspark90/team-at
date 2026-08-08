// 언스페셜티 컴퍼스 결과 캡처 → Gemini 비전 추출 — 분쇄도 측정 업로드의 수치 자동 기입용.
// 원두봉투 스캔(lib/garden-bean-scan.ts)과 동일한 모델 폴백·JSON 강제 패턴.

export interface GrindScanExtraction {
  dial: number | null; // 제목의 그라인더 다이얼 (예: "EK43 - 6" → 6)
  meanUm: number | null; // 평균 입자 크기(µm)
  stdUm: number | null; // 표준편차(µm)
  finesPct: number | null; // 미분 비율(%)
}

const PROMPT = `이 이미지는 커피 분쇄 입자 측정 앱(언스페셜티 컴퍼스)의 결과 화면 캡처야.
화면에 표시된 수치만 읽어서 아래 JSON 스키마로만 답해. 보이지 않는 항목은 null.
- dial: 제목/헤더의 그라인더 다이얼 숫자 (예: "EK43 - 6" → 6, "EK43 · 8.5" → 8.5)
- mean_um: 평균 입자 크기를 µm 숫자로 (예: "773.02 ± 133.5 µm" → 773.02, "평균 크기 720µm" → 720)
- std_um: 표준편차를 µm 숫자로 (예: "773.02 ± 133.5 µm" → 133.5, "표준편차 154.7µm" → 154.7)
- fines_pct: 미분(fines) 비율을 % 숫자로 (예: "미분 12%" → 12)
{"dial": number|null, "mean_um": number|null, "std_um": number|null, "fines_pct": number|null}`;

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export async function extractGrindCompassInfo(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<GrindScanExtraction> {
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
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
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
  const num = (v: unknown, max: number) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 100) / 100 : null;
  };
  return {
    dial: num(raw.dial, 20), // EK43 다이얼은 0~11 안팎 — 20 초과는 오독으로 버림
    meanUm: num(raw.mean_um, 3000),
    stdUm: num(raw.std_um, 1500),
    finesPct: num(raw.fines_pct, 100),
  };
}
