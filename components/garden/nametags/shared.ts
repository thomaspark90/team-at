import { oneLine, sheetCount, tagTotal, type NametagCatalog, type NametagContact, type NametagRequest } from '@/lib/garden/nametags';

export const API = '/api/garden-nametags';

export type NametagData = { catalog: NametagCatalog; requests: NametagRequest[]; recipients: NametagContact[]; canManage: boolean; me: string };

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** fetch → JSON. 실패하면 { error } 로 통일한다. */
export async function call<T>(url: string, init?: RequestInit): Promise<T | { error: string }> {
  const r = await fetch(url, { cache: 'no-store', ...init }).catch(() => null);
  const j = await r?.json().catch(() => null);
  if (!r?.ok || !j || j.error) return { error: j?.error ?? '연결을 확인해 주세요.' };
  return j as T;
}

export const failed = (v: unknown): v is { error: string } => typeof v === 'object' && v !== null && 'error' in v;

export const nameOf = (email: string) => email.split('@')[0];

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** "8종 9장 · A4 1장" */
export function summaryOf(lines: { qty: number }[]) {
  const total = tagTotal(lines);
  return `${lines.length}종 ${total}장 · A4 ${sheetCount(total)}장`;
}

export const lineLabel = (l: { ko: string; qty: number }) => `${oneLine(l.ko)}${l.qty > 1 ? ` ×${l.qty}` : ''}`;

// ── 글자만으로 구분하는 화면 규칙(2026-11-20 대표 결정) ──
// 네임택 화면은 버튼 상자·카드·칩을 쓰지 않는다. 누를 수 있는 것은 밑줄, 주 행동은 굵게, 입력칸은 아랫줄 하나.
const UL = 'underline underline-offset-[6px]';
/** 주 행동 — 굵게 + 또렷한 밑줄 (화면·덩어리당 하나) */
export const ACT = `text-body font-medium text-foreground ${UL} decoration-[1.5px] disabled:opacity-40`;
/** 보조 행동 — 회색 글자 + 옅은 밑줄 */
export const ACT_SUB = `text-body text-muted-foreground ${UL} decoration-border hover:text-foreground disabled:opacity-40`;
/** 입력칸 — 상자 없이 아랫줄만 */
export const FIELD = 'border-b border-border bg-transparent pb-2 text-body text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground';
/** 고르는 선택지(둘 중 하나) — 고른 쪽만 굵게 + 밑줄 */
export const choice = (on: boolean) => (on ? `text-body font-medium text-foreground ${UL} decoration-[1.5px]` : 'text-body text-muted-foreground');
