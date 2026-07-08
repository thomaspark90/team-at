// 송금 요청 — 영수증/거래명세서 이미지에서 Gemini 로 이체 정보 추출

export interface TransferExtraction {
  rotation: 0 | 90 | 180 | 270; // 글자가 바로 서도록 시계방향으로 돌릴 각도(박스 좌표로 역산)
  vendor_name: string | null;
  doc_date: string | null; // YYYY-MM-DD
  amount: number | null; // 이번 거래 청구액
  balance_total: number | null; // 전잔액 포함 총잔액(있을 때만)
  items_summary: string | null;
  bank: string | null;
  account_no: string | null;
  account_holder: string | null;
}

export interface TransferRequestRow {
  id: number;
  created_at: string;
  requester_email: string;
  vendor_name: string;
  doc_date: string | null;
  amount: number;
  items_summary: string | null;
  bank: string | null;
  account_no: string | null;
  account_holder: string | null;
  memo: string | null;
  image_path: string | null;
  status: 'pending' | 'done';
  done_by_email: string | null;
  done_at: string | null;
}

const PROMPT = `이 이미지는 한국의 거래명세서 또는 영수증이야. 문서가 옆으로 눕거나 뒤집혀 있을 수 있어. 공급자에게 대금을 이체(송금)하기 위한 정보를 추출해서 아래 JSON 스키마로만 답해.

{
  "title_edge": "top"|"right"|"bottom"|"left", // 이미지 픽셀 그대로 봤을 때(자동 보정 없이) 문서의 제목/머리(거래명세서·상호 등 논리적으로 가장 먼저 오는 부분)가 이미지 프레임의 어느 변에 붙어 있는지. 글자가 정상으로 읽히면 top, 문서 머리가 오른쪽 변이면 right, 아래 변이면 bottom, 왼쪽 변이면 left
  "vendor_name": string|null,   // 돈을 받을 공급자 상호. 문서를 발행한 회사명. '고객명'·'거래처명' 칸(구매자, 예: 스텝밀·판교)이 아님에 주의
  "doc_date": string|null,      // 거래일자 YYYY-MM-DD
  "amount": number|null,        // 이번 거래 청구 금액(합계·청구금액합계). 숫자만
  "balance_total": number|null, // 전잔액(미수금) 포함 총잔액이 별도로 있으면 그 값, 없으면 null
  "items_summary": string|null, // 품목을 "품목명 수량" 형태로 쉼표로 이어 한 줄 요약 (예: "코크제로 10BIB 2, 양상추 8BOX")
  "bank": string|null,          // 문서에 인쇄된 입금 계좌의 은행명 (예: 농협). 없으면 null
  "account_no": string|null,    // 계좌번호. 하이픈 포함 인쇄된 그대로. 없으면 null
  "account_holder": string|null // 예금주. 없으면 null
}

규칙: 숫자에 쉼표 넣지 말 것. 흐리거나 확실하지 않은 값은 null. JSON 외 다른 텍스트 금지.`;

// 무료 티어 일일 쿼터(모델별 분리)가 작아서 429/과부하 시 다음 모델로 폴백
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

// 문서 제목(머리)이 붙은 변 → 정면 회전각.
// Gemini 는 기울어진 이미지도 내부에서 방향을 정규화해 읽기 때문에 "몇 도 돌려야 하나"를
// 직접 물으면 항상 0이 나온다. 제목 위치(변)를 묻는 방식이 실측 검증에서 가장 안정적
// (정방향·좌우 눕힘 모두 정확, 180° 거꾸로만 놓칠 수 있음 → 확인창 수동 ↻ 버튼이 보완).
function inferRotation(edge: unknown): 0 | 90 | 180 | 270 {
  switch (edge) {
    case 'right':
      return 270; // 문서 머리가 오른쪽 = 시계방향으로 90 돌아간 사진 → 270 더 돌려 복원
    case 'bottom':
      return 180;
    case 'left':
      return 90;
    default:
      return 0;
  }
}

// Gemini 비전으로 이미지에서 이체 정보 추출. 모든 모델 실패 시 throw.
export async function extractTransferInfo(
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<TransferExtraction> {
  const body = JSON.stringify({
    contents: [
      {
        parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: PROMPT }],
      },
    ],
    generationConfig: { response_mime_type: 'application/json', temperature: 0 },
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
      continue; // 쿼터 소진·과부하 → 다음 모델
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
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,\s원]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    rotation: inferRotation(raw.title_edge),
    vendor_name: str(raw.vendor_name),
    doc_date: str(raw.doc_date),
    amount: num(raw.amount),
    balance_total: num(raw.balance_total),
    items_summary: str(raw.items_summary),
    bank: str(raw.bank),
    account_no: str(raw.account_no),
    account_holder: str(raw.account_holder),
  };
}
