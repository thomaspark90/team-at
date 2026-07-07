// 송금 요청 — 영수증/거래명세서 이미지에서 Gemini 로 이체 정보 추출

export interface TransferExtraction {
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

const PROMPT = `이 이미지는 한국의 거래명세서 또는 영수증이야. 공급자에게 대금을 이체(송금)하기 위한 정보를 추출해서 아래 JSON 스키마로만 답해.

{
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

// Gemini 비전으로 이미지에서 이체 정보 추출. 실패 시 throw.
export async function extractTransferInfo(
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<TransferExtraction> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: { response_mime_type: 'application/json', temperature: 0 },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini 호출 실패(${res.status}): ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답이 비어 있어요.');

  const raw = JSON.parse(text) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,\s원]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
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
