// 쿠팡 신용카드 매출전표(PDF) 파서 — 페이지마다 주문(품목) 1건.
// 승인번호로 카드 거래에 조인해, 쿠팡 lump을 품목별로 분해·분류하기 위한 데이터.
import { extractText, getDocumentProxy } from 'unpdf';

export interface ReceiptItem {
  approvalNo: string; // 승인번호 — 카드 거래 조인 키
  txAt: string; // ISO datetime
  ymd: string; // YYYY-MM-DD
  product: string; // 상품명(분류 단서)
  seller: string; // 판매자상호(분류 단서)
  amount: number; // 합계금액
  installment: boolean;
}

const g = (t: string, re: RegExp): string | null => {
  const m = re.exec(t);
  return m ? m[1].trim() : null;
};

function parsePage(t: string): ReceiptItem | null {
  const approvalNo = g(t, /승인번호\s+(\d+)/);
  const dt = /거래일시\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})/.exec(t);
  const amtRaw = g(t, /합계금액\s+([\d,]+)원/);
  if (!approvalNo || !dt || !amtRaw) return null;
  const [, Y, Mo, D, hms] = dt;
  const prodRaw = g(t, /상품명\s+([\s\S]+?)\s*과세금액/);
  const product = prodRaw ? prodRaw.replace(/\s+/g, ' ').trim() : '';
  const seller = (g(t, /판매자상호\s+(.+)/) ?? '').replace(/\s+/g, ' ').trim();
  const use = g(t, /할부개월\s+(\S+)/) ?? '';
  return {
    approvalNo,
    txAt: `${Y}-${Mo}-${D}T${hms}`,
    ymd: `${Y}-${Mo}-${D}`,
    product,
    seller,
    amount: Number(amtRaw.replace(/,/g, '')) || 0,
    installment: /할부/.test(use),
  };
}

export async function parseReceiptPdf(data: Uint8Array): Promise<ReceiptItem[]> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const items: ReceiptItem[] = [];
  for (const p of pages) {
    const it = parsePage(p);
    if (it) items.push(it);
  }
  return items;
}

// 승인번호별로 묶는다(한 결제=한 승인번호에 품목 여러 개 가능).
export function groupByApproval(items: ReceiptItem[]): Map<string, ReceiptItem[]> {
  const m = new Map<string, ReceiptItem[]>();
  for (const it of items) {
    const arr = m.get(it.approvalNo) ?? [];
    arr.push(it);
    m.set(it.approvalNo, arr);
  }
  return m;
}
