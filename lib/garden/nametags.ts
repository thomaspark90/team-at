// 브런치 네임택 — 뷔페 메뉴 이름표(90×50mm). 스탭이 필요한 메뉴만 골라 프린트를 요청하고,
// 그래픽 담당이 일러스트 스크립트로 A4(2×5칸)에 모아 뽑는다. 클라이언트·서버 공용(순수 함수만).

/** menu = 한글명/영문명/설명 3단(좌측 정렬) · notice = 가운데 정렬 안내(한글+영문) · big = 가운데 정렬 큰 안내(한글만) */
export type NametagKind = 'menu' | 'notice' | 'big';
export const NAMETAG_KINDS: { id: NametagKind; label: string }[] = [
  { id: 'menu', label: '메뉴' },
  { id: 'notice', label: '안내(가운데)' },
  { id: 'big', label: '큰 안내(한글만)' },
];

export type NametagCategory = { id: string; label: string };
export type NametagItem = {
  id: string;
  category: string;
  kind: NametagKind;
  ko: string; // 줄바꿈(\n) 허용 — big 은 두 줄까지
  en: string;
  desc: string; // 줄바꿈(\n) 허용 — 세 줄까지
  order: number;
};
export type NametagCatalog = { categories: NametagCategory[]; items: NametagItem[]; updatedAt?: string };

/** 요청 시점의 문구를 그대로 담는다 — 이후 메뉴를 고쳐도 이미 보낸 요청은 바뀌지 않는다. */
export type NametagLine = Pick<NametagItem, 'kind' | 'ko' | 'en' | 'desc'> & { itemId: string; qty: number };
export type NametagRequest = {
  id: string;
  createdAt: string;
  by: string; // 요청자 이메일
  note?: string;
  lines: NametagLine[];
  status: 'requested' | 'done';
  doneAt?: string;
  doneBy?: string;
  /** 요청 알림을 받은 담당자(보낸 시점 기준) — 스탭이 누구에게 갔는지, 어디로 연락할지 알 수 있게 */
  sentTo?: NametagContact[];
  /** 인쇄물 수령 방법 — 인쇄 완료 때 그래픽 담당이 고른다 */
  delivery?: NametagDelivery;
  deliveryNote?: string;
  doneByContact?: NametagContact;
};

/** 담당자 표시 정보 — 이름·연락처는 가든 설정에서 입력한다(비어 있으면 이메일 앞부분만 보인다). */
export type NametagContact = { email: string; name: string; phone: string };

/** direct = 인쇄한 사람이 매장에 직접 전달 · other = 다른 사람 편에 보낸다(누구인지는 메모에) */
export type NametagDelivery = 'direct' | 'other';
export const DELIVERY_OPTIONS: { id: NametagDelivery; label: string }[] = [
  { id: 'direct', label: '제가 직접 전달할게요' },
  { id: 'other', label: '다른 분이 전달해요' },
];

export const contactName = (c: { email: string; name?: string }) => c.name?.trim() || c.email.split('@')[0];

/** 전화번호 정리 — 숫자·하이픈·+·공백만 남긴다. */
export const cleanPhone = (v: unknown) => (typeof v === 'string' ? v : '').replace(/[^0-9+\- ]/g, '').trim().slice(0, 20);

/** 완료 알림·화면에 쓰는 수령 안내 한 줄 — "홍길동님이 직접 전달합니다" */
export function deliveryText(r: Pick<NametagRequest, 'delivery' | 'deliveryNote' | 'doneBy' | 'doneByContact'>): string {
  const who = r.doneByContact ? contactName(r.doneByContact) : r.doneBy ? r.doneBy.split('@')[0] : '';
  const base = r.delivery === 'direct' ? `${who ? `${who}님이 ` : ''}직접 전달합니다` : r.delivery === 'other' ? '다른 분이 전달합니다' : '';
  return [base, r.deliveryNote].filter(Boolean).join(' · ');
}

/** 일러스트 스크립트에 넘기는 택 1칸 */
export type NametagTag = { k: NametagKind; ko: string; en: string; desc: string };

export const TAGS_PER_SHEET = 10; // A4 한 장 = 2열 × 5행
export const MAX_QTY = 10; // 한 메뉴를 한 번에 요청할 수 있는 장수
export const MAX_LINES = 100;

export const sheetCount = (tags: number) => Math.ceil(tags / TAGS_PER_SHEET);
export const tagTotal = (lines: { qty: number }[]) => lines.reduce((n, l) => n + l.qty, 0);

/** 요청 줄 → 인쇄 칸. 수량만큼 같은 택을 이어 붙인다. */
export function expandLines(lines: NametagLine[]): NametagTag[] {
  return lines.flatMap((l) => Array.from({ length: l.qty }, () => ({ k: l.kind, ko: l.ko, en: l.en, desc: l.desc })));
}

const cleanLines = (v: unknown, maxLines: number, maxLen: number) =>
  (typeof v === 'string' ? v : '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n')
    .slice(0, maxLen);

/** 입력값 정리 — 오류면 문구(string). id·order 는 호출부가 정한다. */
export function sanitizeItem(b: Record<string, unknown>): Pick<NametagItem, 'kind' | 'ko' | 'en' | 'desc'> | string {
  const kind = NAMETAG_KINDS.some((k) => k.id === b.kind) ? (b.kind as NametagKind) : 'menu';
  const ko = cleanLines(b.ko, kind === 'big' ? 2 : 1, 60);
  if (!ko) return '한글 이름을 적어주세요.';
  return {
    kind,
    ko,
    en: kind === 'big' ? '' : cleanLines(b.en, 1, 80),
    desc: kind === 'menu' ? cleanLines(b.desc, 3, 160) : '',
  };
}

/** 카테고리 순서대로 묶기 — 목록에 없는 카테고리에 속한 메뉴는 맨 뒤 '기타'. */
export function groupByCategory(catalog: NametagCatalog): { category: NametagCategory; items: NametagItem[] }[] {
  const sorted = [...catalog.items].sort((a, b) => a.order - b.order || a.ko.localeCompare(b.ko, 'ko'));
  const known = new Set(catalog.categories.map((c) => c.id));
  const groups = catalog.categories.map((category) => ({ category, items: sorted.filter((i) => i.category === category.id) }));
  const orphans = sorted.filter((i) => !known.has(i.category));
  if (orphans.length) groups.push({ category: { id: '_etc', label: '기타' }, items: orphans });
  return groups.filter((g) => g.items.length > 0);
}

export const oneLine = (s: string) => s.replace(/\n/g, ' ');
