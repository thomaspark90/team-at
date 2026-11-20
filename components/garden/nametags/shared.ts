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
