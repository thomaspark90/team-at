// 송금 요청 — 영수증/거래명세서 이미지에서 Gemini 로 이체 정보 추출

export type TransferBrand = 'staffmeal' | 'garden';

export interface TransferExtraction {
  rotation: 0 | 90 | 180 | 270; // 글자가 바로 서도록 시계방향으로 돌릴 각도(박스 좌표로 역산)
  brand: TransferBrand | null; // AI 추정 — 확신 없으면 null, 확인창에서 필수 선택
  vendor_name: string | null;
  doc_date: string | null; // YYYY-MM-DD
  amount: number | null; // 이번 거래 청구액
  prev_balance: number | null; // 이번 건 이전까지 남은 미수금(전잔액·전월이월)
  balance_total: number | null; // 미수금 포함 총잔액(있을 때만)
  /** 우리 항목(이번 청구·전잔액·총잔액)에 해당하지 않는 금액 표기 — 할인·반품·선입금 등 */
  other_amounts: { label: string; amount: number }[];
  items_summary: string | null;
  bank: string | null;
  account_no: string | null;
  account_holder: string | null;
}

// ── 미수금 분해 ───────────────────────────────────────────────────────────────
// 명세서마다 표기가 달라 '총잔액에 이번 발주가 포함돼 있는지'가 헷갈린다.
// 세 값(이번 청구·전잔액·총잔액)의 관계로 판별해 지급 기준을 고를 수 있게 한다.

export type PayBasis = 'current' | 'prev' | 'total';

export interface PayOption {
  key: PayBasis;
  label: string;
  amount: number;
}

export interface BalanceBreakdown {
  /** 총잔액에 이번 발주가 포함돼 있는지. null = 판단 불가 */
  totalIncludesCurrent: boolean | null;
  current: number | null; // 이번 발주분
  prev: number | null; // 이전 미수금
  total: number | null; // 미수 포함 총액
  options: PayOption[]; // 지급 기준 선택지 (중복 금액은 하나로)
  /** 사람이 읽는 한 줄 설명 — 확인창에 그대로 노출 */
  note: string | null;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1; // 원 단위 반올림 오차 허용

export function breakdownBalance(x: {
  amount: number | null;
  prev_balance: number | null;
  balance_total: number | null;
}): BalanceBreakdown {
  const cur = x.amount;
  let prev = x.prev_balance;
  let total = x.balance_total;

  // 두 값만 읽혔으면 나머지 하나는 산술로 채운다(명세서가 늘 셋을 다 인쇄하진 않는다)
  if (total == null && cur != null && prev != null) total = cur + prev;
  if (prev == null && cur != null && total != null && total >= cur) prev = total - cur;

  let totalIncludesCurrent: boolean | null = null;
  let note: string | null = null;
  if (cur != null && prev != null && total != null) {
    if (near(prev + cur, total)) {
      totalIncludesCurrent = true;
      note = `총잔액 ${total.toLocaleString()}원 = 이전 미수 ${prev.toLocaleString()}원 + 이번 발주 ${cur.toLocaleString()}원`;
    } else if (near(prev, total)) {
      // 총잔액이 전잔액과 같다 = 이번 발주가 아직 잔액에 반영되지 않음
      totalIncludesCurrent = false;
      note = `총잔액 ${total.toLocaleString()}원에는 이번 발주 ${cur.toLocaleString()}원이 빠져 있어요`;
    } else {
      note = `읽어낸 금액이 서로 맞지 않아요 (이전 미수 ${prev.toLocaleString()} + 이번 ${cur.toLocaleString()} ≠ 총 ${total.toLocaleString()}). 명세서를 확인해 주세요`;
    }
  } else if (cur != null && total != null && total > cur) {
    totalIncludesCurrent = true;
    note = `총잔액 ${total.toLocaleString()}원에 이번 발주 ${cur.toLocaleString()}원이 포함된 것으로 보여요`;
  } else if (prev != null && cur != null) {
    note = `이전 미수 ${prev.toLocaleString()}원이 남아 있어요`;
  }

  const options: PayOption[] = [];
  const push = (key: PayBasis, label: string, amount: number | null) => {
    if (amount == null || amount <= 0) return;
    if (options.some((o) => o.amount === amount)) return; // 같은 금액이면 선택지를 늘리지 않는다
    options.push({ key, label, amount });
  };
  push('current', '이번 발주만', cur);
  push('prev', '이전 미수만', prev);
  push('total', totalIncludesCurrent === false ? '미수 + 이번 발주' : '미수 포함 총액', total ?? (cur != null && prev != null ? cur + prev : null));

  return { totalIncludesCurrent, current: cur, prev, total, options, note };
}

export interface TransferRequestRow {
  id: number;
  created_at: string;
  brand: TransferBrand | null; // 구분 도입 전 등록 건은 null
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
  "brand": "staffmeal"|"garden"|null, // 이 매입이 어느 브랜드 것인지. 구매자·고객명 칸에 '스탭밀'/'스텝밀'/'staff meal'이 보이면 staffmeal, '가든'/'garden'이 보이면 garden. 이름이 없으면 품목으로 추정: 원두·커피·시럽·우유 등 카페 재료면 garden, 식당 식자재(쌀·김치·정육·채소·소스 등)면 staffmeal. 애매하면 반드시 null
  "vendor_name": string|null,   // 돈을 받을 공급자 상호. 문서를 발행한 회사명. '고객명'·'거래처명' 칸(구매자, 예: 스텝밀·판교)이 아님에 주의
  "doc_date": string|null,      // 거래일자 YYYY-MM-DD
  "amount": number|null,        // 이번 거래 청구 금액만. '합계·공급가액+세액·당월매출·금일합계·청구금액' 등 이번 거래분. 숫자만
  "prev_balance": number|null,  // 이번 거래 이전까지 남아 있던 미수금. 명세서에 '전잔액·전잔·이월잔액·전월이월·미수금·미수잔액·전기이월' 등으로 적힌 값. 없으면 null
  "balance_total": number|null, // 미수금과 이번 거래를 합친 총잔액. '합계잔액·총잔액·당월잔액·인수잔액·미수합계·잔액' 등. 없으면 null
  "other_amounts": [{"label": string, "amount": number}], // 위 세 항목(이번 청구·전잔액·총잔액)에 해당하지 않는데 금액이 적힌 칸이 있으면 라벨과 값을 그대로. 예: 할인, 반품, 에누리, 선입금, 입금액, 보증금, 공병, 운임, 봉사료, 조정, 연체료, 부가세 별도 표기 등. 없으면 []
  "items_summary": string|null, // 품목을 "품목명 수량" 형태로 쉼표로 이어 한 줄 요약 (예: "코크제로 10BIB 2, 양상추 8BOX")
  "bank": string|null,          // 문서에 인쇄된 입금 계좌의 은행명 (예: 농협). 없으면 null
  "account_no": string|null,    // 계좌번호. 하이픈 포함 인쇄된 그대로. 없으면 null
  "account_holder": string|null // 예금주. 없으면 null
}

미수금 규칙(중요): 거래명세서 하단·우측에는 보통 '전잔액 / 당월매출 / 합계잔액(또는 입금액·잔액)'이 한 줄로 인쇄돼 있다.
- amount 에는 이번 거래분만, prev_balance 에는 이전 미수금만, balance_total 에는 둘을 합친 잔액을 넣는다.
- 셋 중 둘만 보이면 보이는 것만 넣고 나머지는 null (직접 계산해서 채우지 말 것).
- 이번 거래분이 0원이고 미수금만 청구하는 명세서일 수도 있다. 그때 amount 는 0.
- 표에 있는 값을 그대로 읽되, 라벨이 없으면 억지로 추측하지 말고 null.

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
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0,
      // 2.5 계열은 기본 '생각(thinking)' 모드라 응답이 수 초 느려짐 — JSON 추출엔 불필요하므로 끔.
      // (2.0 계열은 이 옵션을 무시하므로 폴백에도 안전)
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
    brand: raw.brand === 'staffmeal' || raw.brand === 'garden' ? raw.brand : null,
    vendor_name: str(raw.vendor_name),
    doc_date: str(raw.doc_date),
    amount: num(raw.amount),
    prev_balance: num(raw.prev_balance),
    balance_total: num(raw.balance_total),
    other_amounts: Array.isArray(raw.other_amounts)
      ? (raw.other_amounts as unknown[])
          .map((o) => {
            const r = o as Record<string, unknown>;
            return { label: str(r.label) ?? '', amount: num(r.amount) };
          })
          .filter((o): o is { label: string; amount: number } => !!o.label && o.amount != null)
          .slice(0, 8)
      : [],
    items_summary: str(raw.items_summary),
    bank: str(raw.bank),
    account_no: str(raw.account_no),
    account_holder: str(raw.account_holder),
  };
}
